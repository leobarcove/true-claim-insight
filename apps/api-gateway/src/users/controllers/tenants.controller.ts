import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';

import { UsersService } from '../users.service';
import { TenantGuard } from '../../auth/guards/tenant.guard';
import { Roles } from '../../auth/decorators/roles.decorator';

@ApiTags('tenants')
@Controller('tenants')
@UseGuards(TenantGuard)
@ApiBearerAuth('access-token')
// Platform provisioning. Listing every tenant would tell one insurer who the
// others are; creating or deleting one is the operator's act. Members see their
// own tenants through their memberships (/auth/me), not here.
@Roles('SUPER_ADMIN')
export class TenantsController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @ApiOperation({ summary: 'Get all tenants' })
  @ApiResponse({ status: 200, description: 'List of tenants' })
  async findAll() {
    return this.usersService.findAllTenants();
  }

  @Post()
  @ApiOperation({ summary: 'Create a new tenant' })
  @ApiResponse({ status: 201, description: 'Tenant created' })
  async create(@Body() body: { name: string; type: string; subscriptionTier?: string }) {
    return this.usersService.createTenant(body);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a tenant' })
  @ApiResponse({ status: 200, description: 'Tenant updated' })
  @ApiResponse({ status: 404, description: 'Tenant not found' })
  async update(
    @Param('id') id: string,
    @Body() body: { name?: string; type?: string; subscriptionTier?: string }
  ) {
    return this.usersService.updateTenant(id, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a tenant' })
  @ApiResponse({ status: 200, description: 'Tenant deleted' })
  @ApiResponse({ status: 404, description: 'Tenant not found' })
  async remove(@Param('id') id: string) {
    return this.usersService.deleteTenant(id);
  }
}
