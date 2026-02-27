import { Injectable, Logger, ConflictException } from '@nestjs/common';
import { PrismaService } from '../config/prisma.service';
import { CreateVehicleMakeDto } from './dto/create-vehicle-make.dto';
import { CreateVehicleModelDto } from './dto/create-vehicle-model.dto';
import { TenantContext } from '../auth/guards/tenant.guard';

@Injectable()
export class MasterDataService {
  private readonly logger = new Logger(MasterDataService.name);

  constructor(private readonly prisma: PrismaService) {}

  async findAllMakes(tenant: TenantContext) {
    const isSuperAdmin = tenant.tenantId === 'SUPER_ADMIN' || tenant.userRole === 'SUPER_ADMIN';
    const tenantFilter = isSuperAdmin
      ? {}
      : { OR: [{ tenantId: null }, { tenantId: tenant.tenantId }] };

    return this.prisma.vehicleMake.findMany({
      where: tenantFilter as any,
      orderBy: { name: 'asc' },
      include: {
        models: {
          where: tenantFilter as any,
          orderBy: { name: 'asc' },
        },
      },
    });
  }

  async getVehicleStructure(tenant: TenantContext) {
    const makes = await this.findAllMakes(tenant);
    const structure: Record<string, string[]> = {};
    makes.forEach(make => {
      structure[make.name] = make.models.map(model => model.name);
    });
    return structure;
  }

  async findModelsByMake(makeId: string, tenant: TenantContext) {
    const isSuperAdmin = tenant.tenantId === 'SUPER_ADMIN' || tenant.userRole === 'SUPER_ADMIN';
    const tenantFilter = isSuperAdmin
      ? {}
      : { OR: [{ tenantId: null }, { tenantId: tenant.tenantId }] };

    return this.prisma.vehicleModel.findMany({
      where: {
        makeId,
        ...tenantFilter,
      } as any,
      orderBy: { name: 'asc' },
    });
  }

  async createMake(data: CreateVehicleMakeDto, tenant: TenantContext) {
    try {
      return await this.prisma.vehicleMake.create({
        data: {
          ...data,
          tenantId: tenant.tenantId,
          userId: tenant.userId,
        } as any,
      });
    } catch (error) {
      if ((error as any).code === 'P2002') {
        throw new ConflictException('Vehicle make already exists');
      }
      throw error;
    }
  }

  async createModel(data: CreateVehicleModelDto, tenant: TenantContext) {
    try {
      return await this.prisma.vehicleModel.create({
        data: {
          name: data.name,
          makeId: data.makeId,
          tenantId: tenant.tenantId,
          userId: tenant.userId,
        } as any,
      });
    } catch (error) {
      if ((error as any).code === 'P2002') {
        throw new ConflictException('Vehicle model already exists for this make');
      }
      throw error;
    }
  }

  async updateMake(id: string, data: Partial<CreateVehicleMakeDto>, tenant: TenantContext) {
    try {
      // Validate ownership first
      const make = await this.prisma.vehicleMake.findUnique({ where: { id } });
      if (!make || (make.tenantId !== tenant.tenantId && tenant.tenantId !== 'SUPER_ADMIN')) {
        throw new ConflictException('Make not found or no permission to update');
      }

      return await this.prisma.vehicleMake.update({
        where: { id },
        data,
      });
    } catch (error) {
      if ((error as any).code === 'P2025') {
        throw new ConflictException('Make not found or no permission to update');
      }
      if ((error as any).code === 'P2002') {
        throw new ConflictException('Vehicle make already exists');
      }
      throw error;
    }
  }

  async deleteMake(id: string, tenant: TenantContext) {
    const make = await this.prisma.vehicleMake.findUnique({ where: { id } });
    if (!make || (make.tenantId !== tenant.tenantId && tenant.tenantId !== 'SUPER_ADMIN')) {
      throw new ConflictException('Make not found or no permission to delete');
    }

    return this.prisma.vehicleMake.delete({
      where: { id },
    });
  }

  async updateModel(id: string, data: Partial<CreateVehicleModelDto>, tenant: TenantContext) {
    try {
      // Validate ownership
      const model = await this.prisma.vehicleModel.findUnique({ where: { id } });
      if (!model || (model.tenantId !== tenant.tenantId && tenant.tenantId !== 'SUPER_ADMIN')) {
        throw new ConflictException('Model not found or no permission to update');
      }

      return await this.prisma.vehicleModel.update({
        where: { id },
        data: {
          name: data.name,
          makeId: data.makeId,
        },
      });
    } catch (error) {
      if ((error as any).code === 'P2025') {
        throw new ConflictException('Model not found or no permission to update');
      }
      if ((error as any).code === 'P2002') {
        throw new ConflictException('Vehicle model already exists for this make');
      }
      throw error;
    }
  }

  async deleteModel(id: string, tenant: TenantContext) {
    const model = await this.prisma.vehicleModel.findUnique({ where: { id } });
    if (!model || (model.tenantId !== tenant.tenantId && tenant.tenantId !== 'SUPER_ADMIN')) {
      throw new ConflictException('Model not found or no permission to delete');
    }

    return this.prisma.vehicleModel.delete({
      where: { id },
    });
  }

  // Helper for seeding/checking
  async upsertMake(name: string, tenantId: string | null = null) {
    return this.prisma.vehicleMake.upsert({
      where: {
        tenantId_name: {
          name,
          tenantId,
        },
      } as any,
      update: { tenantId },
      create: { name, tenantId },
    });
  }
}
