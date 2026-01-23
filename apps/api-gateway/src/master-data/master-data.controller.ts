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
import { Roles } from '../auth/decorators/roles.decorator';

@ApiTags('master-data')
@Controller('master-data')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth('access-token')
export class MasterDataController {
  constructor(private readonly masterDataService: MasterDataService) {}

  @Get('vehicles/makes')
  @ApiOperation({ summary: 'Get all vehicle makes' })
  @ApiResponse({ status: 200, description: 'List of vehicle makes' })
  async getVehicleMakes() {
    return this.masterDataService.findAllMakes();
  }

  @Get('vehicles/models')
  @ApiOperation({ summary: 'Get vehicle models by make' })
  @ApiResponse({ status: 200, description: 'List of vehicle models' })
  async getVehicleModels(@Query('makeId') makeId: string) {
    return this.masterDataService.findModelsByMake(makeId);
  }

  @Post('vehicles/makes')
  @Roles('FIRM_ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Create a new vehicle make' })
  @ApiResponse({ status: 201, description: 'Vehicle make created' })
  async createVehicleMake(@Body() createVehicleMakeDto: CreateVehicleMakeDto) {
    return this.masterDataService.createMake(createVehicleMakeDto);
  }

  @Post('vehicles/models')
  @Roles('FIRM_ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Create a new vehicle model' })
  @ApiResponse({ status: 201, description: 'Vehicle model created' })
  async createVehicleModel(@Body() createVehicleModelDto: CreateVehicleModelDto) {
    return this.masterDataService.createModel(createVehicleModelDto);
  }

  @Patch('vehicles/makes/:id')
  @Roles('FIRM_ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Update a vehicle make' })
  @ApiResponse({ status: 200, description: 'Vehicle make updated' })
  async updateVehicleMake(
    @Param('id') id: string,
    @Body() updateVehicleMakeDto: Partial<CreateVehicleMakeDto>
  ) {
    return this.masterDataService.updateMake(id, updateVehicleMakeDto);
  }

  @Delete('vehicles/makes/:id')
  @Roles('FIRM_ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Delete a vehicle make' })
  @ApiResponse({ status: 200, description: 'Vehicle make deleted' })
  async deleteVehicleMake(@Param('id') id: string) {
    return this.masterDataService.deleteMake(id);
  }

  @Patch('vehicles/models/:id')
  @Roles('FIRM_ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Update a vehicle model' })
  @ApiResponse({ status: 200, description: 'Vehicle model updated' })
  async updateVehicleModel(
    @Param('id') id: string,
    @Body() updateVehicleModelDto: Partial<CreateVehicleModelDto>
  ) {
    return this.masterDataService.updateModel(id, updateVehicleModelDto);
  }

  @Delete('vehicles/models/:id')
  @Roles('FIRM_ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Delete a vehicle model' })
  @ApiResponse({ status: 200, description: 'Vehicle model deleted' })
  async deleteVehicleModel(@Param('id') id: string) {
    return this.masterDataService.deleteModel(id);
  }
}
