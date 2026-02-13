import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  Query,
  Patch,
  Delete,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { MasterDataService } from './master-data.service';
import { CreateVehicleMakeDto } from './dto/create-vehicle-make.dto';
import { CreateVehicleModelDto } from './dto/create-vehicle-model.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { TenantGuard, TenantContext } from '../auth/guards/tenant.guard';
import { CurrentTenant } from '../auth/decorators/current-tenant.decorator';
import { Roles } from '../auth/decorators/roles.decorator';

@ApiTags('master-data')
@Controller('master-data')
@UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
@ApiBearerAuth('access-token')
export class MasterDataController {
  constructor(private readonly masterDataService: MasterDataService) {}

  @Get('vehicles/makes')
  @Roles('FIRM_ADMIN', 'SUPER_ADMIN', 'ADJUSTER')
  @ApiOperation({ summary: 'Get all vehicle makes' })
  @ApiResponse({ status: 200, description: 'List of vehicle makes' })
  async getVehicleMakes(@CurrentTenant() tenant: TenantContext) {
    return this.masterDataService.findAllMakes(tenant);
  }

  @Get('vehicles/models')
  @Roles('FIRM_ADMIN', 'SUPER_ADMIN', 'ADJUSTER')
  @ApiOperation({ summary: 'Get vehicle models by make' })
  @ApiResponse({ status: 200, description: 'List of vehicle models' })
  async getVehicleModels(@Query('makeId') makeId: string, @CurrentTenant() tenant: TenantContext) {
    return this.masterDataService.findModelsByMake(makeId, tenant);
  }

  @Get('vehicles/structure')
  @ApiOperation({ summary: 'Get vehicle makes and models in structured format' })
  @ApiResponse({ status: 200, description: 'Map of vehicle makes to models' })
  async getVehicleStructure(@CurrentTenant() tenant: TenantContext) {
    return this.masterDataService.getVehicleStructure(tenant);
  }

  @Post('vehicles/makes')
  @Roles('FIRM_ADMIN', 'SUPER_ADMIN', 'ADJUSTER')
  @ApiOperation({ summary: 'Create a new vehicle make' })
  @ApiResponse({ status: 201, description: 'Vehicle make created' })
  async createVehicleMake(@Body() createVehicleMakeDto: CreateVehicleMakeDto, @CurrentTenant() tenant: TenantContext) {
    return this.masterDataService.createMake(createVehicleMakeDto, tenant);
  }

  @Post('vehicles/models')
  @Roles('FIRM_ADMIN', 'SUPER_ADMIN', 'ADJUSTER')
  @ApiOperation({ summary: 'Create a new vehicle model' })
  @ApiResponse({ status: 201, description: 'Vehicle model created' })
  async createVehicleModel(@Body() createVehicleModelDto: CreateVehicleModelDto, @CurrentTenant() tenant: TenantContext) {
    return this.masterDataService.createModel(createVehicleModelDto, tenant);
  }

  @Patch('vehicles/makes/:id')
  @Roles('FIRM_ADMIN', 'SUPER_ADMIN', 'ADJUSTER')
  @ApiOperation({ summary: 'Update a vehicle make' })
  @ApiResponse({ status: 200, description: 'Vehicle make updated' })
  async updateVehicleMake(
    @Param('id') id: string,
    @Body() updateVehicleMakeDto: Partial<CreateVehicleMakeDto>,
    @CurrentTenant() tenant: TenantContext
  ) {
    return this.masterDataService.updateMake(id, updateVehicleMakeDto, tenant);
  }

  @Delete('vehicles/makes/:id')
  @Roles('FIRM_ADMIN', 'SUPER_ADMIN', 'ADJUSTER')
  @ApiOperation({ summary: 'Delete a vehicle make' })
  @ApiResponse({ status: 200, description: 'Vehicle make deleted' })
  async deleteVehicleMake(@Param('id') id: string, @CurrentTenant() tenant: TenantContext) {
    return this.masterDataService.deleteMake(id, tenant);
  }

  @Patch('vehicles/models/:id')
  @Roles('FIRM_ADMIN', 'SUPER_ADMIN', 'ADJUSTER')
  @ApiOperation({ summary: 'Update a vehicle model' })
  @ApiResponse({ status: 200, description: 'Vehicle model updated' })
  async updateVehicleModel(
    @Param('id') id: string,
    @Body() updateVehicleModelDto: Partial<CreateVehicleModelDto>,
    @CurrentTenant() tenant: TenantContext
  ) {
    return this.masterDataService.updateModel(id, updateVehicleModelDto, tenant);
  }

  @Delete('vehicles/models/:id')
  @Roles('FIRM_ADMIN', 'SUPER_ADMIN', 'ADJUSTER')
  @ApiOperation({ summary: 'Delete a vehicle model' })
  @ApiResponse({ status: 200, description: 'Vehicle model deleted' })
  async deleteVehicleModel(@Param('id') id: string, @CurrentTenant() tenant: TenantContext) {
    return this.masterDataService.deleteModel(id, tenant);
  }
}
