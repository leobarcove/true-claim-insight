import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { FeeNoteStatus, Prisma } from '@prisma/client';
import { AuditService } from '../common/audit/audit.service';
import { TenantContext } from '../common/guards/tenant.guard';
import { PrismaService } from '../config/prisma.service';
import {
  ageingBucket,
  computeFeeNote,
  computeProfessionalFee,
  type FeeScaleLike,
} from './fee-calculation';

/**
 * Billing: fee scales, time, disbursements and the fee note (CSP 11.16–11.18).
 *
 * Rates live in tenant configuration, never code — a panel insurer's terms
 * arrive as a FeeScale row (§6.8). An issued note is immutable, a correction is
 * a new note, and every note stores its own derivation, because the number
 * without its working is unanswerable in a dispute.
 */
@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService
  ) {}

  async setScale(
    tenantId: string,
    data: {
      basis: 'SCALE' | 'TIME' | 'FIXED';
      bands?: unknown;
      hourlyRate?: number;
      fixedFee?: number;
      sstRate?: number;
      paymentTermsDays?: number;
    },
    tenantContext: TenantContext
  ) {
    // One active scale per insurer: setting a new one retires the old, kept for
    // the notes that were computed under it.
    await this.prisma.feeScale.updateMany({
      where: { tenantId, isActive: true },
      data: { isActive: false },
    });
    const scale = await this.prisma.feeScale.create({
      data: {
        tenantId,
        basis: data.basis,
        bands: (data.bands as Prisma.InputJsonValue) ?? undefined,
        hourlyRate: data.hourlyRate,
        fixedFee: data.fixedFee,
        sstRate: data.sstRate ?? 0.08,
        paymentTermsDays: data.paymentTermsDays ?? 30,
      },
    });
    await this.audit.record({
      entityType: 'FEE_SCALE',
      entityId: scale.id,
      action: 'FEE_SCALE_SET',
      actorId: tenantContext.userId,
      userId: tenantContext.userId,
      tenantId: tenantContext.tenantId,
      newValues: { insurerTenantId: tenantId, basis: data.basis },
    });
    return scale;
  }

  async recordTime(
    claimId: string,
    data: { workedOn: string; hours: number; description: string },
    tenantContext: TenantContext
  ) {
    if (!(data.hours > 0 && data.hours <= 24)) {
      throw new BadRequestException('Hours must be between 0 and 24 per entry.');
    }
    if (!data.description?.trim()) {
      throw new BadRequestException('Time needs describing — "work" is not a record.');
    }
    const adjuster = await this.prisma.adjuster.findFirst({
      where: { userId: tenantContext.userId },
    });
    if (!adjuster) throw new BadRequestException('Only an adjusting employee records time.');

    return this.prisma.timeEntry.create({
      data: {
        claimId,
        adjusterId: adjuster.id,
        workedOn: new Date(data.workedOn),
        hours: data.hours,
        description: data.description,
        recordedByUserId: tenantContext.userId,
      },
    });
  }

  async recordDisbursement(
    claimId: string,
    data: { description: string; amount: number; incurredAt: string; evidenceUrl?: string },
    tenantContext: TenantContext
  ) {
    if (!(data.amount > 0)) throw new BadRequestException('Amount must be positive.');
    return this.prisma.disbursement.create({
      data: {
        claimId,
        description: data.description,
        amount: data.amount,
        incurredAt: new Date(data.incurredAt),
        evidenceUrl: data.evidenceUrl,
        recordedByUserId: tenantContext.userId,
      },
    });
  }

  /**
   * Draft the fee note from the claim's own records: the insurer's active
   * scale, the recorded time, the recorded disbursements, and the approved or
   * estimated amount as the SCALE input.
   */
  async draftFeeNote(claimId: string, tenantContext: TenantContext) {
    const claim = await this.prisma.claim.findUnique({
      where: { id: claimId },
      include: { timeEntries: true, disbursements: true },
    });
    if (!claim) throw new NotFoundException('Claim not found');
    if (!claim.insurerTenantId) {
      throw new BadRequestException('The claim has no insurer to bill.');
    }
    if (!['APPROVED', 'REJECTED', 'CLOSED'].includes(claim.status)) {
      throw new BadRequestException(
        `A fee note is drafted once the claim is decided; this one is ${claim.status}.`
      );
    }
    const existing = await this.prisma.feeNote.findFirst({
      where: { claimId, status: { in: [FeeNoteStatus.DRAFT, FeeNoteStatus.ISSUED] } },
    });
    if (existing) {
      throw new BadRequestException(
        `A ${existing.status} fee note already exists for this claim (${existing.noteNumber}).`
      );
    }

    const scale = await this.prisma.feeScale.findFirst({
      where: { tenantId: claim.insurerTenantId, isActive: true },
    });
    if (!scale) {
      throw new BadRequestException(
        'No active fee scale for this insurer. Set one first — rates are tenant configuration.'
      );
    }

    const hours = claim.timeEntries.reduce((sum, entry) => sum + Number(entry.hours), 0);
    const assessedAmount = Number(claim.approvedAmount ?? claim.estimatedLossAmount ?? 0);
    const scaleLike: FeeScaleLike = {
      basis: scale.basis,
      bands: scale.bands as never,
      hourlyRate: scale.hourlyRate ? Number(scale.hourlyRate) : null,
      fixedFee: scale.fixedFee ? Number(scale.fixedFee) : null,
      sstRate: Number(scale.sstRate),
    };

    const fee = computeProfessionalFee(scaleLike, { assessedAmount, hours });
    const amounts = computeFeeNote(
      fee.professionalFee,
      claim.disbursements.map(d => Number(d.amount)),
      Number(scale.sstRate)
    );

    const count = await this.prisma.feeNote.count();
    const noteNumber = `FN-${new Date().getUTCFullYear()}-${String(count + 1).padStart(6, '0')}`;

    const note = await this.prisma.feeNote.create({
      data: {
        noteNumber,
        claimId,
        insurerTenantId: claim.insurerTenantId,
        ...amounts,
        computation: {
          basis: scale.basis,
          scaleId: scale.id,
          inputs: { assessedAmount, hours },
          derivation: fee.derivation,
          sstRate: Number(scale.sstRate),
        } as Prisma.InputJsonValue,
        createdByUserId: tenantContext.userId,
      },
    });

    await this.audit.record({
      entityType: 'FEE_NOTE',
      entityId: note.id,
      action: 'FEE_NOTE_DRAFTED',
      actorId: tenantContext.userId,
      userId: tenantContext.userId,
      tenantId: tenantContext.tenantId,
      newValues: { noteNumber, claimId, total: amounts.total },
    });
    return note;
  }

  /**
   * The fee note on a claim, with everything it was derived from.
   *
   * Drafting was reachable and reading was not, so a note could be raised and
   * then never seen. The time entries and disbursements come back alongside it
   * because the number without its working is unanswerable in a dispute — the
   * same reason the note stores its own derivation.
   */
  async forClaim(claimId: string, tenantContext: TenantContext) {
    const claim = await this.prisma.claim.findUnique({
      where: { id: claimId },
      select: { id: true, tenantId: true, status: true, insurerTenantId: true },
    });
    // Existence check, not an access check: confirming a claim exists in
    // another tenant is itself a disclosure.
    if (!claim) throw new NotFoundException('Claim not found');
    if (claim.tenantId !== tenantContext.tenantId && tenantContext.userRole !== 'SUPER_ADMIN') {
      throw new ForbiddenException('This claim does not belong to your organisation');
    }

    const [note, timeEntries, disbursements] = await Promise.all([
      this.prisma.feeNote.findFirst({ where: { claimId }, orderBy: { createdAt: 'desc' } }),
      this.prisma.timeEntry.findMany({ where: { claimId }, orderBy: { workedOn: 'asc' } }),
      this.prisma.disbursement.findMany({ where: { claimId }, orderBy: { incurredAt: 'asc' } }),
    ]);

    // Why the firm cannot bill yet, in the words the drafting rule uses.
    const blockedReason = !claim.insurerTenantId
      ? 'The claim has no insurer to bill.'
      : !['APPROVED', 'REJECTED', 'CLOSED'].includes(claim.status)
        ? `A fee note is drafted once the claim is decided; this one is ${claim.status}.`
        : null;

    return { note, timeEntries, disbursements, blockedReason };
  }

  async issue(noteId: string, tenantContext: TenantContext) {
    const note = await this.load(noteId);
    if (note.status !== FeeNoteStatus.DRAFT) {
      throw new BadRequestException(`Only a DRAFT note can be issued; this one is ${note.status}.`);
    }
    const scale = (note.computation as { scaleId?: string })?.scaleId
      ? await this.prisma.feeScale.findUnique({
          where: { id: (note.computation as { scaleId: string }).scaleId },
        })
      : null;
    const terms = scale?.paymentTermsDays ?? 30;
    const issuedAt = new Date();
    const dueAt = new Date(issuedAt.getTime() + terms * 86_400_000);

    const issued = await this.prisma.feeNote.update({
      where: { id: noteId },
      data: { status: FeeNoteStatus.ISSUED, issuedAt, dueAt },
    });
    await this.audit.record({
      entityType: 'FEE_NOTE',
      entityId: noteId,
      action: 'FEE_NOTE_ISSUED',
      actorId: tenantContext.userId,
      userId: tenantContext.userId,
      tenantId: tenantContext.tenantId,
      newValues: { dueAt, total: Number(note.total) },
    });
    return issued;
  }

  async markPaid(noteId: string, reference: string, tenantContext: TenantContext) {
    if (!reference?.trim()) {
      throw new BadRequestException('A payment reference is required.');
    }
    const note = await this.load(noteId);
    if (note.status !== FeeNoteStatus.ISSUED && note.status !== FeeNoteStatus.DISPUTED) {
      throw new BadRequestException(`A ${note.status} note cannot be marked paid.`);
    }
    const paid = await this.prisma.feeNote.update({
      where: { id: noteId },
      data: { status: FeeNoteStatus.PAID, paidAt: new Date(), paymentReference: reference },
    });
    await this.audit.record({
      entityType: 'FEE_NOTE',
      entityId: noteId,
      action: 'FEE_NOTE_PAID',
      actorId: tenantContext.userId,
      userId: tenantContext.userId,
      tenantId: tenantContext.tenantId,
      newValues: { reference },
    });
    return paid;
  }

  async dispute(noteId: string, reason: string, tenantContext: TenantContext) {
    if (!reason?.trim()) throw new BadRequestException('A dispute reason is required.');
    const note = await this.load(noteId);
    if (note.status !== FeeNoteStatus.ISSUED) {
      throw new BadRequestException(`Only an ISSUED note can be disputed.`);
    }
    return this.prisma.feeNote.update({
      where: { id: noteId },
      data: { status: FeeNoteStatus.DISPUTED, disputedAt: new Date(), disputeReason: reason },
    });
  }

  /** The per-insurer statement: outstanding notes bucketed by age. */
  async insurerStatement() {
    const notes = await this.prisma.feeNote.findMany({
      where: { status: { in: [FeeNoteStatus.ISSUED, FeeNoteStatus.DISPUTED] } },
      include: { insurer: { select: { name: true } } },
      orderBy: { dueAt: 'asc' },
    });
    const now = new Date();
    const byInsurer = new Map<string, { name: string; outstanding: number; buckets: Record<string, number> }>();

    for (const note of notes) {
      const entry = byInsurer.get(note.insurerTenantId) ?? {
        name: note.insurer.name,
        outstanding: 0,
        buckets: {},
      };
      entry.outstanding += Number(note.total);
      const bucket = note.dueAt ? ageingBucket(note.dueAt, now) : 'CURRENT';
      entry.buckets[bucket] = (entry.buckets[bucket] ?? 0) + Number(note.total);
      byInsurer.set(note.insurerTenantId, entry);
    }

    return [...byInsurer.entries()].map(([insurerTenantId, entry]) => ({
      insurerTenantId,
      insurerName: entry.name,
      outstanding: Math.round(entry.outstanding * 100) / 100,
      ageing: entry.buckets,
    }));
  }

  private async load(id: string) {
    const note = await this.prisma.feeNote.findUnique({ where: { id } });
    if (!note) throw new NotFoundException('Fee note not found');
    return note;
  }
}
