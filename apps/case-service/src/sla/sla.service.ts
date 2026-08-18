import { InjectQueue } from '@nestjs/bullmq';
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, SlaClockState, SlaExceptionalGround, SlaStage } from '@prisma/client';
import { Queue } from 'bullmq';
import { TenantContext } from '../common/guards/tenant.guard';
import { PrismaService } from '../config/prisma.service';
import { QUEUE } from '../queue/queue.constants';
import {
  dueDateAfterResume,
  dueDateFor,
  remainingWorkingDays,
  type SlaTarget,
} from './sla.calculator';
import { UnverifiedHolidayYearError } from './working-days';

/** Live states — a clock in either is still the firm's problem. */
const LIVE: SlaClockState[] = [SlaClockState.RUNNING, SlaClockState.PAUSED];

/**
 * States a clock can still be discharged from.
 *
 * A breached clock is one of them. Missing a deadline does not end the
 * obligation — the report is still owed — and until this included BREACHED,
 * delivering late left `stoppedAt` null forever, so the record could not
 * distinguish *late but delivered* from *still outstanding*. That is precisely
 * the number an insurer asks about, and the firm was unable to answer it.
 */
const STOPPABLE: SlaClockState[] = [...LIVE, SlaClockState.BREACHED];

/**
 * SLA clocks: starting, pausing, stopping and reporting turnaround deadlines.
 *
 * A clock is evidence, not a reminder. PD 12.5 requires turnaround per an
 * internal policy honouring the CSP timelines, and s.146 allows BNM to examine
 * without notice — so what matters is that every deadline has a persisted start,
 * a computed due date, and a recorded outcome, whether met or breached.
 *
 * Deliberately fail-soft at the *claim lifecycle* boundary: if a clock cannot be
 * started, the claim transition that triggered it still succeeds and the failure
 * is logged loudly. Blocking an adjuster from progressing a claim because a
 * deadline could not be recorded would be a worse outcome than a missing clock,
 * and the missing clock is visible in the SLA listing.
 */
@Injectable()
export class SlaService {
  private readonly logger = new Logger(SlaService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(QUEUE.SLA) private readonly slaQueue: Queue
  ) {}

  /**
   * Resolve the applicable policy: the insurer's own override if configured,
   * otherwise the platform default. This is what lets each panel insurer carry
   * different targets without a code change.
   *
   * `fastTracked` asks for the tenant's fast-track row (§2.4's shorter
   * promise) — tenant rows only, never a platform default, because a shorter
   * turnaround is a commercial commitment made per insurer. A tenant with no
   * fast-track row falls back to its standard resolution: absent means "the
   * ordinary target applies", the same refuse-don't-default posture as the
   * fast track itself.
   */
  async resolvePolicy(stage: SlaStage, tenantId?: string | null, fastTracked = false) {
    const candidates = await this.prisma.slaPolicy.findMany({
      where: {
        stage,
        isActive: true,
        OR: [{ tenantId: tenantId ?? undefined }, { tenantId: null }],
      },
    });

    if (fastTracked && tenantId) {
      const fastRow = candidates.find(
        policy => policy.tenantId === tenantId && policy.fastTrack
      );
      if (fastRow) return fastRow;
    }

    // A tenant-specific row always wins over the platform default.
    const standard = candidates.filter(policy => !policy.fastTrack);
    return (
      standard.find(policy => tenantId && policy.tenantId === tenantId) ??
      standard.find(policy => policy.tenantId === null) ??
      null
    );
  }

  /**
   * Did this claim take the small-claims fast track, and is it still on it?
   *
   * Both conditions matter. The decision row says the fast track *fired*; the
   * claim's current mode says it *held* — a claim escalated off DESK_REVIEW
   * mid-flight lost the fast track, and its shorter promise with it (§2.4:
   * mode changes are the escape hatch, and an escalated claim needs the full
   * window, not the discounted one).
   */
  private async isFastTracked(claimId: string): Promise<boolean> {
    const claim = await this.prisma.claim.findUnique({
      where: { id: claimId },
      select: { assessmentMode: true },
    });
    if (claim?.assessmentMode !== 'DESK_REVIEW') return false;
    const latest = await this.prisma.assessmentModeDecision.findFirst({
      where: { claimId },
      orderBy: { createdAt: 'desc' },
      select: { fastTracked: true },
    });
    return Boolean(latest?.fastTracked);
  }

  private targetOf(policy: {
    workingDays: number;
    warnWorkingDaysBefore: number;
    calendarState: string | null;
  }): SlaTarget {
    return {
      workingDays: policy.workingDays,
      warnWorkingDaysBefore: policy.warnWorkingDaysBefore,
      calendarState: policy.calendarState,
    };
  }

  /**
   * Start a clock against an assignment.
   *
   * Separate entry point because the acknowledgement obligation falls due before
   * any claim exists — the reason it could not be measured at all until
   * `Assignment` was introduced.
   */
  async startForAssignment(
    assignmentId: string,
    stage: SlaStage,
    options: { tenantId?: string | null; startedAt?: Date } = {}
  ) {
    return this.startFor({ assignmentId }, stage, options);
  }

  /** Stop an assignment's clock — acknowledged, or declined; both answer the insurer. */
  async stopForAssignment(assignmentId: string, stage: SlaStage, at: Date = new Date()) {
    return this.stopFor({ assignmentId }, stage, at);
  }

  /**
   * Start a clock for a claim and stage.
   *
   * Idempotent: if a live clock already exists for this stage it is returned
   * unchanged rather than duplicated, so a retried transition or a replayed job
   * cannot restart a deadline that is already running. The database enforces
   * this too (partial unique index), so a race loses cleanly.
   */
  async start(
    claimId: string,
    stage: SlaStage,
    options: { tenantId?: string | null; startedAt?: Date } = {}
  ) {
    return this.startFor({ claimId }, stage, options);
  }

  /** Shared implementation over whichever subject the clock hangs on. */
  private async startFor(
    subject: { claimId?: string; assignmentId?: string },
    stage: SlaStage,
    options: { tenantId?: string | null; startedAt?: Date } = {}
  ) {
    const existing = await this.prisma.slaClock.findFirst({
      where: { ...subject, stage, state: { in: LIVE } },
    });
    if (existing) return existing;

    const label = subject.claimId ?? subject.assignmentId ?? 'unknown';
    // The fast-track profile applies to the final-report promise alone — the
    // ack and preliminary obligations are the CSP's, not the commercial deal's
    // — and is resolved here rather than by callers, so no start site can
    // forget to ask.
    const fastTracked =
      stage === SlaStage.FINAL_REPORT && subject.claimId
        ? await this.isFastTracked(subject.claimId)
        : false;
    const policy = await this.resolvePolicy(stage, options.tenantId, fastTracked);
    if (!policy) {
      this.logger.warn(`No SLA policy for ${stage}; no clock started for ${label}`);
      return null;
    }

    const startedAt = options.startedAt ?? new Date();
    const dueAt = dueDateFor(startedAt, this.targetOf(policy));

    try {
      const clock = await this.prisma.slaClock.create({
        data: { ...subject, stage, policyId: policy.id, startedAt, dueAt },
      });
      this.logger.log(
        `${stage} clock started for ${label}, due ${dueAt.toISOString().slice(0, 10)}`
      );
      return clock;
    } catch (error) {
      // Lost the race against a concurrent start — adopt the winner's clock.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        return this.prisma.slaClock.findFirst({
          where: { ...subject, stage, state: { in: LIVE } },
        });
      }
      throw error;
    }
  }

  /**
   * Record an exceptional circumstance against a running clock (CSP 10.13).
   *
   * The policy document lets the standard window give way for complex claims,
   * catastrophe losses and suspected fraud — and until this existed the
   * system could not say so. A flood surge, which is precisely the event this
   * book is most exposed to (§2.5), would have shown as mass firm failure:
   * every clock breaching, every claim escalating, and no way to evidence
   * that the PD excused the delay. The dashboard would have been wrong in the
   * direction that costs a firm its panel.
   *
   * Three deliberate constraints, because relief a firm grants itself is the
   * kind an examiner reads hardest:
   *
   *  - **Never automatic.** A person names the ground and gives a reason.
   *    Inferring "this looks like a CAT" and extending silently would be the
   *    firm marking its own homework.
   *  - **Bounded.** The extension is a number of working days someone chose,
   *    not an open-ended suspension — a clock always has a deadline to answer
   *    to, which is the whole point of measuring turnaround.
   *  - **Once.** A clock already carrying a ground is not extended again;
   *    a second extension is a new decision, and repeatedly buying time in
   *    small increments is how a deadline quietly stops meaning anything.
   */
  async recordExceptionalCircumstance(
    claimId: string,
    stage: SlaStage,
    input: {
      ground: SlaExceptionalGround;
      reason: string;
      workingDays: number;
      userId: string | null;
    }
  ) {
    const clock = await this.prisma.slaClock.findFirst({
      where: { claimId, stage, state: { in: LIVE } },
      include: { policy: true },
    });
    if (!clock) return null;
    if (clock.exceptionalGround) {
      throw new BadRequestException(
        'This clock already carries an exceptional circumstance. Recording a second ' +
          'is a fresh decision, not an adjustment of the first.'
      );
    }
    if (!Number.isInteger(input.workingDays) || input.workingDays < 1 || input.workingDays > 60) {
      throw new BadRequestException('An extension must be between 1 and 60 working days.');
    }
    if (input.reason.trim().length < 8) {
      throw new BadRequestException(
        'A reason is required — it is what makes the extension explicable later.'
      );
    }

    const dueAt = dueDateFor(clock.dueAt, {
      ...this.targetOf(clock.policy),
      workingDays: input.workingDays,
    });

    const updated = await this.prisma.slaClock.update({
      where: { id: clock.id },
      data: {
        dueAt,
        exceptionalGround: input.ground,
        exceptionalReason: input.reason.trim(),
        exceptionalAt: new Date(),
        exceptionalByUserId: input.userId,
        exceptionalWorkingDays: input.workingDays,
        // A clock already past its old deadline returns to running: the
        // breach was measured against a window the PD did not require.
        state: SlaClockState.RUNNING,
        breachedAt: null,
        warnedAt: null,
      },
    });

    this.logger.log(
      `${stage} clock on ${claimId}: ${input.ground} recorded, ` +
        `+${input.workingDays} working days → ${dueAt.toISOString().slice(0, 10)}`
    );
    return updated;
  }

  /**
   * Pause a running clock — the firm is waiting on someone else.
   *
   * The remaining working days are banked so resuming grants that time again
   * from the resume date. Nothing is banked for a clock already paused.
   */
  async pause(claimId: string, stage: SlaStage, reason: string, at: Date = new Date()) {
    const clock = await this.prisma.slaClock.findFirst({
      where: { claimId, stage, state: SlaClockState.RUNNING },
      include: { policy: true },
    });
    if (!clock) return null;

    const remaining = remainingWorkingDays(at, clock.dueAt, this.targetOf(clock.policy));

    return this.prisma.slaClock.update({
      where: { id: clock.id },
      data: {
        state: SlaClockState.PAUSED,
        pausedAt: at,
        remainingWorkingDaysAtPause: remaining,
        pauseReason: reason,
      },
    });
  }

  /** Resume a paused clock, recomputing the deadline from the remaining days. */
  async resume(claimId: string, stage: SlaStage, at: Date = new Date()) {
    const clock = await this.prisma.slaClock.findFirst({
      where: { claimId, stage, state: SlaClockState.PAUSED },
      include: { policy: true },
    });
    if (!clock) return null;

    const dueAt = dueDateAfterResume(
      at,
      clock.remainingWorkingDaysAtPause ?? 0,
      this.targetOf(clock.policy)
    );

    return this.prisma.slaClock.update({
      where: { id: clock.id },
      data: {
        state: SlaClockState.RUNNING,
        pausedAt: null,
        remainingWorkingDaysAtPause: null,
        pauseReason: null,
        dueAt,
        // A resumed clock gets a fresh chance to warn against the new deadline.
        warnedAt: null,
      },
    });
  }

  /**
   * Stop a clock because the obligation was discharged.
   *
   * The outcome is recorded as MET or BREACHED from the actual completion time,
   * so a late completion is not quietly recorded as a success. A clock the
   * sweeper already marked BREACHED stays BREACHED — the history of a missed
   * deadline is not erased by eventually doing the work.
   */
  async stop(claimId: string, stage: SlaStage, at: Date = new Date()) {
    return this.stopFor({ claimId }, stage, at);
  }

  private async stopFor(
    subject: { claimId?: string; assignmentId?: string },
    stage: SlaStage,
    at: Date
  ) {
    const clock = await this.prisma.slaClock.findFirst({
      where: { ...subject, stage, state: { in: STOPPABLE } },
    });
    if (!clock) return null;

    // Already breached stays breached: the deadline *was* missed, and
    // discharging the obligation later must not rewrite that. What it does
    // record is that the work was finally delivered, and when.
    const late = clock.state === SlaClockState.BREACHED || at.getTime() > clock.dueAt.getTime();

    return this.prisma.slaClock.update({
      where: { id: clock.id },
      data: {
        state: late ? SlaClockState.BREACHED : SlaClockState.MET,
        stoppedAt: at,
        breachedAt: clock.breachedAt ?? (late ? at : null),
      },
    });
  }

  /** Every clock for a claim, newest first — the per-claim SLA history. */
  async forClaim(claimId: string, tenantContext?: TenantContext) {
    if (tenantContext) {
      const claim = await this.prisma.claim.findUnique({
        where: { id: claimId },
        select: { id: true, tenantId: true },
      });
      // Confirming a claim exists in another tenant is itself a disclosure,
      // so absence and refusal are answered identically — see the quantum service.
      if (!claim) throw new NotFoundException('Claim not found');
      if (claim.tenantId !== tenantContext.tenantId && tenantContext.userRole !== 'SUPER_ADMIN') {
        throw new NotFoundException('Claim not found');
      }
    }

    return this.prisma.slaClock.findMany({
      where: { claimId },
      include: { policy: true },
      orderBy: { startedAt: 'desc' },
    });
  }

  /**
   * Clocks that are live and past due, or approaching it. Read by the sweeper.
   * `monitorOnly` policies are included: an insurer-side delay still needs
   * measuring, it just must not escalate against the firm.
   */
  async dueOrApproaching(now: Date = new Date()) {
    return this.prisma.slaClock.findMany({
      where: { state: SlaClockState.RUNNING },
      include: {
        policy: true,
        claim: { select: { claimNumber: true, tenantId: true } },
        assignment: { select: { externalRef: true, handlingTenantId: true } },
      },
      orderBy: { dueAt: 'asc' },
      take: 500,
    });
  }

  /**
   * Start a clock without letting a failure break the caller's transaction.
   *
   * Used from claim lifecycle transitions. The unverified-holiday case is called
   * out separately because it is configuration the operator can fix, not a bug.
   */
  async startQuietly(claimId: string, stage: SlaStage, tenantId?: string | null) {
    try {
      return await this.start(claimId, stage, { tenantId });
    } catch (error) {
      if (error instanceof UnverifiedHolidayYearError) {
        this.logger.error(
          `${stage} clock NOT started for claim ${claimId}: ${error.message}`
        );
      } else {
        this.logger.error(
          `${stage} clock NOT started for claim ${claimId}`,
          error instanceof Error ? error.stack : String(error)
        );
      }
      return null;
    }
  }

  /** Same fail-soft contract as startQuietly, for the pause/resume/stop calls. */
  async runQuietly<T>(description: string, action: () => Promise<T>): Promise<T | null> {
    try {
      return await action();
    } catch (error) {
      this.logger.error(
        `SLA ${description} failed`,
        error instanceof Error ? error.stack : String(error)
      );
      return null;
    }
  }

  /**
   * Insurer-side MI: how each panel insurer performs against the CSP windows
   * the firm measures but does not own (decision 7wd, payment 14wd).
   *
   * This is the evidence that a delay originated with the insurer — measured,
   * never escalated against the firm (the monitorOnly design), and now
   * reportable per insurer.
   */
  async insurerMi() {
    const clocks = await this.prisma.slaClock.findMany({
      where: { policy: { monitorOnly: true } },
      include: {
        policy: { select: { stage: true } },
        claim: { select: { insurerTenantId: true, insurerTenant: { select: { name: true } } } },
      },
    });

    const byInsurer = new Map<string, { name: string; stages: Record<string, { met: number; breached: number; running: number }> }>();
    for (const clock of clocks) {
      const insurerId = clock.claim?.insurerTenantId ?? 'unattributed';
      const name = clock.claim?.insurerTenant?.name ?? '(no insurer on claim)';
      const entry = byInsurer.get(insurerId) ?? { name, stages: {} };
      const stage = (entry.stages[clock.policy.stage] ??= { met: 0, breached: 0, running: 0 });
      if (clock.state === 'MET') stage.met += 1;
      else if (clock.state === 'BREACHED') stage.breached += 1;
      else stage.running += 1;
      byInsurer.set(insurerId, entry);
    }

    return [...byInsurer.entries()].map(([insurerTenantId, entry]) => ({
      insurerTenantId,
      insurerName: entry.name,
      stages: entry.stages,
    }));
  }

  /** Schedule the recurring sweep. Idempotent — BullMQ dedupes by job key. */
  async scheduleSweep() {
    await this.slaQueue.add(
      'sweep',
      {},
      {
        repeat: { pattern: '*/15 * * * *' },
        jobId: 'sla-sweep',
        removeOnComplete: { count: 100 },
      }
    );
    this.logger.log('SLA sweep scheduled every 15 minutes');
  }
}
