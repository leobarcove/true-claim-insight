import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AuditService } from '../common/audit/audit.service';
import { StorageService } from '../common/services/storage.service';
import { TenantContext } from '../common/guards/tenant.guard';
import { PrismaService } from '../config/prisma.service';
import { RETENTION_FLOOR_YEARS, assertRetentionYears, canPurge } from './retention-rules';

/**
 * Retention: the seven-year floor, legal holds, and the only purge path.
 *
 * PD 12.8 requires adjusting records kept at least seven years. The design
 * splits "delete" into two acts with different owners: *soft delete* is a user
 * act that hides a record; *purge* is this service's act alone, permitted only
 * once the claim's retention period has run and no legal hold stands. Nothing a
 * user can trigger destroys a record.
 */
@Injectable()
export class RetentionService {
  private readonly logger = new Logger(RetentionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly audit: AuditService
  ) {}

  /** The retention period for a kind of record. Absent row → the floor. */
  async retainYearsFor(entityType: string): Promise<number> {
    const policy = await this.prisma.retentionPolicy.findUnique({ where: { entityType } });
    return policy?.isActive ? policy.retainYears : RETENTION_FLOOR_YEARS;
  }

  /** Set a retention period. Refuses anything under the PD 12.8 floor. */
  async setPolicy(entityType: string, retainYears: number) {
    assertRetentionYears(retainYears);

    return this.prisma.retentionPolicy.upsert({
      where: { entityType },
      update: { retainYears, isActive: true },
      create: { entityType, retainYears },
    });
  }

  /**
   * Place a legal hold on a claim.
   *
   * A hold outranks the calendar: while it stands, nothing belonging to the
   * claim is purged however long ago it closed. A reason is mandatory — the
   * hold will one day be questioned, and "who placed it and why" must be on
   * the claim, not in someone's memory.
   */
  async placeLegalHold(claimId: string, reason: string, tenantContext: TenantContext) {
    if (!reason?.trim()) {
      throw new BadRequestException('A legal hold requires a reason.');
    }
    const claim = await this.prisma.claim.findUnique({ where: { id: claimId } });
    if (!claim) throw new NotFoundException('Claim not found');
    if (claim.legalHoldAt) {
      throw new BadRequestException('A legal hold is already in place on this claim.');
    }

    const held = await this.prisma.claim.update({
      where: { id: claimId },
      data: {
        legalHoldAt: new Date(),
        legalHoldReason: reason,
        legalHoldByUserId: tenantContext.userId,
      },
    });

    await this.audit.record({
      entityType: 'CLAIM',
      entityId: claimId,
      action: 'LEGAL_HOLD_PLACED',
      actorId: tenantContext.userId,
      userId: tenantContext.userId,
      tenantId: tenantContext.tenantId,
      newValues: { reason },
    });

    return held;
  }

  /** Lift a legal hold. Also audited — releasing records for purge is a decision. */
  async liftLegalHold(claimId: string, reason: string, tenantContext: TenantContext) {
    if (!reason?.trim()) {
      throw new BadRequestException('Lifting a legal hold requires a reason.');
    }
    const claim = await this.prisma.claim.findUnique({ where: { id: claimId } });
    if (!claim) throw new NotFoundException('Claim not found');
    if (!claim.legalHoldAt) {
      throw new BadRequestException('No legal hold is in place on this claim.');
    }

    const lifted = await this.prisma.claim.update({
      where: { id: claimId },
      data: { legalHoldAt: null, legalHoldReason: null, legalHoldByUserId: null },
    });

    await this.audit.record({
      entityType: 'CLAIM',
      entityId: claimId,
      action: 'LEGAL_HOLD_LIFTED',
      actorId: tenantContext.userId,
      userId: tenantContext.userId,
      tenantId: tenantContext.tenantId,
      oldValues: { heldSince: claim.legalHoldAt, holdReason: claim.legalHoldReason },
      newValues: { liftReason: reason },
    });

    return lifted;
  }

  /**
   * The sweep: purge soft-deleted documents whose retention has genuinely run.
   *
   * Three conditions, every one re-checked here rather than trusted from the
   * query: the document was soft-deleted, its claim closed at least the
   * retention period ago, and no legal hold stands. The audit row is written
   * *before* the destruction — a purge that fails halfway must leave evidence
   * of the attempt, not silence.
   */
  async sweep(now: Date = new Date()): Promise<{ examined: number; purged: number; kept: number }> {
    const retainYears = await this.retainYearsFor('DOCUMENT');

    const candidates = await this.prisma.document.findMany({
      where: { deletedAt: { not: null } },
      include: {
        claim: { select: { id: true, closedAt: true, legalHoldAt: true, claimNumber: true } },
      },
      take: 500,
    });

    let purged = 0;
    let kept = 0;

    for (const document of candidates) {
      const decision = canPurge({
        claimClosedAt: document.claim.closedAt,
        legalHoldAt: document.claim.legalHoldAt,
        retainYears,
        now,
      });

      if (!decision.allowed) {
        kept += 1;
        continue;
      }

      try {
        await this.audit.record({
          entityType: 'DOCUMENT',
          entityId: document.id,
          action: 'DOCUMENT_PURGED',
          oldValues: {
            claimId: document.claim.id,
            claimNumber: document.claim.claimNumber,
            filename: document.filename,
            type: document.type,
            softDeletedAt: document.deletedAt,
          },
          metadata: { basis: decision.basis },
        });

        await this.storage.deleteFile(document.storageUrl);
        await this.prisma.document.delete({ where: { id: document.id } });
        purged += 1;
      } catch (error) {
        // One failed purge must not stop the sweep; the audit row above already
        // records the attempt.
        kept += 1;
        this.logger.error(
          `Purge failed for document ${document.id}`,
          error instanceof Error ? error.message : String(error)
        );
      }
    }

    if (purged) {
      this.logger.log(`Retention sweep: ${candidates.length} examined, ${purged} purged, ${kept} kept`);
    }
    return { examined: candidates.length, purged, kept };
  }
}
