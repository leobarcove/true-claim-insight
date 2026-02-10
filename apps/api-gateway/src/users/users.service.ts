import { Injectable, Logger, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../config/prisma.service';
import { RegisterDto } from '../auth/dto/register.dto';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(private readonly prisma: PrismaService) {}

  async create(data: RegisterDto & { password: string }) {
    const userData: any = {
      email: data.email,
      password: data.password,
      fullName: data.fullName,
      phoneNumber: data.phoneNumber,
      role: data.role,
      licenseNumber: data.licenseNumber,
      tenantId: data.tenantId,
      currentTenantId: data.tenantId, // Set current tenant on registration
    };

    // If role is ADJUSTER, we need to create an Adjuster record too
    if (data.role === 'ADJUSTER' && data.licenseNumber && data.tenantId) {
      userData.adjuster = {
        create: {
          licenseNumber: data.licenseNumber,
          tenantId: data.tenantId,
          status: 'ACTIVE',
        },
      };
    }

    // Create UserTenant relationship if tenantId is provided
    if (data.tenantId) {
      userData.userTenants = {
        create: {
          tenantId: data.tenantId,
          role: data.role,
          isDefault: true, // First tenant is always default
          status: 'ACTIVE',
        },
      };
    }

    const user = await this.prisma.user.create({
      data: userData,
      include: {
        tenant: true,
        currentTenant: true,
        adjuster: true,
        userTenants: {
          include: {
            tenant: true,
          },
        },
      },
    });

    this.logger.log(`User created: ${user.id} (Role: ${user.role})`);

    return user;
  }

  async findByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: { email },
      include: {
        tenant: true,
        currentTenant: true,
        adjuster: true,
        userTenants: true,
      },
    });
  }

  async findById(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      include: {
        tenant: true,
        currentTenant: true,
        adjuster: true,
        userTenants: true,
      },
    });
  }

  async findAll(tenantId?: string) {
    if (!tenantId) {
      // If no tenant context, return empty (security default)
      return [];
    }

    return this.prisma.user.findMany({
      where: {
        OR: [
          // User's primary/current tenant is this tenant
          { currentTenantId: tenantId },
          { tenantId: tenantId },
          // OR user has a membership in this tenant
          {
            userTenants: {
              some: {
                tenantId: tenantId,
                status: 'ACTIVE',
              },
            },
          },
        ],
      },
      select: {
        id: true,
        email: true,
        fullName: true,
        phoneNumber: true,
        role: true,
        licenseNumber: true,
        tenantId: true,
        currentTenantId: true,
        createdAt: true,
        lastLoginAt: true,
        tenant: {
          select: {
            id: true,
            name: true,
          },
        },
        userTenants: {
          where: { tenantId }, // Only return membership for requested tenant
          select: {
            role: true,
            status: true,
            isDefault: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async updateLastLogin(id: string) {
    return this.prisma.user.update({
      where: { id },
      data: { lastLoginAt: new Date() },
    });
  }

  async update(id: string, data: Partial<RegisterDto>) {
    const user = await this.prisma.user.findUnique({
      where: { id },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return this.prisma.user.update({
      where: { id },
      data: {
        fullName: data.fullName,
        phoneNumber: data.phoneNumber,
        licenseNumber: data.licenseNumber,
        adjuster:
          user.role === 'ADJUSTER' && data.licenseNumber
            ? {
                update: {
                  licenseNumber: data.licenseNumber,
                },
              }
            : undefined,
      },
      include: {
        tenant: true,
        adjuster: true,
      },
    });
  }

  async updatePassword(id: string, password: string) {
    return this.prisma.user.update({
      where: { id },
      data: { password },
    });
  }

  async delete(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    await this.prisma.user.delete({
      where: { id },
    });

    this.logger.log(`User deleted: ${id}`);

    return { deleted: true };
  }

  // Multi-tenant support methods

  async getUserTenants(userId: string) {
    const userTenants = await this.prisma.userTenant.findMany({
      where: { userId },
      include: {
        tenant: {
          select: {
            id: true,
            name: true,
            type: true,
          },
        },
      },
      orderBy: [{ isDefault: 'desc' }, { lastAccessedAt: 'desc' }],
    });

    return userTenants.map(ut => ({
      tenantId: ut.tenantId,
      tenantName: ut.tenant.name,
      tenantType: ut.tenant.type,
      role: ut.role,
      isDefault: ut.isDefault,
      status: ut.status,
      lastAccessedAt: ut.lastAccessedAt,
    }));
  }

  async getUserTenant(userId: string, tenantId: string) {
    return this.prisma.userTenant.findUnique({
      where: {
        userId_tenantId: {
          userId,
          tenantId,
        },
      },
    });
  }

  async updateCurrentTenant(userId: string, tenantId: string) {
    // Update last accessed time for the tenant
    await this.prisma.userTenant.update({
      where: {
        userId_tenantId: {
          userId,
          tenantId,
        },
      },
      data: {
        lastAccessedAt: new Date(),
      },
    });

    // Update user's current tenant
    return this.prisma.user.update({
      where: { id: userId },
      data: { currentTenantId: tenantId },
      include: {
        tenant: true,
        currentTenant: true,
        adjuster: true,
      },
    });
  }

  async logTenantAccess(
    userId: string,
    fromTenantId: string | null | undefined,
    toTenantId: string,
    ipAddress?: string,
    userAgent?: string
  ) {
    return this.prisma.tenantAccessLog.create({
      data: {
        userId,
        fromTenantId: fromTenantId || undefined,
        toTenantId,
        ipAddress,
        userAgent,
      },
    });
  }
}
