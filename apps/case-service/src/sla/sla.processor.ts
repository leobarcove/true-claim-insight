import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { SlaClockState } from '@prisma/client';
import type { Job } from 'bullmq';
import { PrismaService } from '../config/prisma.service';
import { QUEUE } from '../queue/queue.constants';
import { ComplianceEventsService } from '../compliance/compliance-events.service';
import { slaBreachEvent } from '../compliance/compliance-triggers';
import { escalationLevelFor, isBreached, remainingWorkingDays, shouldWarn } from './sla.calculator';
import { SlaService } from './sla.service';

/**
 * The sweep that makes deadlines real.
 *
 * Without this, a `dueAt` column is a decoration: nothing notices a passed
 * deadline, and PD 12.5 turnaround tracking is the false comfort of §3.6. The
 * sweep runs every 15 minutes, marks breaches, escalates ageing ones, and fires
 * a single due-soon warning per clock.
 *
 * Each clock is handled independently — one claim whose calendar year lacks
 * gazetted holidays must not stop the sweep from evaluating every other claim.
 */
@Processor(QUEUE.SLA)
export class SlaProcessor extends WorkerHost {
  private readonly logger = new Logger(SlaProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sla: SlaService,
    private readonly compliance: ComplianceEventsService
  ) {
    super();
  }

  async process(job: Job): Promise<{ evaluated: number; breached: number; warned: number }> {
    if (job.name !== 'sweep') {
      this.logger.warn(`Unknown SLA job "${job.name}" ignored`);
      return { evaluated: 0, breached: 0, warned: 0 };
    }

    const now = new Date();
    const clocks = await this.sla.dueOrApproaching(now);
    let breached = 0;
    let warned = 0;

    for (const clock of clocks) {
      // A clock hangs on a claim or an assignment, never both. Label it by
      // whichever it has, so an acknowledgement breach is as readable as a
      // report breach rather than showing as "undefined".
      const subject =
        clock.claim?.claimNumber ?? `assignment ${clock.assignment?.externalRef ?? clock.id}`;

      try {
        const target = {
          workingDays: clock.policy.workingDays,
          warnWorkingDaysBefore: clock.policy.warnWorkingDaysBefore,
          calendarState: clock.policy.calendarState,
        };

        if (isBreached(now, clock.dueAt)) {
          const daysLate = Math.abs(remainingWorkingDays(now, clock.dueAt, target));
          const level = escalationLevelFor(daysLate);

          // Only write when something actually changed, so the sweep does not
          // churn rows every 15 minutes for a long-standing breach.
          if (clock.state !== SlaClockState.BREACHED || clock.escalationLevel !== level) {
            await this.prisma.slaClock.update({
              where: { id: clock.id },
              data: {
                state: SlaClockState.BREACHED,
                breachedAt: clock.breachedAt ?? now,
                escalationLevel: level,
              },
            });
            breached += 1;

            // monitorOnly stages are the insurer's delay, not the firm's: they
            // are measured for management information and never escalated as a
            // failing of the adjusting firm.
            const owner = clock.policy.monitorOnly ? 'INSURER-SIDE' : 'FIRM';
            this.logger.warn(
              `SLA BREACH [${owner}] ${clock.stage} on ${subject}: ` +
                `${daysLate} working day(s) late, escalation level ${level}`
            );

            // Level 3 is where PD 11.2(d) Board escalation attaches. Idempotent
            // by clock id, so repeat sweeps observe the same breach once.
            const draft = slaBreachEvent({
              id: clock.id,
              stage: clock.stage,
              escalationLevel: level,
              monitorOnly: clock.policy.monitorOnly,
              claimNumber: clock.claim?.claimNumber ?? null,
            });
            if (draft) {
              await this.compliance.raiseQuietly({
                ...draft,
                claimId: clock.claimId ?? undefined,
                source: 'sla-sweep',
              });
            }
          }
          continue;
        }

        if (shouldWarn(now, clock.dueAt, target, Boolean(clock.warnedAt))) {
          await this.prisma.slaClock.update({
            where: { id: clock.id },
            data: { warnedAt: now },
          });
          warned += 1;
          this.logger.log(
            `SLA due soon: ${clock.stage} on ${subject}, ` +
              `${remainingWorkingDays(now, clock.dueAt, target)} working day(s) remaining`
          );
        }
      } catch (error) {
        // Per-clock isolation. A claim in an unverified holiday year, or any
        // other bad row, must not prevent the rest of the sweep from running.
        this.logger.error(
          `SLA sweep skipped clock ${clock.id} (${clock.stage}, ${subject})`,
          error instanceof Error ? error.message : String(error)
        );
      }
    }

    if (breached || warned) {
      this.logger.log(`SLA sweep: ${clocks.length} evaluated, ${breached} breached, ${warned} warned`);
    }

    return { evaluated: clocks.length, breached, warned };
  }
}
