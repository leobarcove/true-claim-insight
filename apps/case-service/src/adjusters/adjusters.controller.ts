import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { ClaimCategory } from '@prisma/client';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { AdjustersService } from './adjusters.service';
import { CompetencyService } from './competency.service';
import { TenantGuard, TenantContext } from '../common/guards/tenant.guard';
import { InternalAuthGuard } from '../common/guards/internal-auth.guard';
import {
  TenantIsolation,
  TenantScope,
  Tenant,
  TenantId,
} from '../common/decorators/tenant.decorator';
import { RolesGuard, UserRole } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

/**
 * AdjustersController with multi-tenant isolation
 *
 * Adjusters can only see and manage data within their own organisation (tenant).
 */
@ApiTags('adjusters')
@ApiBearerAuth()
@Controller('adjusters')
@UseGuards(InternalAuthGuard, RolesGuard, TenantGuard)
@TenantIsolation(TenantScope.STRICT)
@Roles(UserRole.FIRM_ADMIN, UserRole.SUPER_ADMIN, UserRole.ADJUSTER)
export class AdjustersController {
  constructor(
    private readonly adjustersService: AdjustersService,
    private readonly competency: CompetencyService
  ) {}

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
    @Tenant() tenantContext?: TenantContext
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
  async getStats(@Param('id', ParseUUIDPipe) id: string, @Tenant() tenantContext?: TenantContext) {
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
    @Tenant() tenantContext?: TenantContext
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

  // ==== Competency and standing (PD 12.2(b), 12.3, 12.4) ====

  @Get(':id/competencies')
  @ApiOperation({ summary: 'Competency records per subject matter' })
  listCompetencies(@Param('id') id: string) {
    return this.competency.list(id);
  }

  @Post(':id/competencies/:category')
  @ApiOperation({ summary: 'Record competency in a subject (years, cases, performance)' })
  @Roles(UserRole.FIRM_ADMIN, UserRole.SUPER_ADMIN)
  upsertCompetency(
    @Param('id') id: string,
    @Param('category') category: ClaimCategory,
    @Body() body: { yearsInSubject: number; casesHandled?: number; performanceSatisfactory?: boolean; notes?: string },
    @Tenant() tenantContext: TenantContext
  ) {
    return this.competency.upsert(id, category, body, tenantContext);
  }

  @Post(':id/competencies/:category/recognise-senior')
  @ApiOperation({ summary: 'PD 12.4 recognition act — refused below the five-year floor' })
  @Roles(UserRole.FIRM_ADMIN, UserRole.SUPER_ADMIN)
  recogniseSenior(
    @Param('id') id: string,
    @Param('category') category: ClaimCategory,
    @Tenant() tenantContext: TenantContext
  ) {
    return this.competency.recogniseSenior(id, category, tenantContext);
  }

  @Post(':id/verify-licence')
  @ApiOperation({ summary: 'Record that the firm verified this adjuster\'s licence' })
  @Roles(UserRole.FIRM_ADMIN, UserRole.SUPER_ADMIN)
  verifyLicence(@Param('id') id: string, @Tenant() tenantContext: TenantContext) {
    return this.competency.verifyLicence(id, tenantContext);
  }
}
