import {
  Controller,
  Get,
  Param,
  Query,
  ParseUUIDPipe,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { AdjustersService } from './adjusters.service';
import { TenantGuard, TenantContext } from '../common/guards/tenant.guard';
import { InternalAuthGuard } from '../common/guards/internal-auth.guard';
import { TenantIsolation, TenantScope, Tenant, TenantId } from '../common/decorators/tenant.decorator';

/**
 * AdjustersController with multi-tenant isolation
 *
 * Adjusters can only see and manage data within their own organisation (tenant).
 */
@ApiTags('adjusters')
@ApiBearerAuth()
@Controller('adjusters')
@UseGuards(InternalAuthGuard, TenantGuard)
@TenantIsolation(TenantScope.STRICT)
export class AdjustersController {
  constructor(private readonly adjustersService: AdjustersService) {}

  @Get(':id/queue')
  @ApiOperation({ summary: 'Get adjuster case queue (tenant-validated)' })
  @ApiParam({ name: 'id', description: 'Adjuster UUID' })
  @ApiQuery({ name: 'status', required: false, type: String })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Returns adjuster queue',
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Adjuster does not belong to your organisation',
  })
  async getQueue(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('status') status?: string,
    @Tenant() tenantContext?: TenantContext,
  ) {
    return this.adjustersService.getQueue(id, status, tenantContext);
  }

  @Get(':id/stats')
  @ApiOperation({ summary: 'Get adjuster statistics (tenant-validated)' })
  @ApiParam({ name: 'id', description: 'Adjuster UUID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Returns adjuster stats',
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Adjuster does not belong to your organisation',
  })
  async getStats(
    @Param('id', ParseUUIDPipe) id: string,
    @Tenant() tenantContext?: TenantContext,
  ) {
    return this.adjustersService.getStats(id, tenantContext);
  }

  @Get(':id/workload')
  @ApiOperation({ summary: 'Get adjuster workload for assignment (tenant-validated)' })
  @ApiParam({ name: 'id', description: 'Adjuster UUID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Returns adjuster workload info',
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Adjuster does not belong to your organisation',
  })
  async getWorkload(
    @Param('id', ParseUUIDPipe) id: string,
    @Tenant() tenantContext?: TenantContext,
  ) {
    return this.adjustersService.getWorkload(id, tenantContext);
  }

  @Get('available')
  @ApiOperation({ summary: 'Get available adjusters for assignment (auto tenant-scoped)' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Returns list of available adjusters in your organisation',
  })
  async getAvailableAdjusters(@TenantId() tenantId: string) {
    // tenantId is automatically extracted from JWT, no query param needed
    return this.adjustersService.getAvailableAdjusters(tenantId);
  }
}
