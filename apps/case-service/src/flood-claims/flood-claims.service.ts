import {
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ClaimCategory, Prisma } from '@prisma/client';
import { PrismaService } from '../config/prisma.service';
import { TenantContext } from '../common/guards/tenant.guard';
import { CreateFloodClaimDto } from './dto/create-flood-claim.dto';

/**
 * Flood-specific claim service. Creates both the base Claim row (with
 * category=FLOOD) and the FloodClaim sub-table row inside a single
 * transaction, so the relationship is never half-populated.
 */
@Injectable()
export class FloodClaimsService {
  private readonly logger = new Logger(FloodClaimsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateFloodClaimDto, tenantContext: TenantContext) {
    const claimNumber = await this.generateClaimNumber();
    const isClaimant = tenantContext.userRole === 'CLAIMANT';
    const userId = isClaimant ? null : tenantContext.userId;

    // Single transaction so an orphan Claim row is impossible if the
    // FloodClaim insert fails (and vice versa).
    return this.prisma.$transaction(async tx => {
      const claim = await tx.claim.create({
        data: {
          claimNumber,
          category: ClaimCategory.FLOOD,
          claimType: null, // motor-specific subtype not applicable
          policyNumber: dto.policyNumber,
          claimantId: dto.claimantId,
          nric: dto.nric,
          incidentDate: new Date(dto.incidentDate),
          incidentLocation: dto.incidentLocation as Prisma.InputJsonValue,
          description: dto.description,
          isPdpaCompliant: dto.isPdpaCompliant ?? false,
          tenantId: tenantContext.tenantId,
          insurerTenantId: tenantContext.tenantId,
          userId,
          createdById: userId,
          updatedById: userId,
        },
      });

      const floodClaim = await tx.floodClaim.create({
        data: {
          claimId: claim.id,
          tenantId: tenantContext.tenantId,
          incidentStart: new Date(dto.incidentStart),
          incidentEnd: dto.incidentEnd ? new Date(dto.incidentEnd) : null,
          waterDepthCm: dto.waterDepthCm,
          durationHours: dto.durationHours,
          source: dto.source,
          propertyType: dto.propertyType,
          propertyFloorLevel: dto.propertyFloorLevel,
          propertyElevationMeters: dto.propertyElevationMeters,
          postcode: dto.postcode,
          state: dto.state,
          buildingDamageRm: dto.buildingDamageRm,
          contentsDamageRm: dto.contentsDamageRm,
          vehicleDamageRm: dto.vehicleDamageRm,
        },
      });

      this.logger.log(
        `Flood claim created: ${claim.claimNumber} (id=${claim.id})`
      );

      return { ...claim, floodClaim };
    });
  }

  async findOne(claimId: string, tenantContext: TenantContext) {
    const claim = await this.prisma.claim.findUnique({
      where: { id: claimId },
      include: {
        floodClaim: true,
        claimant: true,
        documents: true,
        fraudSignals: { orderBy: [{ severity: 'desc' }, { createdAt: 'desc' }] },
      },
    });

    if (!claim) throw new NotFoundException('Claim not found');
    if (claim.category !== ClaimCategory.FLOOD) {
      throw new NotFoundException('Claim is not a flood claim');
    }
    if (
      tenantContext.tenantId &&
      claim.tenantId &&
      claim.tenantId !== tenantContext.tenantId
    ) {
      // Defence-in-depth — TenantGuard should already block this, but the
      // service must enforce it on its own. Cross-tenant data leaks are the
      // single most expensive bug class in multi-tenant SaaS.
      throw new NotFoundException('Claim not found');
    }

    return claim;
  }

  async findAll(tenantContext: TenantContext) {
    return this.prisma.claim.findMany({
      where: {
        category: ClaimCategory.FLOOD,
        tenantId: tenantContext.tenantId ?? undefined,
      },
      include: { floodClaim: true, claimant: { select: { fullName: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Generate a year-prefixed claim number. Matches the format used by motor
   * claims (CLM-YYYY-NNNNNN). Sharing the namespace deliberately: a single
   * sequence keeps claim numbers globally unique across categories.
   */
  private async generateClaimNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const count = await this.prisma.claim.count();
    return `CLM-${year}-${String(count + 1).padStart(6, '0')}`;
  }
}
