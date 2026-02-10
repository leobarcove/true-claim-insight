import {
  Controller,
  Get,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
  Query,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';

import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { TenantGuard } from '../auth/guards/tenant.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CurrentTenant } from '../auth/decorators/current-tenant.decorator';
import { UpdateUserDto } from './dto/update-user.dto';

@ApiTags('users')
@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
@ApiBearerAuth('access-token')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @Roles('FIRM_ADMIN', 'INSURER_STAFF', 'ADMIN')
  @ApiOperation({ summary: 'Get all users in the current tenant' })
  @ApiResponse({ status: 200, description: 'List of users' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  async findAll(@CurrentTenant() tenantId: string) {
    return this.usersService.findAll(tenantId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get user by ID' })
  @ApiResponse({ status: 200, description: 'User found' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async findOne(
    @Param('id') id: string,
    @CurrentUser() currentUser: Express.User,
    @CurrentTenant() tenantId: string
  ) {
    // Users can only view their own profile or users in their tenant if they are admin
    const user = await this.usersService.findById(id);

    if (!user) return null;

    // Security check: must be self OR same tenant admin/staff
    const isSelf = currentUser.id === id;
    const isSameTenant = user.tenantId === tenantId || (user as any).currentTenantId === tenantId;
    const isAdmin = ['FIRM_ADMIN', 'INSURER_STAFF', 'ADMIN'].includes(currentUser.role);

    if (!isSelf && !(isSameTenant && isAdmin)) {
      throw new HttpException('You do not have access to this user profile', HttpStatus.FORBIDDEN);
    }

    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      phoneNumber: user.phoneNumber,
      role: user.role,
      tenantId: user.tenantId,
      currentTenantId: (user as any).currentTenantId,
      tenantName: user.tenant?.name || (user as any).currentTenant?.name,
      licenseNumber: user.licenseNumber || (user as any).adjuster?.licenseNumber,
    };
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update user' })
  @ApiResponse({ status: 200, description: 'User updated' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async update(
    @Param('id') id: string,
    @Body() updateUserDto: UpdateUserDto,
    @CurrentUser() currentUser: Express.User,
    @CurrentTenant() tenantId: string
  ) {
    const user = await this.usersService.findById(id);
    if (!user) {
      throw new HttpException('User not found', HttpStatus.NOT_FOUND);
    }

    // Security check: must be self OR same tenant admin
    const isSelf = currentUser.id === id;
    const isSameTenant = user.tenantId === tenantId || (user as any).currentTenantId === tenantId;
    const isAdmin = ['FIRM_ADMIN', 'ADMIN'].includes(currentUser.role);

    if (!isSelf && !(isSameTenant && isAdmin)) {
      throw new HttpException(
        'You do not have permission to update this user',
        HttpStatus.FORBIDDEN
      );
    }

    const updatedUser = await this.usersService.update(id, updateUserDto);

    return {
      id: updatedUser.id,
      email: updatedUser.email,
      fullName: updatedUser.fullName,
      phoneNumber: updatedUser.phoneNumber,
      role: updatedUser.role,
      tenantId: updatedUser.tenantId,
      currentTenantId: (updatedUser as any).currentTenantId,
      tenantName: updatedUser.tenant?.name || (updatedUser as any).currentTenant?.name,
      licenseNumber: updatedUser.licenseNumber || (updatedUser as any).adjuster?.licenseNumber,
    };
  }

  @Delete(':id')
  @Roles('FIRM_ADMIN', 'ADMIN')
  @ApiOperation({ summary: 'Delete user' })
  @ApiResponse({ status: 200, description: 'User deleted' })
  @ApiResponse({ status: 404, description: 'User not found' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  async remove(
    @Param('id') id: string,
    @CurrentUser() currentUser: Express.User,
    @CurrentTenant() tenantId: string
  ) {
    const user = await this.usersService.findById(id);
    if (!user) {
      throw new HttpException('User not found', HttpStatus.NOT_FOUND);
    }

    // Security check: must be same tenant admin
    const isSameTenant = user.tenantId === tenantId || (user as any).currentTenantId === tenantId;
    if (!isSameTenant && currentUser.role !== 'ADMIN') {
      throw new HttpException(
        'You do not have permission to delete this user',
        HttpStatus.FORBIDDEN
      );
    }

    return this.usersService.delete(id);
  }
}
