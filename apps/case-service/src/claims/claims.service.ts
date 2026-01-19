import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
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
    private readonly tenantService: TenantService
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
        vehiclePlateNumber: createClaimDto.vehiclePlateNumber,
        vehicleMake: createClaimDto.vehicleMake,
        vehicleModel: createClaimDto.vehicleModel,
        vehicleChassisNumber: createClaimDto.vehicleChassisNumber,
        vehicleEngineNumber: createClaimDto.vehicleEngineNumber,
        vehicleYear: createClaimDto.vehicleYear ? Number(createClaimDto.vehicleYear) : null,
        policeReportNumber: createClaimDto.policeReportNumber,
        policeStation: createClaimDto.policeStation,
        policeReportDate: createClaimDto.policeReportDate
          ? new Date(createClaimDto.policeReportDate)
          : null,
        isPdpaCompliant: createClaimDto.isPdpaCompliant ?? false,
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
      sortBy = 'createdAt',
      sortOrder = 'desc',
      scheduledFrom,
    } = query;
    const skip = (page - 1) * limit;

    // Build base where clause
    let where: any = {};

    if (status) where.status = status;
    if (claimType) where.claimType = claimType;
    if (adjusterId) where.adjusterId = adjusterId;
    if (scheduledFrom) {
      where.scheduledAssessmentTime = {
        gte: new Date(scheduledFrom),
      };
    }

    // Apply tenant isolation filter
    if (tenantContext) {
      where = this.tenantService.buildClaimTenantFilter(tenantContext, where);

      // Enforce claimant isolation - they can only see their own claims
      if (tenantContext.userRole === 'CLAIMANT') {
        where.claimantId = tenantContext.userId;
      }
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
          AND: [{ OR: where.OR }, { OR: searchConditions }],
        };
      } else {
        where.OR = searchConditions;
      }
    }

    // Build orderBy from sortBy and sortOrder
    const orderBy: Record<string, 'asc' | 'desc'> = { [sortBy]: sortOrder };

    const [claims, total] = await Promise.all([
      this.prisma.claim.findMany({
        where,
        skip,
        take: limit,
        orderBy,
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
              user: {
                select: {
                  fullName: true,
                  email: true,
                },
              },
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
            user: { select: { fullName: true, email: true } },
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
            deceptionScores: {
              orderBy: { createdAt: 'desc' },
            },
          },
        },
        notes: {
          orderBy: { createdAt: 'desc' },
        },
      } as any,
    });

    if (!claim) {
      throw new NotFoundException(`Claim with ID ${id} not found`);
    }

    // Validate tenant access if context provided
    if (tenantContext) {
      // Enforce claimant isolation check first
      if (tenantContext.userRole === 'CLAIMANT' && claim.claimantId !== tenantContext.userId) {
        throw new NotFoundException(`Claim with ID ${id} not found`); // Obfuscate existence
      }

      await this.tenantService.validateClaimAccess(id, tenantContext);
    }

    // Transform sessions to include persisted deception data instead of raw assessments
    const sessions = (claim as any).sessions.map((session: any) => {
      const { deceptionScores, riskAssessments, ...sessionData } = session as any;
      const latestScore = deceptionScores?.[0];

      return {
        ...sessionData,
        summary: latestScore
          ? {
              deceptionScore: Number(latestScore.deceptionScore),
              isHighRisk: Number(latestScore.deceptionScore) > 0.7,
              breakdown: {
                voiceStress: Number(latestScore.voiceStress),
                visualBehavior: Number(latestScore.visualBehavior),
                expressionMeasurement: Number(latestScore.expressionMeasurement),
              },
            }
          : {
              deceptionScore: 0,
              isHighRisk: false,
              breakdown: { voiceStress: 0, visualBehavior: 0, expressionMeasurement: 0 },
            },
        // Provide the timeline of deception scores directly
        deceptionData: (deceptionScores || []).map((ds: any) => ({
          id: ds.id,
          deception: Number(ds.deceptionScore) * 100,
          voice: Number(ds.voiceStress) * 100,
          visual: Number(ds.visualBehavior) * 100,
          expression: Number(ds.expressionMeasurement) * 100,
          createdAt: ds.createdAt,
        })),
        // Keep risk assessments for detail views
        riskAssessments: (riskAssessments || []).sort(
          (a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        ),
      };
    });

    return {
      ...claim,
      sessions,
    };
  }

  /**
   * Update a claim with tenant validation
   */
  async update(id: string, updateClaimDto: UpdateClaimDto, tenantContext?: TenantContext) {
    await this.findOne(id, tenantContext); // Verify claim exists and tenant access

    await this.prisma.claim.update({
      where: { id },
      data: {
        ...(updateClaimDto.description && {
          description: updateClaimDto.description,
        }),
        ...(updateClaimDto.incidentLocation && {
          incidentLocation: updateClaimDto.incidentLocation as any,
        }),
        vehiclePlateNumber: updateClaimDto.vehiclePlateNumber,
        vehicleMake: updateClaimDto.vehicleMake,
        vehicleModel: updateClaimDto.vehicleModel,
        policeReportNumber: updateClaimDto.policeReportNumber,
        policeStation: updateClaimDto.policeStation,
        policeReportDate: updateClaimDto.policeReportDate
          ? new Date(updateClaimDto.policeReportDate)
          : undefined,
        workshopName: updateClaimDto.workshopName,
        estimatedRepairCost: updateClaimDto.estimatedRepairCost,
        isPdpaCompliant: updateClaimDto.isPdpaCompliant,
        slaDeadline: updateClaimDto.slaDeadline ? new Date(updateClaimDto.slaDeadline) : undefined,
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
            user: { select: { fullName: true } },
          },
        },
      },
    });

    await this.createAuditTrail(id, 'CLAIM_UPDATED', {
      changes: updateClaimDto,
    });

    return this.findOne(id, tenantContext);
  }

  /**
   * Update claim status with tenant validation
   */
  async updateStatus(id: string, status: string, tenantContext?: TenantContext) {
    const existingClaim = await this.findOne(id, tenantContext);

    // Validate status transition
    this.validateStatusTransition(existingClaim.status, status);

    await this.prisma.claim.update({
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

    this.logger.log(
      `Claim ${existingClaim.claimNumber} status: ${existingClaim.status} -> ${status}`
    );

    return this.findOne(id, tenantContext);
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
      include: { user: true },
    });

    if (!adjuster) {
      throw new NotFoundException(`Adjuster with ID ${adjusterId} not found`);
    }

    // Validate adjuster belongs to the same tenant
    if (tenantContext) {
      this.tenantService.validateTenantAccess(adjuster.tenantId, tenantContext, 'Adjuster');
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
            user: {
              select: {
                fullName: true,
                email: true,
              },
            },
          },
        },
      },
    });

    await this.createAuditTrail(claimId, 'ADJUSTER_ASSIGNED', {
      adjusterId,
      adjusterName: adjuster.user.fullName,
    });

    this.logger.log(`Adjuster ${adjuster.user.fullName} assigned to claim ${claim.claimNumber}`);

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
   * Get tenant-wide claim statistics
   */
  async getStats(tenantContext: TenantContext) {
    const where = this.tenantService.buildClaimTenantFilter(tenantContext);

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const startOfWeek = new Date(now.getTime() - now.getDay() * 24 * 60 * 60 * 1000);
    startOfWeek.setHours(0, 0, 0, 0);

    const [
      totalClaims,
      activeClaims,
      completedThisMonth,
      completedLastMonth,
      completedThisWeek,
      upcomingScheduled,
      totalAssigned,
      statusBreakdown,
    ] = await Promise.all([
      // Total claims in tenant
      this.prisma.claim.count({ where }),

      // Active claims in tenant
      this.prisma.claim.count({
        where: {
          ...where,
          status: {
            in: ['ASSIGNED', 'SCHEDULED', 'IN_ASSESSMENT', 'REPORT_PENDING'],
          },
        },
      }),

      // Completed this month in tenant
      this.prisma.claim.count({
        where: {
          ...where,
          status: { in: ['APPROVED', 'REJECTED', 'CLOSED'] },
          updatedAt: { gte: startOfMonth },
        },
      }),

      // Completed last month in tenant
      this.prisma.claim.count({
        where: {
          ...where,
          status: { in: ['APPROVED', 'REJECTED', 'CLOSED'] },
          updatedAt: {
            gte: startOfLastMonth,
            lt: startOfMonth,
          },
        },
      }),

      // Completed this week in tenant
      this.prisma.claim.count({
        where: {
          ...where,
          status: { in: ['APPROVED', 'REJECTED', 'CLOSED'] },
          updatedAt: { gte: startOfWeek },
        },
      }),

      this.prisma.claim.count({
        where: {
          ...where,
          scheduledAssessmentTime: {
            gte: now,
          },
        },
      }),

      this.prisma.claim.count({
        where: {
          ...where,
          status: 'ASSIGNED',
        },
      }),

      // Status breakdown
      this.prisma.claim.groupBy({
        by: ['status'],
        where,
        _count: { status: true },
      }),
    ]);

    // Calculate monthly change percentage
    let monthlyChange = 0;
    if (completedLastMonth > 0) {
      monthlyChange = ((completedThisMonth - completedLastMonth) / completedLastMonth) * 100;
    } else if (completedThisMonth > 0) {
      monthlyChange = 100; // 100% increase if there were 0 last month
    }

    return {
      stats: {
        totalClaims,
        activeClaims,
        completedThisMonth,
        completedThisWeek,
        averagePerDay: completedThisWeek / 7,
        inProgress: upcomingScheduled, // Upcoming scheduled sessions
        totalAssigned, // Total assigned claims
        monthlyChange: parseFloat(monthlyChange.toFixed(1)),
      },
      statusBreakdown: statusBreakdown.reduce(
        (acc, item) => {
          acc[item.status] = item._count.status;
          return acc;
        },
        {} as Record<string, number>
      ),
    };
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
  private async createAuditTrail(entityId: string, action: string, metadata: any) {
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
      SUBMITTED: ['ASSIGNED', 'CLOSED', 'APPROVED', 'REJECTED'],
      ASSIGNED: ['SCHEDULED', 'CLOSED', 'APPROVED', 'REJECTED'],
      SCHEDULED: ['IN_ASSESSMENT', 'CANCELLED', 'CLOSED', 'APPROVED', 'REJECTED'],
      IN_ASSESSMENT: ['REPORT_PENDING', 'ESCALATED_SIU', 'CLOSED', 'APPROVED', 'REJECTED'],
      REPORT_PENDING: ['APPROVED', 'REJECTED', 'ESCALATED_SIU'],
      APPROVED: ['CLOSED'],
      REJECTED: ['CLOSED'],
      ESCALATED_SIU: ['APPROVED', 'REJECTED', 'CLOSED'],
      CANCELLED: ['CLOSED'],
    };

    const allowed = validTransitions[currentStatus] || [];
    if (!allowed.includes(newStatus)) {
      throw new BadRequestException(
        `Invalid status transition from ${currentStatus} to ${newStatus}`
      );
    }
  }
}
