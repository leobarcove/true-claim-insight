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

    const where: any =
      tenantId === 'SUPER_ADMIN'
        ? {}
        : {
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
          };

    return this.prisma.user.findMany({
      where,
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
        updatedAt: true,
        lastLoginAt: true,
        tenant: {
          select: {
            id: true,
            name: true,
          },
        },
        userTenants:
          tenantId === 'SUPER_ADMIN'
            ? {
                select: {
                  role: true,
                  status: true,
                  isDefault: true,
                },
              }
            : {
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
    // Update last accessed time for the tenant if record exists
    try {
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
    } catch (error) {
      // If the record doesn't exist (e.g. for SUPER_ADMIN), we skip this update
      this.logger.debug(
        `Could not update lastAccessedAt for user ${userId} and tenant ${tenantId}. Record might not exist.`
      );
    }

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

  async findAllTenants() {
    return this.prisma.tenant.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  async createTenant(data: { name: string; type: string; subscriptionTier?: string }) {
    return this.prisma.tenant.create({
      data: {
        name: data.name,
        type: data.type as any,
        subscriptionTier: (data.subscriptionTier as any) || 'BASIC',
      },
    });
  }

  async updateTenant(
    id: string,
    data: { name?: string; type?: string; subscriptionTier?: string }
  ) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id } });
    if (!tenant) throw new NotFoundException('Tenant not found');
    return this.prisma.tenant.update({
      where: { id },
      data: {
        name: data.name,
        type: data.type as any,
        subscriptionTier: data.subscriptionTier as any,
      },
    });
  }

  async deleteTenant(id: string) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id } });
    if (!tenant) throw new NotFoundException('Tenant not found');
    await this.prisma.tenant.delete({ where: { id } });
    return { deleted: true };
  }

  async findAllUserTenants() {
    return this.prisma.userTenant.findMany({
      include: {
        user: true,
        tenant: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createUserTenant(data: {
    userId: string;
    tenantId: string;
    role: string;
    isDefault?: boolean;
  }) {
    return this.prisma.userTenant.create({
      data: {
        userId: data.userId,
        tenantId: data.tenantId,
        role: data.role as any,
        isDefault: data.isDefault ?? false,
        status: 'ACTIVE',
      },
      include: { user: true, tenant: true },
    });
  }

  async updateUserTenant(id: string, data: { role?: string; isDefault?: boolean }) {
    const ut = await this.prisma.userTenant.findUnique({ where: { id } });
    if (!ut) throw new NotFoundException('Association not found');
    return this.prisma.userTenant.update({
      where: { id },
      data: {
        role: data.role as any,
        isDefault: data.isDefault,
      },
      include: { user: true, tenant: true },
    });
  }

  async deleteUserTenant(id: string) {
    const ut = await this.prisma.userTenant.findUnique({ where: { id } });
    if (!ut) throw new NotFoundException('Association not found');
    await this.prisma.userTenant.delete({ where: { id } });
    return { deleted: true };
  }
}
