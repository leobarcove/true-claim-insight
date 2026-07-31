import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { EncryptionService } from '@tci/crypto';
import { AuditService } from '../common/audit/audit.service';
import { TenantContext } from '../common/guards/tenant.guard';
import { PrismaService } from '../config/prisma.service';
import {
  BUNDLE_SECTIONS,
  bundleHash,
  missingSections,
  sectionCounts,
  type BundleSection,
  type ClaimFileBundle,
} from './claim-bundle';

/**
 * Assembles the complete file for one claim (FSA s.143 / s.146).
 *
 * Two properties matter more than the queries:
 *
 *  1. **Completeness is asserted, not hoped for.** The assembled sections are
 *     checked against BUNDLE_SECTIONS and the export refuses if any is missing —
 *     a partial file presented as complete is the §3.6 failure with a regulator
 *     on the receiving end.
 *  2. **The export is itself evidence.** A CLAIM_FILE_EXPORTED row goes onto the
 *     append-only trail carrying the bundle's canonical hash, so what was
 *     produced to BNM stays provable byte-for-byte afterwards.
 *
 * The claimant's NRIC is decrypted into the bundle: production to the regulator
 * is precisely the purpose the record is kept for, the route is restricted to
 * compliance roles, and the decryption is audited by the export row itself.
 */
@Injectable()
export class ClaimExportService {
  private readonly logger = new Logger(ClaimExportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
    private readonly audit: AuditService
  ) {}

  async exportClaimFile(claimId: string, tenantContext: TenantContext): Promise<ClaimFileBundle> {
    const bundle = await this.assembleBundle(claimId, tenantContext);
    await this.recordExport(bundle, tenantContext, 'json');
    return bundle;
  }

  /** Assemble without recording — the caller decides which export act to audit. */
  async assembleBundle(claimId: string, tenantContext: TenantContext): Promise<ClaimFileBundle> {
    const claim = await this.prisma.claim.findUnique({
      where: { id: claimId },
      omit: { nricEncrypted: false },
    });
    if (!claim) throw new NotFoundException('Claim not found');

    const [
      claimant,
      assignment,
      documents,
      reports,
      slaClocks,
      consents,
      transferRecords,
      auditTrail,
      sessions,
      notes,
    ] = await Promise.all([
      claim.claimantId
        ? this.prisma.claimant.findUnique({
            where: { id: claim.claimantId },
            omit: { nricEncrypted: false },
          })
        : null,
      this.prisma.assignment.findFirst({ where: { claimId } }),
      // Soft-deleted documents are part of the record — PD 12.8 is why they
      // still exist — so the bundle lists them with their deletion facts.
      this.prisma.document.findMany({ where: { claimId }, orderBy: { createdAt: 'asc' } }),
      this.prisma.adjusterReport.findMany({
        where: { claimId },
        include: {
          author: { include: { user: { select: { fullName: true } } } },
          signedBy: { include: { user: { select: { fullName: true } } } },
        },
        orderBy: [{ type: 'asc' }, { version: 'asc' }],
      }),
      this.prisma.slaClock.findMany({
        where: { claimId },
        include: { policy: true },
        orderBy: { startedAt: 'asc' },
      }),
      claim.claimantId
        ? this.prisma.consent.findMany({
            where: { claimantId: claim.claimantId },
            include: { notice: true },
            orderBy: { grantedAt: 'asc' },
          })
        : [],
      this.prisma.transferRecord.findMany({
        where: { claimId },
        orderBy: { transferredAt: 'asc' },
      }),
      this.prisma.auditTrail.findMany({
        where: {
          OR: [
            { entityType: 'CLAIM', entityId: claimId },
            { entityId: claimId },
            ...(claim.claimantId
              ? [{ entityType: 'CONSENT' as const, userId: claim.claimantId }]
              : []),
          ],
        },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.session.findMany({ where: { claimId }, orderBy: { createdAt: 'asc' } }),
      this.prisma.claimNote.findMany({ where: { claimId }, orderBy: { createdAt: 'asc' } }),
    ]);

    const sections: Record<BundleSection, unknown> = {
      claim: await this.withDecryptedNric(claim),
      claimant: claimant ? await this.withDecryptedNric(claimant) : null,
      assignment,
      documents,
      reports,
      slaClocks,
      consents,
      transferRecords,
      auditTrail,
      sessions,
      notes,
    };

    // A partial file presented as complete is the failure mode; refuse instead.
    const missing = missingSections(sections);
    if (missing.length) {
      throw new Error(`Claim file assembly is incomplete: missing ${missing.join(', ')}`);
    }

    const bundle: ClaimFileBundle = {
      manifest: {
        claimId,
        claimNumber: claim.claimNumber,
        producedAt: new Date().toISOString(),
        producedByUserId: tenantContext.userId,
        counts: sectionCounts(sections),
        note:
          'Complete claim file produced under FSA s.143. Sections listed in the manifest; ' +
          'a null count means the singular record does not exist. Document binaries are ' +
          'retrievable by storageUrl; report PDFs render at /reports/:id/pdf.',
      },
      sections,
    };

    return bundle;
  }

  /**
   * The export itself becomes part of the record it exports — hash first, then
   * the audit row, so the trail can prove what was produced.
   */
  async recordExport(
    bundle: ClaimFileBundle,
    tenantContext: TenantContext,
    format: 'json' | 'archive',
    extra: Record<string, unknown> = {}
  ): Promise<string> {
    const hash = bundleHash(bundle);
    // Fail-CLOSED, unlike every other audit write. The sealed row is part of
    // the deliverable: an export the trail cannot prove is the outcome the
    // whole endpoint exists to prevent, so a failed seal fails the export.
    // (Found live: a probe's FK-invalid user let the fail-soft writer swallow
    // the row, and the archive shipped unsealed.)
    try {
      await this.prisma.auditTrail.create({
        data: {
          entityType: 'CLAIM',
          entityId: bundle.manifest.claimId,
          action: 'CLAIM_FILE_EXPORTED',
          actorId: tenantContext.userId,
          userId: tenantContext.userId,
          tenantId: tenantContext.tenantId,
          metadata: {
            format,
            bundleSha256: hash,
            sections: [...BUNDLE_SECTIONS],
            counts: bundle.manifest.counts,
            ...extra,
          } as never,
        },
      });
    } catch (error) {
      this.logger.error(
        `Export seal could not be written for ${bundle.manifest.claimNumber}; refusing the export`,
        error instanceof Error ? error.message : String(error)
      );
      throw new Error(
        'The export could not be recorded on the audit trail, so it has not been produced. ' +
          'An unprovable production to the regulator is worse than a delayed one.'
      );
    }

    this.logger.log(
      `Claim file exported (${format}) for ${bundle.manifest.claimNumber} by ` +
        `${tenantContext.userId} (sha256 ${hash.slice(0, 12)}…)`
    );
    return hash;
  }

  /** Replace ciphertext with the clear value; the export row audits the act. */
  private async withDecryptedNric<T extends { nricEncrypted?: string | null }>(record: T) {
    const { nricEncrypted, ...rest } = record;
    if (!nricEncrypted) return { ...rest, nric: null };
    return { ...rest, nric: await this.encryption.decrypt(nricEncrypted) };
  }
}
