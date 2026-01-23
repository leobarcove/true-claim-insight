import { Injectable, Logger, ConflictException } from '@nestjs/common';
import { PrismaService } from '../config/prisma.service';
import { CreateVehicleMakeDto } from './dto/create-vehicle-make.dto';
import { CreateVehicleModelDto } from './dto/create-vehicle-model.dto';

@Injectable()
export class MasterDataService {
  private readonly logger = new Logger(MasterDataService.name);

  constructor(private readonly prisma: PrismaService) {}

  async findAllMakes() {
    return this.prisma.vehicleMake.findMany({
      orderBy: { name: 'asc' },
      include: {
        models: {
          orderBy: { name: 'asc' },
        },
      },
    });
  }

  async findModelsByMake(makeId: string) {
    return this.prisma.vehicleModel.findMany({
      where: { makeId },
      orderBy: { name: 'asc' },
    });
  }

  async createMake(data: CreateVehicleMakeDto) {
    try {
      return await this.prisma.vehicleMake.create({
        data,
      });
    } catch (error) {
      if ((error as any).code === 'P2002') {
        throw new ConflictException('Vehicle make already exists');
      }
      throw error;
    }
  }

  async createModel(data: CreateVehicleModelDto) {
    try {
      return await this.prisma.vehicleModel.create({
        data: {
          name: data.name,
          make: { connect: { id: data.makeId } },
        },
      });
    } catch (error) {
      if ((error as any).code === 'P2002') {
        throw new ConflictException('Vehicle model already exists for this make');
      }
      throw error;
    }
  }

  async updateMake(id: string, data: Partial<CreateVehicleMakeDto>) {
    try {
      return await this.prisma.vehicleMake.update({
        where: { id },
        data,
      });
    } catch (error) {
      if ((error as any).code === 'P2002') {
        throw new ConflictException('Vehicle make already exists');
      }
      throw error;
    }
  }

  async deleteMake(id: string) {
    return this.prisma.vehicleMake.delete({
      where: { id },
    });
  }

  async updateModel(id: string, data: Partial<CreateVehicleModelDto>) {
    try {
      return await this.prisma.vehicleModel.update({
        where: { id },
        data: {
          name: data.name,
          makeId: data.makeId,
        },
      });
    } catch (error) {
      if ((error as any).code === 'P2002') {
        throw new ConflictException('Vehicle model already exists for this make');
      }
      throw error;
    }
  }

  async deleteModel(id: string) {
    return this.prisma.vehicleModel.delete({
      where: { id },
    });
  }

  // Helper for seeding/checking
  async upsertMake(name: string) {
    return this.prisma.vehicleMake.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }
}
