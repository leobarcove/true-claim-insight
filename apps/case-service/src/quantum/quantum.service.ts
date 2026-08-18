import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma, SettlementBasis } from '@prisma/client';

import { AuditService } from '../common/audit/audit.service';
import { TenantContext } from '../common/guards/tenant.guard';
import { PrismaService } from '../config/prisma.service';
import { CreateWorksheetDto } from './dto/create-worksheet.dto';
import { calculateQuantum, formatWorksheet, QuantumInput } from './quantum.calculator';

const D = Prisma.Decimal;
const dec = (value?: string | null) => (value === undefined || value === null ? undefined : new D(value));

@Injectable()
export class QuantumService {
  private readonly logger = new Logger(QuantumService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService
  ) {}

  /**
   * Prepare a worksheet against a claim.
   *
   * Never edits an existing one. A revised quantum is a new opinion and the one
   * it replaces stays on the record — the same reasoning that makes an issued
   * report immutable. `supersedesId` links the chain so an insurer asking "what
   * changed and why" gets both figures rather than the latest.
   */
  async create(claimId: string, dto: CreateWorksheetDto, tenantContext: TenantContext) {
    const claim = await this.loadClaim(claimId, tenantContext);

    const input: QuantumInput = {
      basis: dto.basis,
      // Qualifies the basis findings; the arithmetic does not branch on it.
      category: claim.category,
      assessedLoss: new D(dto.assessedLoss),
      sumInsured: new D(dto.sumInsured),
      depreciationRate: dec(dto.depreciationRate),
      betterment: dec(dto.betterment),
      valueAtRisk: dec(dto.valueAtRisk),
      averageCondition: dto.averageCondition,
      salvage: dec(dto.salvage),
      excess: dec(dto.excess),
    };

    // Throws on contradictory input — depreciation on a reinstatement policy,
    // a zero sum insured. Better a 400 than a worksheet nobody can defend.
    const result = calculateQuantum(input);

    const previous = await this.prisma.quantumWorksheet.findFirst({
      where: { claimId },
      orderBy: { revision: 'desc' },
    });

    const worksheet = await this.prisma.quantumWorksheet.create({
      data: {
        claimId,
        tenantId: claim.tenantId ?? tenantContext.tenantId,
        revision: (previous?.revision ?? 0) + 1,
        supersedesId: previous?.id,
        basis: dto.basis,
        assessedLoss: input.assessedLoss,
        depreciationRate: input.depreciationRate,
        betterment: input.betterment,
        sumInsured: input.sumInsured,
        valueAtRisk: input.valueAtRisk,
        averageCondition: dto.averageCondition,
        salvage: input.salvage,
        excess: input.excess,
        adjustedLoss: result.adjustedLoss,
        underinsured: result.underinsured,
        averageRatio: result.averageRatio,
        averageApplied: result.averageApplied,
        recommended: result.recommended,
        cappedAtSumInsured: result.cappedAtSumInsured,
        lines: result.lines.map(line => ({
          key: line.key,
          label: line.label,
          amount: line.amount.toFixed(2),
          basis: line.basis,
        })) as unknown as Prisma.InputJsonValue,
        warnings: result.warnings,
        preparedByAdjusterId: tenantContext.userId,
        notes: dto.notes,
      },
    });

    await this.audit.record({
      entityType: 'QUANTUM_WORKSHEET',
      entityId: worksheet.id,
      action: previous ? 'QUANTUM_REVISED' : 'QUANTUM_PREPARED',
      tenantId: worksheet.tenantId,
      userId: tenantContext.userId,
      actorId: tenantContext.userId,
      actorType: tenantContext.userRole ?? 'SYSTEM',
      // The figure and its drivers, so the trail answers "how much, and on what
      // basis" without joining back to a table that may since have been revised.
      newValues: {
        claimId,
        revision: worksheet.revision,
        recommended: result.recommended.toFixed(2),
        averageApplied: result.averageApplied,
        cappedAtSumInsured: result.cappedAtSumInsured,
      },
      oldValues: previous
        ? { revision: previous.revision, recommended: previous.recommended.toFixed(2) }
        : undefined,
      metadata: { warnings: result.warnings },
    });

    if (result.warnings.length > 0) {
      this.logger.warn(
        `Quantum r${worksheet.revision} on claim ${claimId} carries ` +
          `${result.warnings.length} unresolved warning(s)`
      );
    }

    return { ...worksheet, worksheet: formatWorksheet(result) };
  }

  /** The current worksheet, or null where none has been prepared. */
  async current(claimId: string, tenantContext: TenantContext) {
    await this.loadClaim(claimId, tenantContext);
    return this.prisma.quantumWorksheet.findFirst({
      where: { claimId },
      orderBy: { revision: 'desc' },
    });
  }

  /** Every revision, newest first — the chain an insurer may ask to see. */
  async history(claimId: string, tenantContext: TenantContext) {
    await this.loadClaim(claimId, tenantContext);
    return this.prisma.quantumWorksheet.findMany({
      where: { claimId },
      orderBy: { revision: 'desc' },
    });
  }

  private async loadClaim(claimId: string, tenantContext: TenantContext) {
    const claim = await this.prisma.claim.findUnique({
      where: { id: claimId },
      select: { id: true, tenantId: true, category: true },
    });

    // Confirming a claim exists in another tenant is itself a disclosure, so
    // absence and refusal are answered identically: one message, one status,
    // for "there is no such claim" and "there is, and it is not yours". This
    // comment used to sit above a 403 that said the opposite (18 Aug 2026).
    if (!claim) throw new NotFoundException('Claim not found');
    if (
      claim.tenantId !== tenantContext.tenantId &&
      tenantContext.userRole !== 'SUPER_ADMIN'
    ) {
      throw new NotFoundException('Claim not found');
    }
    return claim;
  }
}
