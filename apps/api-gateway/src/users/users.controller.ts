import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { catchError, map } from 'rxjs/operators';
import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
  Query,
  Req,
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

@ApiTags('users')
@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
@ApiBearerAuth('access-token')
export class UsersController {
  private videoServiceUrl: string;

  constructor(
    private readonly usersService: UsersService,
    private readonly httpService: HttpService,
    private readonly configService: ConfigService
  ) {
    this.videoServiceUrl = this.configService.get('videoService') || 'http://localhost:3002';
  }

  @Get()
  @Roles('FIRM_ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Get all users in the current tenant' })
  @ApiResponse({ status: 200, description: 'List of users' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  async findAll(@CurrentTenant() tenantId: string) {
    return this.usersService.findAll(tenantId);
  }

  @Post()
  @Roles('FIRM_ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Create a new user' })
  @ApiResponse({ status: 201, description: 'User created' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  async create(@Body() body: any, @CurrentTenant() tenantId: string) {
    const { password, ...rest } = body;
    const resolvedTenantId =
      rest.tenantId && rest.tenantId !== 'SUPER_ADMIN'
        ? rest.tenantId
        : tenantId !== 'SUPER_ADMIN'
          ? tenantId
          : undefined;
    const bcrypt = await import('bcrypt');
    const hashedPassword = await bcrypt.hash(password || Math.random().toString(36), 10);
    return this.usersService.create({
      ...rest,
      password: hashedPassword,
      tenantId: resolvedTenantId,
      role: rest.role || 'ADJUSTER',
    });
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
    const isAdmin = ['FIRM_ADMIN', 'SUPER_ADMIN'].includes(currentUser.role);

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
      avatarUrl: (user as any).avatarUrl,
    };
  }

  @Post('avatar')
  @ApiOperation({ summary: 'Upload a user avatar profile image' })
  async uploadAvatar(@Req() req: any, @CurrentUser() currentUser: Express.User) {
    if (typeof req.isMultipart !== 'function' || !req.isMultipart()) {
      throw new HttpException('Request must be multipart', HttpStatus.BAD_REQUEST);
    }

    const data = await req.file();
    if (!data) {
      throw new HttpException('No file uploaded', HttpStatus.BAD_REQUEST);
    }

    const FormData = require('form-data');
    const form = new FormData();
    const buffer = await data.toBuffer();

    form.append('file', buffer, {
      filename: data.filename,
      contentType: data.mimetype,
    });

    const headers = {
      Authorization: req.headers.authorization || '',
      'X-Tenant-Id':
        req.tenantContext?.tenantId ||
        (currentUser as any)?.currentTenantId ||
        currentUser?.tenantId ||
        '',
      'X-User-Id': currentUser.id,
      'X-User-Role': req.tenantContext?.userRole || currentUser?.role || '',
      ...form.getHeaders(),
    };

    return this.httpService
      .post(`${this.videoServiceUrl}/api/v1/uploads/avatar`, form, {
        headers,
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
      })
      .pipe(
        map(response => response.data),
        catchError(e => {
          throw new HttpException(
            e.response?.data || 'Failed to upload avatar',
            e.response?.status || HttpStatus.INTERNAL_SERVER_ERROR
          );
        })
      );
  }

  @Delete('avatar')
  @ApiOperation({ summary: 'Delete user avatar' })
  async deleteAvatar(@Req() req: any, @CurrentUser() currentUser: Express.User) {
    const headers = {
      Authorization: req.headers.authorization || '',
      'X-Tenant-Id':
        req.tenantContext?.tenantId ||
        (currentUser as any)?.currentTenantId ||
        currentUser?.tenantId ||
        '',
      'X-User-Id': currentUser.id,
      'X-User-Role': req.tenantContext?.userRole || currentUser?.role || '',
    };

    return this.httpService
      .delete(`${this.videoServiceUrl}/api/v1/uploads/avatar`, { headers })
      .pipe(
        map(response => response.data),
        catchError(e => {
          throw new HttpException(
            e.response?.data || 'Failed to delete avatar',
            e.response?.status || HttpStatus.INTERNAL_SERVER_ERROR
          );
        })
      );
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update user' })
  @ApiResponse({ status: 200, description: 'User updated' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async update(
    @Param('id') id: string,
    @Body() body: any,
    @CurrentUser() currentUser: Express.User,
    @CurrentTenant() tenantId: string
  ) {
    const user = await this.usersService.findById(id);
    if (!user) {
      throw new HttpException('User not found', HttpStatus.NOT_FOUND);
    }

    const isSuperAdmin = currentUser.role === 'SUPER_ADMIN';
    const isSelf = currentUser.id === id;
    const isSameTenant = user.tenantId === tenantId || (user as any).currentTenantId === tenantId;
    const isAdmin = ['FIRM_ADMIN', 'SUPER_ADMIN'].includes(currentUser.role);

    if (!isSuperAdmin && !isSelf && !(isSameTenant && isAdmin)) {
      throw new HttpException(
        'You do not have permission to update this user',
        HttpStatus.FORBIDDEN
      );
    }

    const { fullName, phoneNumber } = body;
    const updatedUser = await this.usersService.update(id, {
      fullName,
      phoneNumber,
    });

    return {
      id: updatedUser.id,
      email: updatedUser.email,
      fullName: updatedUser.fullName,
      phoneNumber: updatedUser.phoneNumber,
      role: updatedUser.role,
      tenantId: updatedUser.tenantId,
      currentTenantId: (updatedUser as any).currentTenantId,
      tenantName: updatedUser.tenant?.name || (updatedUser as any).currentTenant?.name,
      avatarUrl: (updatedUser as any).avatarUrl,
    };
  }

  @Delete(':id')
  @Roles('FIRM_ADMIN', 'SUPER_ADMIN')
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
    if (!isSameTenant && currentUser.role !== 'SUPER_ADMIN') {
      throw new HttpException(
        'You do not have permission to delete this user',
        HttpStatus.FORBIDDEN
      );
    }

    return this.usersService.delete(id);
  }
}
