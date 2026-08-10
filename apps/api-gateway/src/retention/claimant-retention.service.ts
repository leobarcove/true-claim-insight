import { Injectable, Logger } from '@nestjs/common';

import { AuditService } from '../common/audit/audit.service';
import { PrismaService } from '../config/prisma.service';
import { anonymiseClaimant, canAnonymise } from './anonymisation-rules';

/** How many claimants one sweep will examine. Keeps a nightly job bounded. */
const BATCH = 200;

/**
 * Claimant anonymisation (PD 12.8 + PDPA s.10(2)).
 *
 * Lives in the gateway because `Claimant` is **identity**-context data and the
 * gateway owns it. case-service's retention sweep handles the claims context —
 * documents and case records — and the two halves stay in their owners rather
 * than one service reaching across.
 *
 * This is the destructive half of retention, so it is deliberately conservative:
 * every refusal is cheap and reversible, and every action is not.
 */
@Injectable()
export class ClaimantRetentionService {
  private readonly logger = new Logger(ClaimantRetentionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService
  ) {}

  /**
   * Anonymise every claimant whose retention has fully elapsed.
   *
   * Returns counts rather than throwing on an individual failure: one claimant
   * whose claims are in an odd state must not stop the sweep from protecting
   * everyone else's data.
   */
  async sweep(now: Date = new Date()): Promise<{
    examined: number;
    anonymised: number;
    kept: number;
    failed: number;
  }> {
    const retainYears = await this.retainYears();

    const candidates = await this.prisma.claimant.findMany({
      where: { anonymisedAt: null },
      select: {
        id: true,
        tenantId: true,
        // Cross-context read: permitted, and necessary — eligibility is a fact
        // about the claims, and the identity context cannot decide it alone.
        claims: { select: { closedAt: true, legalHoldAt: true } },
      },
      take: BATCH,
    });

    let anonymised = 0;
    let kept = 0;
    let failed = 0;

    for (const claimant of candidates) {
      const decision = canAnonymise({ claims: claimant.claims, retainYears, now });

      if (!decision.allowed) {
        kept += 1;
        continue;
      }

      try {
        // Audited BEFORE the write. If the update succeeds and the audit fails,
        // identity is destroyed with no record of why — the one ordering that
        // cannot be recovered from.
        await this.audit.record({
          entityType: 'CLAIMANT',
          entityId: claimant.id,
          action: 'CLAIMANT_ANONYMISED',
          tenantId: claimant.tenantId ?? undefined,
          // No old values. The audit trail is append-only and seven years long;
          // copying the identity into it would move the personal data rather
          // than destroy it, which is the opposite of the point.
          newValues: { anonymised: true, claimCount: claimant.claims.length },
          metadata: { basis: decision.basis },
        });

        await this.prisma.claimant.update({
          where: { id: claimant.id },
          data: anonymiseClaimant(now),
        });

        anonymised += 1;
      } catch (error) {
        failed += 1;
        this.logger.error(
          `Claimant ${claimant.id} not anonymised: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    }

    if (anonymised || failed) {
      this.logger.log(
        `Claimant retention sweep: ${candidates.length} examined, ${anonymised} anonymised, ` +
          `${kept} kept, ${failed} failed`
      );
    }

    return { examined: candidates.length, anonymised, kept, failed };
  }

  /**
   * The retention period for claimant identity.
   *
   * Falls back to the PD 12.8 floor when no policy row exists. A missing policy
   * must never shorten retention — an over-retained record is a storage cost,
   * an under-retained one is destroyed regulatory evidence.
   */
  private async retainYears(): Promise<number> {
    const policy = await this.prisma.retentionPolicy.findFirst({
      where: { entityType: 'CLAIMANT', isActive: true },
      select: { retainYears: true },
    });
    return Math.max(policy?.retainYears ?? 7, 7);
  }
}
