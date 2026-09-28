import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  CLAIMANT_ROLE,
  isRoleAllowedInTenant,
  PLATFORM_ROLE,
  TENANT_ROLES,
} from '@tci/shared-types';

import { PrismaService } from '../config/prisma.service';
import { UserRole } from '@prisma/client';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create a person, optionally with a membership.
   *
   * The membership carries the role. Without one — self-registration — the
   * account is inert: it can sign in and read its own profile, and nothing
   * else, until a firm administrator grants it a membership. The `role` column
   * is kept in step with the first membership for older readers, but it grants
   * nothing on its own; only `SUPER_ADMIN` is read from it, and that is never
   * written here.
   *
   * Callers granting a membership must have checked it with
   * `assertMembershipGrantable` first.
   */
  async create(data: {
    email: string;
    password: string;
    fullName: string;
    phoneNumber: string;
    licenseNumber?: string;
    isVerified?: boolean;
    membership?: { tenantId: string; role: UserRole };
  }) {
    const membership = data.membership;
    const userData: any = {
      email: data.email,
      password: data.password,
      fullName: data.fullName,
      phoneNumber: data.phoneNumber,
      role: membership?.role ?? UserRole.ADJUSTER,
      licenseNumber: data.licenseNumber,
      tenantId: membership?.tenantId,
      currentTenantId: membership?.tenantId,
      isVerified: data.isVerified ?? false,
    };

    // An adjusting employee gets the professional profile the PD controls hang on.
    if (membership?.role === UserRole.ADJUSTER && data.licenseNumber) {
      userData.adjuster = {
        create: {
          licenseNumber: data.licenseNumber,
          tenantId: membership.tenantId,
          status: 'ACTIVE',
        },
      };
    }

    if (membership) {
      userData.userTenants = {
        create: {
          tenantId: membership.tenantId,
          role: membership.role,
          isDefault: true,
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

  /**
   * A staff member by the number they sign in with.
   *
   * Unique in the schema, so this can return one row or none — which is the
   * whole reason the constraint exists. Two accounts on one number would make
   * the lookup pick, and a wrong pick attributes a claimant's data to the wrong
   * person. Used only by the agent-assisted form's sign-in, where there is no
   * password and the number *is* the identifier.
   */
  async findByPhoneNumber(phoneNumber: string) {
    return this.prisma.user.findUnique({
      where: { phoneNumber },
      include: {
        tenant: true,
        currentTenant: true,
        adjuster: true,
        userTenants: true,
      },
    });
  }

  /** Match the two public credentials recorded for a PIAM-registered agent. */
  async isPiamRegisteredAgent(registrationNumber: string, phoneNumber: string): Promise<boolean> {
    return Boolean(await this.findPiamRegisteredAgent(registrationNumber, phoneNumber));
  }

  async findPiamRegisteredAgent(registrationNumber: string, phoneNumber: string) {
    const normalizedPhone = phoneNumber.replace(/^\+/, '');
    const rows = await this.prisma.$queryRaw<
      Array<{
        id: string;
        registrationNumber: string;
        agentName: string | null;
        agencyName: string;
        phoneNumber: string;
        tenantId: string | null;
        /** The organisation's own name, for display. Null until it is linked. */
        tenantName: string | null;
      }>
    >`
      SELECT p."id", p."registrationNumber", p."agentName", p."agencyName", p."phoneNumber",
             p."tenantId", t."name" AS "tenantName"
      FROM "piam_registered_agents" p
      LEFT JOIN "tenants" t ON t."id" = p."tenantId"
      WHERE UPPER("registrationNumber") = UPPER(${registrationNumber.trim()})
        AND regexp_replace("phoneNumber", '^\\+', '') = ${normalizedPhone}
      LIMIT 1
    `;
    return rows[0] ?? null;
  }

  async findPiamRegisteredAgentById(id: string) {
    const rows = await this.prisma.$queryRaw<
      Array<{
        id: string;
        registrationNumber: string;
        agentName: string | null;
        agencyName: string;
        phoneNumber: string;
        tenantId: string | null;
        /** The organisation's own name, for display. Null until it is linked. */
        tenantName: string | null;
      }>
    >`
      SELECT p."id", p."registrationNumber", p."agentName", p."agencyName", p."phoneNumber",
             p."tenantId", t."name" AS "tenantName"
      FROM "piam_registered_agents" p
      LEFT JOIN "tenants" t ON t."id" = p."tenantId"
      WHERE p."id" = ${id}
      LIMIT 1
    `;
    return rows[0] ?? null;
  }

  async findById(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      include: {
        tenant: true,
        currentTenant: true,
        adjuster: true,
        // The tenant type decides which roles a membership may carry.
        userTenants: { include: { tenant: { select: { type: true } } } },
      },
    });
  }

  /**
   * May `actor` grant `role` in `tenantId`?
   *
   * - The role must be able to exist in that kind of tenant (TENANT_ROLES).
   *   An adjuster inside an insurer is refused — that is the independence
   *   the PD requires, not a preference.
   * - `SUPER_ADMIN` and `CLAIMANT` are never granted through the API: the
   *   first is provisioned by the operator out of band, the second is a
   *   separate identity with no membership at all.
   * - A firm administrator grants only inside their own active tenant.
   */
  async assertMembershipGrantable(
    grant: { tenantId: string | null | undefined; role: string | null | undefined },
    actor: { role: string | null | undefined; activeTenantId: string | null | undefined }
  ): Promise<{ tenantId: string; role: UserRole }> {
    const { tenantId, role } = grant;
    if (!tenantId || !role) {
      throw new BadRequestException('A membership needs both a tenant and a role.');
    }
    if (role === PLATFORM_ROLE || role === CLAIMANT_ROLE) {
      throw new ForbiddenException(`The ${role} role cannot be granted through a membership.`);
    }
    if (actor.role !== PLATFORM_ROLE && actor.activeTenantId !== tenantId) {
      throw new ForbiddenException('You can only grant access within your own organisation.');
    }
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { type: true },
    });
    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }
    if (!isRoleAllowedInTenant(role, tenant.type)) {
      throw new ForbiddenException(
        `A ${role} cannot exist in a ${tenant.type} organisation (roles allowed there: ${TENANT_ROLES[
          tenant.type as keyof typeof TENANT_ROLES
        ].join(', ')}).`
      );
    }
    return { tenantId, role: role as UserRole };
  }

  async findAll(tenantId?: string) {
    if (!tenantId) {
      return [];
    }

    const where: any =
      tenantId === 'SUPER_ADMIN'
        ? { role: { not: UserRole.SUPER_ADMIN }, OR: [{ tenantId: null, currentTenantId: null }] }
        : {
            role: { not: UserRole.SUPER_ADMIN },
            OR: [
              { currentTenantId: tenantId },
              { tenantId: tenantId },
              {
                userTenants: {
                  some: {
                    tenantId: tenantId,
                    status: 'ACTIVE',
                  },
                },
              },
              { tenantId: null, currentTenantId: null },
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
        isVerified: true,
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

  async update(
    id: string,
    data: { fullName?: string; phoneNumber?: string; licenseNumber?: string }
  ) {
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

  async setVerified(id: string, isVerified: boolean = true) {
    return this.prisma.user.update({
      where: { id },
      data: { isVerified } as any,
    });
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
    await this.prisma.userTenant.updateMany({
      where: { userId, tenantId },
      data: { lastAccessedAt: new Date() },
    });

    // Only switch currentTenantId if the user actually has a valid membership record.
    const userTenant = await this.prisma.userTenant.findUnique({
      where: { userId_tenantId: { userId, tenantId } },
    });

    return this.prisma.user.update({
      where: { id: userId },
      data: {
        currentTenantId: userTenant ? tenantId : undefined,
      },
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

  async findAllUserTenantsByTenantId(tenantId: string) {
    return this.prisma.userTenant.findMany({
      include: {
        user: true,
        tenant: true,
      },
      where: {
        tenantId,
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
    // The operator grants these, but the role must still be able to exist in
    // that kind of tenant — the rule does not bend for the platform.
    await this.assertMembershipGrantable(
      { tenantId: data.tenantId, role: data.role },
      { role: PLATFORM_ROLE, activeTenantId: null }
    );

    // If setting as default, unset other defaults for this user
    if (data.isDefault) {
      await this.prisma.userTenant.updateMany({
        where: { userId: data.userId },
        data: { isDefault: false },
      });
    }

    const association = await this.prisma.userTenant.create({
      data: {
        userId: data.userId,
        tenantId: data.tenantId,
        role: data.role as any,
        isDefault: data.isDefault ?? false,
        status: 'ACTIVE',
      },
      include: { user: true, tenant: true },
    });

    // Update user: set verified and also update tenant context if needed
    const user = await this.prisma.user.findUnique({ where: { id: data.userId } });
    if (!user) throw new NotFoundException('User not found');

    const updateData: any = {};
    if (data.isDefault || !user.tenantId) {
      updateData.tenantId = data.tenantId;
    }
    if (data.isDefault || !user.currentTenantId) {
      updateData.currentTenantId = data.tenantId;
    }

    await this.prisma.user.update({
      where: { id: data.userId },
      data: updateData,
    });

    return association;
  }

  async updateUserTenant(id: string, data: { role?: string; isDefault?: boolean }) {
    const ut = await this.prisma.userTenant.findUnique({ where: { id } });
    if (!ut) throw new NotFoundException('Association not found');

    if (data.role) {
      await this.assertMembershipGrantable(
        { tenantId: ut.tenantId, role: data.role },
        { role: PLATFORM_ROLE, activeTenantId: null }
      );
    }

    if (data.isDefault) {
      // Unset other defaults for this user
      await this.prisma.userTenant.updateMany({
        where: { userId: ut.userId, id: { not: id } },
        data: { isDefault: false },
      });

      // Update user record to reflect new default
      await this.prisma.user.update({
        where: { id: ut.userId },
        data: {
          tenantId: ut.tenantId,
          currentTenantId: ut.tenantId,
        },
      });
    }

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

    const userId = ut.userId;
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    const wasPrimary = user?.tenantId === ut.tenantId || user?.currentTenantId === ut.tenantId;

    await this.prisma.userTenant.delete({ where: { id } });

    // Check if user has any remaining associations
    const remainingCount = await this.prisma.userTenant.count({
      where: { userId },
    });

    if (remainingCount === 0) {
      await this.prisma.user.update({
        where: { id: userId },
        data: {
          tenantId: null,
          currentTenantId: null,
        },
      });
    } else if (wasPrimary || ut.isDefault) {
      // If we deleted the primary/default tenant, pick a new one
      const nextRemaining = await this.prisma.userTenant.findFirst({
        where: { userId },
        orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
      });

      if (nextRemaining) {
        await this.prisma.user.update({
          where: { id: userId },
          data: {
            tenantId: nextRemaining.tenantId,
            currentTenantId: nextRemaining.tenantId,
          },
        });
      }
    }

    return { deleted: true };
  }
}
