import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  AssessmentMode,
  EscalationTrigger,
  Prisma,
  SignalSeverity,
  TravelClaimType,
} from '@prisma/client';

import { evidenceSubtypeFilter, resolveRequirements } from '../claims/evidence-requirements';
import { AuditService } from '../common/audit/audit.service';
import { TenantContext } from '../common/guards/tenant.guard';
import { PrismaService } from '../config/prisma.service';
import { fastTrackPolicy, inspectionPolicy } from '../tenant/tenant-settings';
import {
  describeMode,
  escalateMode,
  resolveAssessmentMode,
  type ModeDecision,
} from './assessment-mode';

/** Signals at or above this severity block the fast track. */
const BLOCKING_SEVERITIES: SignalSeverity[] = ['MEDIUM', 'HIGH', 'CRITICAL'];

@Injectable()
export class AssessmentService {
  private readonly logger = new Logger(AssessmentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService
  ) {}

  /**
   * Decide how a claim will be assessed.
   *
   * Called when a claim opens, and again whenever something the router reads
   * has changed. Idempotent in effect: deciding the same mode twice records the
   * second decision only if the reasons differ, so re-running the router does
   * not fill the history with identical rows.
   */
  async decide(claimId: string, tenantContext: TenantContext): Promise<ModeDecision> {
    const claim = await this.loadClaim(claimId, tenantContext);

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: claim.tenantId ?? tenantContext.tenantId },
      select: { settings: true },
    });

    // MEDIUM and above only. An INFO-level signal is context for the adjuster,
    // not grounds to spend a site visit.
    const blockingSignals = await this.prisma.fraudSignal.count({
      where: { claimId, severity: { in: BLOCKING_SEVERITIES } },
    });

    const evidenceComplete = await this.isEvidenceComplete(claimId);

    const decision = resolveAssessmentMode({
      category: claim.category,
      estimatedAmount: claim.estimatedLossAmount,
      hasOpenFraudSignal: blockingSignals > 0,
      evidenceComplete,
      policy: fastTrackPolicy(tenant?.settings),
      inspection: inspectionPolicy(tenant?.settings),
      isMedical: claim.travelClaim?.travelClaimType === TravelClaimType.MEDICAL,
    });

    await this.record(claim, decision, null, tenantContext);
    return decision;
  }

  /**
   * Move a claim up one level, because something changed mid-flight.
   *
   * Escalation is never automatic in the sense of silent: it writes a decision
   * row with the trigger, and the report discloses the level it ended at.
   */
  async escalate(
    claimId: string,
    trigger: EscalationTrigger,
    tenantContext: TenantContext
  ): Promise<ModeDecision & { changed: boolean }> {
    const claim = await this.loadClaim(claimId, tenantContext);
    const current = claim.assessmentMode ?? AssessmentMode.VIDEO;

    const decision = escalateMode(current, trigger);
    if (!decision.changed) {
      this.logger.log(`Claim ${claimId} already at ${current}; no escalation recorded`);
      return decision;
    }

    await this.record(claim, decision, trigger, tenantContext);
    return decision;
  }

  /** The current mode and the decision that set it. */
  async current(claimId: string, tenantContext: TenantContext) {
    const claim = await this.loadClaim(claimId, tenantContext);
    const latest = await this.prisma.assessmentModeDecision.findFirst({
      where: { claimId },
      orderBy: { createdAt: 'desc' },
    });
    return { mode: claim.assessmentMode, decision: latest };
  }

  /** Every decision, newest first — how the claim came to be assessed this way. */
  async history(claimId: string, tenantContext: TenantContext) {
    await this.loadClaim(claimId, tenantContext);
    return this.prisma.assessmentModeDecision.findMany({
      where: { claimId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** The methodology prose for the report's PD 12.6 section. */
  async disclosure(claimId: string): Promise<string | null> {
    const latest = await this.prisma.assessmentModeDecision.findFirst({
      where: { claimId },
      orderBy: { createdAt: 'desc' },
    });
    if (!latest) return null;
    return describeMode(latest.mode, latest.reasons);
  }

  private async record(
    claim: { id: string; tenantId: string | null; assessmentMode: AssessmentMode | null },
    decision: ModeDecision,
    trigger: EscalationTrigger | null,
    tenantContext: TenantContext
  ) {
    const previous = await this.prisma.assessmentModeDecision.findFirst({
      where: { claimId: claim.id },
      orderBy: { createdAt: 'desc' },
    });

    // Same mode and same reasons is the same decision. Recording it again would
    // make the history longer without making it more informative.
    const unchanged =
      previous &&
      previous.mode === decision.mode &&
      previous.reasons.join('|') === decision.reasons.join('|');

    if (unchanged) return;

    await this.prisma.$transaction([
      this.prisma.assessmentModeDecision.create({
        data: {
          claimId: claim.id,
          tenantId: claim.tenantId ?? tenantContext.tenantId,
          mode: decision.mode,
          trigger,
          fastTracked: decision.fastTracked,
          reasons: decision.reasons,
          decidedByUserId: tenantContext.userId,
        },
      }),
      this.prisma.claim.update({
        where: { id: claim.id },
        data: { assessmentMode: decision.mode },
      }),
    ]);

    await this.audit.record({
      entityType: 'CLAIM',
      entityId: claim.id,
      action: trigger ? 'ASSESSMENT_MODE_ESCALATED' : 'ASSESSMENT_MODE_DECIDED',
      tenantId: claim.tenantId ?? tenantContext.tenantId,
      userId: tenantContext.userId,
      actorId: tenantContext.userId,
      actorType: tenantContext.userRole ?? 'SYSTEM',
      oldValues: previous ? { mode: previous.mode } : undefined,
      newValues: { mode: decision.mode, fastTracked: decision.fastTracked },
      metadata: { trigger, reasons: decision.reasons },
    });

    this.logger.log(
      `Claim ${claim.id} assessment mode ${previous?.mode ?? 'unset'} → ${decision.mode}` +
        (trigger ? ` (${trigger})` : '')
    );
  }

  /**
   * Whether every mandatory evidence requirement has a document.
   *
   * Read here rather than trusted from a flag: the fast track turns on it, and
   * a stale boolean would let a claim skip an interview on evidence that is not
   * actually present.
   *
   * Resolved through the same subtype-scoped rules as the claimant's checklist
   * (`evidence-requirements.ts`). This check once queried by category alone,
   * which measured a travel claim against every subtype's mandatory documents
   * — completeness the claimant could never reach, so the desk-review fast
   * track never fired on the very line it exists for.
   */
  private async isEvidenceComplete(claimId: string): Promise<boolean> {
    const claim = await this.prisma.claim.findUnique({
      where: { id: claimId },
      select: {
        category: true,
        tenantId: true,
        documents: { select: { type: true } },
        travelClaim: { select: { travelClaimType: true } },
      },
    });
    if (!claim) return false;

    const subtypeFilter = evidenceSubtypeFilter(claim.travelClaim?.travelClaimType ?? null);
    const [tenantRows, globalRows] = await Promise.all([
      claim.tenantId
        ? this.prisma.evidenceRequirement.findMany({
            where: { tenantId: claim.tenantId, category: claim.category, ...subtypeFilter },
            select: { documentType: true, travelClaimType: true, isMandatory: true },
          })
        : Promise.resolve([]),
      this.prisma.evidenceRequirement.findMany({
        where: { tenantId: null, category: claim.category, ...subtypeFilter },
        select: { documentType: true, travelClaimType: true, isMandatory: true },
      }),
    ]);

    const mandatory = resolveRequirements(globalRows, tenantRows).filter(row => row.isMandatory);
    if (mandatory.length === 0) return false;

    const held = new Set(claim.documents.map(document => document.type));
    return mandatory.every(requirement => held.has(requirement.documentType));
  }

  private async loadClaim(claimId: string, tenantContext: TenantContext) {
    const claim = await this.prisma.claim.findUnique({
      where: { id: claimId },
      select: {
        id: true,
        tenantId: true,
        category: true,
        estimatedLossAmount: true,
        assessmentMode: true,
        travelClaim: { select: { travelClaimType: true } },
      },
    });

    // Existence check, not an access check — see the quantum service.
    if (!claim) throw new NotFoundException('Claim not found');
    if (claim.tenantId !== tenantContext.tenantId && tenantContext.userRole !== 'SUPER_ADMIN') {
      throw new ForbiddenException('This claim does not belong to your organisation');
    }
    return claim;
  }
}
