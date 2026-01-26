import { Controller, Get, Patch, Delete, Param, Body, UseGuards, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';

import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UpdateUserDto } from './dto/update-user.dto';

@ApiTags('users')
@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth('access-token')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @Roles('FIRM_ADMIN', 'INSURER_STAFF')
  @ApiOperation({ summary: 'Get all users (admin only)' })
  @ApiResponse({ status: 200, description: 'List of users' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  async findAll(@CurrentUser() user: Express.User, @Query('tenantId') tenantId?: string) {
    // FIRM_ADMIN can only see users in their tenant
    const effectiveTenantId = user.role === 'FIRM_ADMIN' ? user.tenantId : tenantId;

    return this.usersService.findAll(effectiveTenantId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get user by ID' })
  @ApiResponse({ status: 200, description: 'User found' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async findOne(@Param('id') id: string, @CurrentUser() currentUser: Express.User) {
    let user;
    // Users can only view their own profile unless admin
    if (currentUser.id !== id && !['FIRM_ADMIN', 'INSURER_STAFF'].includes(currentUser.role)) {
      user = await this.usersService.findById(currentUser.id);
    } else {
      user = await this.usersService.findById(id);
    }

    if (!user) return null;

    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      phoneNumber: user.phoneNumber,
      role: user.role,
      tenantId: user.tenantId,
      tenantName: user.tenant?.name,
      licenseNumber: user.licenseNumber || user.adjuster?.licenseNumber,
    };
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update user' })
  @ApiResponse({ status: 200, description: 'User updated' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async update(
    @Param('id') id: string,
    @Body() updateUserDto: UpdateUserDto,
    @CurrentUser() currentUser: Express.User
  ) {
    let updatedUser;
    // Users can only update their own profile unless admin
    if (currentUser.id !== id && !['FIRM_ADMIN', 'INSURER_STAFF'].includes(currentUser.role)) {
      updatedUser = await this.usersService.update(currentUser.id, updateUserDto);
    } else {
      updatedUser = await this.usersService.update(id, updateUserDto);
    }

    return {
      id: updatedUser.id,
      email: updatedUser.email,
      fullName: updatedUser.fullName,
      phoneNumber: updatedUser.phoneNumber,
      role: updatedUser.role,
      tenantId: updatedUser.tenantId,
      tenantName: updatedUser.tenant?.name,
      licenseNumber: updatedUser.licenseNumber || updatedUser.adjuster?.licenseNumber,
    };
  }

  @Delete(':id')
  @Roles('FIRM_ADMIN')
  @ApiOperation({ summary: 'Delete user (admin only)' })
  @ApiResponse({ status: 200, description: 'User deleted' })
  @ApiResponse({ status: 404, description: 'User not found' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  async remove(@Param('id') id: string) {
    return this.usersService.delete(id);
  }
}
