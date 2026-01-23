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

    const user = await this.prisma.user.create({
      data: userData,
      include: {
        tenant: true,
        adjuster: true,
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
      },
    });
  }

  async findById(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      include: {
        tenant: true,
        adjuster: true,
      },
    });
  }

  async findAll(tenantId?: string) {
    return this.prisma.user.findMany({
      where: tenantId ? { tenantId } : undefined,
      select: {
        id: true,
        email: true,
        fullName: true,
        phoneNumber: true,
        role: true,
        licenseNumber: true,
        tenantId: true,
        createdAt: true,
        lastLoginAt: true,
        tenant: {
          select: {
            id: true,
            name: true,
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
}
