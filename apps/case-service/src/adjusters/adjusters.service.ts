import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../config/prisma.service';
import { TenantService } from '../tenant/tenant.service';
import { TenantContext } from '../common/guards/tenant.guard';

@Injectable()
export class AdjustersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantService: TenantService,
  ) {}

  /**
   * Get adjuster's case queue with tenant validation
   */
  async getQueue(adjusterId: string, status?: string, tenantContext?: TenantContext) {
    const adjuster = await this.prisma.adjuster.findUnique({
      where: { id: adjusterId },
    });

    if (!adjuster) {
      throw new NotFoundException(`Adjuster with ID ${adjusterId} not found`);
    }

    // Validate tenant access - ensure adjuster belongs to user's organisation
    if (tenantContext) {
      this.tenantService.validateTenantAccess(
        adjuster.tenantId,
        tenantContext,
        'Adjuster',
      );
    }

    const where: any = { adjusterId };
    if (status) {
      where.status = status;
    } else {
      // Default: show active cases
      where.status = {
        in: ['ASSIGNED', 'SCHEDULED', 'IN_ASSESSMENT', 'REPORT_PENDING'],
      };
    }

    const claims = await this.prisma.claim.findMany({
      where,
      orderBy: [
        { status: 'asc' },
        { createdAt: 'asc' },
      ],
      include: {
        claimant: {
          select: {
            id: true,
            fullName: true,
            phoneNumber: true,
          },
        },
        sessions: {
          where: {
            status: { in: ['SCHEDULED', 'WAITING'] },
          },
          orderBy: { scheduledTime: 'asc' },
          take: 1,
        },
        _count: {
          select: {
            documents: true,
            notes: true,
          },
        },
      },
    });

    return {
      adjusterId,
      adjusterName: adjuster.fullName,
      totalCases: claims.length,
      cases: claims,
    };
  }

  /**
   * Get adjuster statistics with tenant validation
   */
  async getStats(adjusterId: string, tenantContext?: TenantContext) {
    const adjuster = await this.prisma.adjuster.findUnique({
      where: { id: adjusterId },
    });

    if (!adjuster) {
      throw new NotFoundException(`Adjuster with ID ${adjusterId} not found`);
    }

    // Validate tenant access
    if (tenantContext) {
      this.tenantService.validateTenantAccess(
        adjuster.tenantId,
        tenantContext,
        'Adjuster',
      );
    }

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfWeek = new Date(now.setDate(now.getDate() - now.getDay()));

    const [
      totalClaims,
      activeClaims,
      completedThisMonth,
      completedThisWeek,
      statusBreakdown,
    ] = await Promise.all([
      // Total claims ever assigned
      this.prisma.claim.count({
        where: { adjusterId },
      }),

      // Active claims
      this.prisma.claim.count({
        where: {
          adjusterId,
          status: {
            in: ['ASSIGNED', 'SCHEDULED', 'IN_ASSESSMENT', 'REPORT_PENDING'],
          },
        },
      }),

      // Completed this month
      this.prisma.claim.count({
        where: {
          adjusterId,
          status: { in: ['APPROVED', 'REJECTED', 'CLOSED'] },
          updatedAt: { gte: startOfMonth },
        },
      }),

      // Completed this week
      this.prisma.claim.count({
        where: {
          adjusterId,
          status: { in: ['APPROVED', 'REJECTED', 'CLOSED'] },
          updatedAt: { gte: startOfWeek },
        },
      }),

      // Status breakdown
      this.prisma.claim.groupBy({
        by: ['status'],
        where: { adjusterId },
        _count: { status: true },
      }),
    ]);

    return {
      adjusterId,
      adjusterName: adjuster.fullName,
      stats: {
        totalClaims,
        activeClaims,
        completedThisMonth,
        completedThisWeek,
        averagePerDay: completedThisWeek / 7,
      },
      statusBreakdown: statusBreakdown.reduce(
        (acc, item) => {
          acc[item.status] = item._count.status;
          return acc;
        },
        {} as Record<string, number>,
      ),
    };
  }

  /**
   * Get adjuster workload for smart assignment with tenant validation
   */
  async getWorkload(adjusterId: string, tenantContext?: TenantContext) {
    const adjuster = await this.prisma.adjuster.findUnique({
      where: { id: adjusterId },
    });

    if (!adjuster) {
      throw new NotFoundException(`Adjuster with ID ${adjusterId} not found`);
    }

    // Validate tenant access
    if (tenantContext) {
      this.tenantService.validateTenantAccess(
        adjuster.tenantId,
        tenantContext,
        'Adjuster',
      );
    }

    const activeClaims = await this.prisma.claim.count({
      where: {
        adjusterId,
        status: {
          in: ['ASSIGNED', 'SCHEDULED', 'IN_ASSESSMENT', 'REPORT_PENDING'],
        },
      },
    });

    const scheduledSessions = await this.prisma.session.count({
      where: {
        claim: { adjusterId },
        status: 'SCHEDULED',
        scheduledTime: { gte: new Date() },
      },
    });

    // Calculate workload score (0-100, lower is better for assignment)
    const maxCases = 10; // Maximum recommended active cases
    const workloadScore = Math.min((activeClaims / maxCases) * 100, 100);

    return {
      adjusterId,
      adjusterName: adjuster.fullName,
      activeClaims,
      scheduledSessions,
      workloadScore,
      isAvailable: workloadScore < 80 && adjuster.status === 'ACTIVE',
    };
  }

  /**
   * Get available adjusters for assignment
   */
  async getAvailableAdjusters(tenantId: string) {
    const adjusters = await this.prisma.adjuster.findMany({
      where: {
        tenantId,
        status: 'ACTIVE',
      },
      include: {
        _count: {
          select: {
            claims: {
              where: {
                status: {
                  in: ['ASSIGNED', 'SCHEDULED', 'IN_ASSESSMENT', 'REPORT_PENDING'],
                },
              },
            },
          },
        },
      },
    });

    // Calculate workload and sort by availability
    const adjustersWithWorkload = adjusters.map((adjuster) => {
      const activeClaims = adjuster._count.claims;
      const maxCases = 10;
      const workloadScore = Math.min((activeClaims / maxCases) * 100, 100);

      return {
        id: adjuster.id,
        fullName: adjuster.fullName,
        email: adjuster.email,
        licenseNumber: adjuster.licenseNumber,
        bcillaCertified: adjuster.bcillaCertified,
        activeClaims,
        workloadScore,
        isAvailable: workloadScore < 80,
      };
    });

    // Sort by workload (lowest first)
    adjustersWithWorkload.sort((a, b) => a.workloadScore - b.workloadScore);

    return {
      tenantId,
      totalAdjusters: adjusters.length,
      availableAdjusters: adjustersWithWorkload.filter((a) => a.isAvailable).length,
      adjusters: adjustersWithWorkload,
    };
  }
}
