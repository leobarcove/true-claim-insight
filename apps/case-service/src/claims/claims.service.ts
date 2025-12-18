import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../config/prisma.service';
import { TenantService } from '../tenant/tenant.service';
import { TenantContext } from '../common/guards/tenant.guard';
import { CreateClaimDto } from './dto/create-claim.dto';
import { UpdateClaimDto } from './dto/update-claim.dto';
import { ClaimQueryDto } from './dto/claim-query.dto';

@Injectable()
export class ClaimsService {
  private readonly logger = new Logger(ClaimsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantService: TenantService,
  ) {}

  /**
   * Create a new claim
   */
  async create(createClaimDto: CreateClaimDto) {
    const claimNumber = await this.generateClaimNumber();

    const claim = await this.prisma.claim.create({
      data: {
        claimNumber,
        policyNumber: createClaimDto.policyNumber || '',
        claimType: createClaimDto.claimType as any,
        incidentDate: new Date(createClaimDto.incidentDate),
        incidentLocation: createClaimDto.incidentLocation as any,
        description: createClaimDto.description,
        claimantId: createClaimDto.claimantId,
        insurerTenantId: createClaimDto.tenantId,
      },
      include: {
        claimant: {
          select: {
            id: true,
            fullName: true,
            phoneNumber: true,
          },
        },
      },
    });

    // Log audit trail
    await this.createAuditTrail(claim.id, 'CLAIM_CREATED', {
      claimNumber,
      claimType: createClaimDto.claimType,
    });

    this.logger.log(`Claim created: ${claimNumber}`);

    return claim;
  }

  /**
   * Find all claims with pagination and filters
   * Now with mandatory tenant isolation
   */
  async findAll(query: ClaimQueryDto, tenantContext?: TenantContext) {
    const {
      page = 1,
      limit = 20,
      status,
      claimType,
      adjusterId,
      search,
    } = query;
    const skip = (page - 1) * limit;

    // Build base where clause
    let where: any = {};

    if (status) where.status = status;
    if (claimType) where.claimType = claimType;
    if (adjusterId) where.adjusterId = adjusterId;

    // Apply tenant isolation filter
    if (tenantContext) {
      where = this.tenantService.buildClaimTenantFilter(tenantContext, where);
    }

    // Apply search filter (must be after tenant filter to combine properly)
    if (search) {
      const searchConditions = [
        { claimNumber: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
        { claimant: { fullName: { contains: search, mode: 'insensitive' } } },
      ];

      // Combine search with existing filters
      if (where.OR) {
        // If tenant filter already has OR, wrap everything in AND
        where = {
          AND: [
            { OR: where.OR },
            { OR: searchConditions },
          ],
        };
      } else {
        where.OR = searchConditions;
      }
    }

    const [claims, total] = await Promise.all([
      this.prisma.claim.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          claimant: {
            select: {
              id: true,
              fullName: true,
              phoneNumber: true,
            },
          },
          adjuster: {
            select: {
              id: true,
              fullName: true,
              email: true,
            },
          },
          _count: {
            select: {
              documents: true,
              sessions: true,
              notes: true,
            },
          },
        },
      }),
      this.prisma.claim.count({ where }),
    ]);

    return {
      claims,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Find a single claim by ID with tenant validation
   */
  async findOne(id: string, tenantContext?: TenantContext) {
    const claim = await this.prisma.claim.findUnique({
      where: { id },
      include: {
        claimant: true,
        adjuster: {
          include: {
            tenant: { select: { id: true, name: true } },
          },
        },
        documents: {
          orderBy: { createdAt: 'desc' },
        },
        sessions: {
          orderBy: { createdAt: 'desc' },
          include: {
            riskAssessments: true,
          },
        },
        notes: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!claim) {
      throw new NotFoundException(`Claim with ID ${id} not found`);
    }

    // Validate tenant access if context provided
    if (tenantContext) {
      await this.tenantService.validateClaimAccess(id, tenantContext);
    }

    return claim;
  }

  /**
   * Update a claim with tenant validation
   */
  async update(id: string, updateClaimDto: UpdateClaimDto, tenantContext?: TenantContext) {
    await this.findOne(id, tenantContext); // Verify claim exists and tenant access

    const claim = await this.prisma.claim.update({
      where: { id },
      data: {
        ...(updateClaimDto.description && {
          description: updateClaimDto.description,
        }),
        ...(updateClaimDto.incidentLocation && {
          incidentLocation: updateClaimDto.incidentLocation as any,
        }),
        updatedAt: new Date(),
      },
      include: {
        claimant: {
          select: {
            id: true,
            fullName: true,
          },
        },
        adjuster: {
          select: {
            id: true,
            fullName: true,
          },
        },
      },
    });

    await this.createAuditTrail(id, 'CLAIM_UPDATED', {
      changes: updateClaimDto,
    });

    return claim;
  }

  /**
   * Update claim status with tenant validation
   */
  async updateStatus(id: string, status: string, tenantContext?: TenantContext) {
    const existingClaim = await this.findOne(id, tenantContext);

    // Validate status transition
    this.validateStatusTransition(existingClaim.status, status);

    const claim = await this.prisma.claim.update({
      where: { id },
      data: {
        status: status as any,
        updatedAt: new Date(),
      },
    });

    await this.createAuditTrail(id, 'STATUS_CHANGED', {
      from: existingClaim.status,
      to: status,
    });

    this.logger.log(`Claim ${existingClaim.claimNumber} status: ${existingClaim.status} -> ${status}`);

    return claim;
  }

  /**
   * Assign an adjuster to a claim with tenant validation
   * Ensures adjuster belongs to the same tenant as the user
   */
  async assignAdjuster(claimId: string, adjusterId: string, tenantContext?: TenantContext) {
    const claim = await this.findOne(claimId, tenantContext);

    // Verify adjuster exists
    const adjuster = await this.prisma.adjuster.findUnique({
      where: { id: adjusterId },
    });

    if (!adjuster) {
      throw new NotFoundException(`Adjuster with ID ${adjusterId} not found`);
    }

    // Validate adjuster belongs to the same tenant
    if (tenantContext) {
      this.tenantService.validateTenantAccess(
        adjuster.tenantId,
        tenantContext,
        'Adjuster',
      );
    }

    const updatedClaim = await this.prisma.claim.update({
      where: { id: claimId },
      data: {
        adjusterId,
        status: 'ASSIGNED',
        updatedAt: new Date(),
      },
      include: {
        adjuster: {
          select: {
            id: true,
            fullName: true,
            email: true,
          },
        },
      },
    });

    await this.createAuditTrail(claimId, 'ADJUSTER_ASSIGNED', {
      adjusterId,
      adjusterName: adjuster.fullName,
    });

    this.logger.log(`Adjuster ${adjuster.fullName} assigned to claim ${claim.claimNumber}`);

    return updatedClaim;
  }

  /**
   * Soft delete a claim with tenant validation
   */
  async remove(id: string, tenantContext?: TenantContext) {
    const claim = await this.findOne(id, tenantContext);

    await this.prisma.claim.update({
      where: { id },
      data: {
        status: 'CLOSED',
        updatedAt: new Date(),
      },
    });

    await this.createAuditTrail(id, 'CLAIM_CLOSED', {
      reason: 'Manually closed',
    });

    this.logger.log(`Claim ${claim.claimNumber} closed`);
  }

  /**
   * Get claim timeline/audit trail with tenant validation
   */
  async getTimeline(id: string, tenantContext?: TenantContext) {
    await this.findOne(id, tenantContext);

    const auditTrail = await this.prisma.auditTrail.findMany({
      where: { entityId: id, entityType: 'CLAIM' },
      orderBy: { createdAt: 'desc' },
    });

    return auditTrail;
  }

  /**
   * Add a note to a claim with tenant validation
   */
  async addNote(claimId: string, content: string, authorId: string, tenantContext?: TenantContext) {
    await this.findOne(claimId, tenantContext);

    const note = await this.prisma.claimNote.create({
      data: {
        claimId,
        content,
        authorId,
        authorType: 'ADJUSTER', // Default to adjuster for now
      },
    });

    await this.createAuditTrail(claimId, 'NOTE_ADDED', {
      noteId: note.id,
    });

    return note;
  }

  /**
   * Generate unique claim number
   */
  private async generateClaimNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const count = await this.prisma.claim.count({
      where: {
        claimNumber: {
          startsWith: `CLM-${year}`,
        },
      },
    });

    return `CLM-${year}-${String(count + 1).padStart(6, '0')}`;
  }

  /**
   * Create audit trail entry
   */
  private async createAuditTrail(
    entityId: string,
    action: string,
    metadata: any,
  ) {
    await this.prisma.auditTrail.create({
      data: {
        entityId,
        entityType: 'CLAIM',
        action,
        metadata,
      },
    });
  }

  /**
   * Validate status transitions
   */
  private validateStatusTransition(currentStatus: string, newStatus: string) {
    const validTransitions: Record<string, string[]> = {
      SUBMITTED: ['ASSIGNED', 'CLOSED'],
      ASSIGNED: ['SCHEDULED', 'CLOSED'],
      SCHEDULED: ['IN_ASSESSMENT', 'CANCELLED', 'CLOSED'],
      IN_ASSESSMENT: ['REPORT_PENDING', 'ESCALATED_SIU', 'CLOSED'],
      REPORT_PENDING: ['APPROVED', 'REJECTED', 'ESCALATED_SIU'],
      APPROVED: ['CLOSED'],
      REJECTED: ['CLOSED'],
      ESCALATED_SIU: ['APPROVED', 'REJECTED', 'CLOSED'],
      CANCELLED: ['CLOSED'],
    };

    const allowed = validTransitions[currentStatus] || [];
    if (!allowed.includes(newStatus)) {
      throw new BadRequestException(
        `Invalid status transition from ${currentStatus} to ${newStatus}`,
      );
    }
  }
}
