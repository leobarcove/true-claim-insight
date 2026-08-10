import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConflictInterestType, ConflictPartyType } from '@prisma/client';
import { AuditService } from '../common/audit/audit.service';
import { TenantContext } from '../common/guards/tenant.guard';
import { PrismaService } from '../config/prisma.service';
import { ComplianceEventsService } from '../compliance/compliance-events.service';
import { coiConflictEvent } from '../compliance/compliance-triggers';

/**
 * Conflict declarations and per-claim attestations (PD 10.3, 12.1(d)).
 *
 * Declarations are never deleted — they are resolved, by a named person, with a
 * reason. "We knew and dealt with it" is the record that protects the firm; a
 * deleted row protects nobody. Declaring a conflict must carry no penalty in
 * the workflow, or people stop declaring: the *declaration* is always welcome,
 * it is the *assignment through it* that is refused.
 */
@Injectable()
export class ConflictsService {
  private readonly logger = new Logger(ConflictsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly compliance: ComplianceEventsService
  ) {}

  async list(adjusterId: string, includeResolved = false) {
    return this.prisma.conflictDeclaration.findMany({
      where: { adjusterId, ...(includeResolved ? {} : { resolvedAt: null }) },
      orderBy: { declaredAt: 'desc' },
    });
  }

  async declare(
    adjusterId: string,
    data: {
      partyType: ConflictPartyType;
      interestType: ConflictInterestType;
      partyName: string;
      partyTenantId?: string;
      relationship: string;
      details?: string;
    },
    tenantContext: TenantContext
  ) {
    const adjuster = await this.prisma.adjuster.findUnique({ where: { id: adjusterId } });
    if (!adjuster) throw new NotFoundException('Adjuster not found');
    if (!data.partyName?.trim() || !data.relationship?.trim()) {
      throw new BadRequestException('The party and the relationship are both required.');
    }

    const declaration = await this.prisma.conflictDeclaration.create({
      data: { adjusterId, ...data, declaredByUserId: tenantContext.userId },
    });

    await this.audit.record({
      entityType: 'ADJUSTER',
      entityId: adjusterId,
      action: 'CONFLICT_DECLARED',
      actorId: tenantContext.userId,
      userId: tenantContext.userId,
      tenantId: tenantContext.tenantId,
      newValues: {
        partyType: data.partyType,
        partyName: data.partyName,
        relationship: data.relationship,
      },
    });
    return declaration;
  }

  /** Resolution is an act with a reason — divestment, role change, error. */
  async resolve(declarationId: string, note: string, tenantContext: TenantContext) {
    if (!note?.trim()) {
      throw new BadRequestException(
        'A resolution note is required: how the conflict ceased to exist is the record.'
      );
    }
    const declaration = await this.prisma.conflictDeclaration.findUnique({
      where: { id: declarationId },
    });
    if (!declaration) throw new NotFoundException('Declaration not found');
    if (declaration.resolvedAt) {
      throw new BadRequestException('This declaration is already resolved.');
    }

    const resolved = await this.prisma.conflictDeclaration.update({
      where: { id: declarationId },
      data: { resolvedAt: new Date(), resolvedByUserId: tenantContext.userId, resolvedNote: note },
    });

    await this.audit.record({
      entityType: 'ADJUSTER',
      entityId: declaration.adjusterId,
      action: 'CONFLICT_RESOLVED',
      actorId: tenantContext.userId,
      userId: tenantContext.userId,
      tenantId: tenantContext.tenantId,
      oldValues: { partyName: declaration.partyName, declaredAt: declaration.declaredAt },
      newValues: { resolvedNote: note },
    });
    return resolved;
  }

  /**
   * The per-claim attestation (12.1(d)): the assigned adjuster confirms no
   * undeclared conflict exists for this claim, or declares one — in which case
   * the attestation records it and the declaration path above takes over.
   */
  async attest(
    claimId: string,
    hasConflict: boolean,
    note: string | undefined,
    tenantContext: TenantContext
  ) {
    const adjuster = await this.prisma.adjuster.findFirst({
      where: { userId: tenantContext.userId },
    });
    if (!adjuster) {
      throw new BadRequestException('Only an adjusting employee may attest (PD 12.1(d)).');
    }
    const claim = await this.prisma.claim.findUnique({ where: { id: claimId } });
    if (!claim) throw new NotFoundException('Claim not found');
    if (claim.adjusterId !== adjuster.id) {
      throw new BadRequestException('Only the assigned adjuster attests for a claim.');
    }
    if (hasConflict && !note?.trim()) {
      throw new BadRequestException(
        'Declaring a conflict in the attestation requires describing it.'
      );
    }

    const attestation = await this.prisma.conflictAttestation.upsert({
      where: { claimId_adjusterId: { claimId, adjusterId: adjuster.id } },
      update: { hasConflict, note, attestedAt: new Date() },
      create: { claimId, adjusterId: adjuster.id, hasConflict, note },
    });

    await this.audit.record({
      entityType: 'CLAIM',
      entityId: claimId,
      action: hasConflict ? 'COI_ATTESTED_WITH_CONFLICT' : 'COI_ATTESTED_CLEAR',
      actorId: tenantContext.userId,
      userId: tenantContext.userId,
      tenantId: tenantContext.tenantId,
      newValues: { adjusterId: adjuster.id, hasConflict, note: note ?? null },
    });

    if (hasConflict) {
      this.logger.warn(
        `COI attested WITH conflict on claim ${claimId} by adjuster ${adjuster.id}: ${note}`
      );
      // Board-visible per PD 11.2(d); idempotent per claim + adjuster.
      await this.compliance.raiseQuietly({
        ...coiConflictEvent({ claimId, adjusterId: adjuster.id, note: note ?? null }),
        claimId,
        adjusterId: adjuster.id,
        source: 'coi-attestation',
      });
    }
    return attestation;
  }

  /** Has this adjuster attested clear for this claim? */
  async hasClearAttestation(claimId: string, adjusterId: string): Promise<boolean> {
    const attestation = await this.prisma.conflictAttestation.findUnique({
      where: { claimId_adjusterId: { claimId, adjusterId } },
    });
    return Boolean(attestation && !attestation.hasConflict);
  }
}
