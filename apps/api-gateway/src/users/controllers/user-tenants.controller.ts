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
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { TenantGuard } from '../../auth/guards/tenant.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { CurrentTenant } from '@/auth/decorators/current-tenant.decorator';

@ApiTags('user-tenants')
@Controller('user-tenants')
@UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
@ApiBearerAuth('access-token')
@Roles('SUPER_ADMIN')
export class UserTenantsController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @ApiOperation({ summary: 'Get all user-tenant associations' })
  @ApiResponse({ status: 200, description: 'List of user-tenant associations' })
  async findAll(@CurrentTenant() tenantId: string) {
    return this.usersService.findAllUserTenantsByTenantId(tenantId);
  }

  @Post()
  @ApiOperation({ summary: 'Create a user-tenant association' })
  @ApiResponse({ status: 201, description: 'Association created' })
  async create(
    @Body() body: { userId: string; tenantId: string; role: string; isDefault?: boolean }
  ) {
    return this.usersService.createUserTenant(body);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a user-tenant association' })
  @ApiResponse({ status: 200, description: 'Association updated' })
  @ApiResponse({ status: 404, description: 'Association not found' })
  async update(@Param('id') id: string, @Body() body: { role?: string; isDefault?: boolean }) {
    return this.usersService.updateUserTenant(id, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a user-tenant association' })
  @ApiResponse({ status: 200, description: 'Association deleted' })
  @ApiResponse({ status: 404, description: 'Association not found' })
  async remove(@Param('id') id: string) {
    return this.usersService.deleteUserTenant(id);
  }
}
