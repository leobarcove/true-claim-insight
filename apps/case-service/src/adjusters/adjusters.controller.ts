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
import { ClaimCategory, ConflictInterestType, ConflictPartyType, ScreeningCheckType, ScreeningOutcome } from '@prisma/client';
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
import { ConflictsService } from './conflicts.service';
import { CpdService } from './cpd.service';
import { ScreeningService } from './screening.service';
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
    private readonly competency: CompetencyService,
    private readonly conflicts: ConflictsService,
    private readonly cpd: CpdService,
    private readonly screening: ScreeningService
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

  @Post(':id/employment')
  @ApiOperation({ summary: 'Record employment type (PD 12.1(a)), start date and qualification' })
  @Roles(UserRole.FIRM_ADMIN, UserRole.SUPER_ADMIN)
  setEmployment(
    @Param('id') id: string,
    @Body() body: { employmentType: 'FULL_TIME' | 'PART_TIME' | 'CONTRACT'; adjustingSince?: string; qualification?: string },
    @Tenant() tenantContext: TenantContext
  ) {
    return this.competency.setEmployment(id, body, tenantContext);
  }

  @Post(':id/verify-licence')
  @ApiOperation({ summary: 'Record that the firm verified this adjuster\'s licence' })
  @Roles(UserRole.FIRM_ADMIN, UserRole.SUPER_ADMIN)
  verifyLicence(@Param('id') id: string, @Tenant() tenantContext: TenantContext) {
    return this.competency.verifyLicence(id, tenantContext);
  }

  // ==== Conflicts of interest (PD 10.3, 12.1(d)) ====

  @Get(':id/conflicts')
  @ApiOperation({ summary: 'Conflict declarations (live by default; ?all=true for history)' })
  listConflicts(@Param('id') id: string, @Query('all') all?: string) {
    return this.conflicts.list(id, all === 'true');
  }

  @Post(':id/conflicts')
  @ApiOperation({ summary: 'Declare a relation or interest — declaring is always welcome' })
  @Roles(UserRole.ADJUSTER, UserRole.FIRM_ADMIN, UserRole.SUPER_ADMIN)
  declareConflict(
    @Param('id') id: string,
    @Body()
    body: {
      partyType: ConflictPartyType;
      interestType: ConflictInterestType;
      partyName: string;
      partyTenantId?: string;
      relationship: string;
      details?: string;
    },
    @Tenant() tenantContext: TenantContext
  ) {
    return this.conflicts.declare(id, body, tenantContext);
  }

  @Post('conflicts/:declarationId/resolve')
  @ApiOperation({ summary: 'Resolve a declaration — a reason is required and audited' })
  @Roles(UserRole.FIRM_ADMIN, UserRole.SUPER_ADMIN, UserRole.COMPLIANCE_OFFICER)
  resolveConflict(
    @Param('declarationId') declarationId: string,
    @Body('note') note: string,
    @Tenant() tenantContext: TenantContext
  ) {
    return this.conflicts.resolve(declarationId, note, tenantContext);
  }

  // ==== CPD ledger (PD 12.9–12.11) ====

  @Get('cpd-standing')
  @ApiOperation({ summary: 'Firm-wide CPD standing for a year — the 12.10 floor dashboard' })
  @Roles(UserRole.FIRM_ADMIN, UserRole.SUPER_ADMIN, UserRole.COMPLIANCE_OFFICER)
  firmCpdStanding(@Query('year') year: string, @TenantId() tenantId: string) {
    return this.cpd.firmStanding(tenantId, Number(year) || new Date().getUTCFullYear());
  }

  @Get(':id/cpd')
  @ApiOperation({ summary: 'CPD records, optionally for one year' })
  listCpd(@Param('id') id: string, @Query('year') year?: string) {
    return this.cpd.list(id, year ? Number(year) : undefined);
  }

  @Get(':id/cpd/standing')
  @ApiOperation({ summary: 'Standing against the 15-hour floor for a year' })
  cpdStanding(@Param('id') id: string, @Query('year') year?: string) {
    return this.cpd.standing(id, Number(year) || new Date().getUTCFullYear());
  }

  @Post(':id/cpd')
  @ApiOperation({ summary: 'Record CPD attendance; only recognised providers count toward the floor' })
  @Roles(UserRole.ADJUSTER, UserRole.FIRM_ADMIN, UserRole.SUPER_ADMIN)
  recordCpd(
    @Param('id') id: string,
    @Body()
    body: {
      year: number;
      hours: number;
      programmeName: string;
      provider: string;
      providerRecognised?: boolean;
      completedAt: string;
      evidenceUrl?: string;
      notes?: string;
    },
    @Tenant() tenantContext: TenantContext
  ) {
    return this.cpd.record(id, body, tenantContext);
  }

  // ==== Background screening (PD 11.2(e)) ====

  @Get(':id/screenings')
  @ApiOperation({ summary: 'Background checks on record' })
  @Roles(UserRole.FIRM_ADMIN, UserRole.SUPER_ADMIN, UserRole.COMPLIANCE_OFFICER)
  listScreenings(@Param('id') id: string) {
    return this.screening.list(id);
  }

  @Get(':id/screenings/standing')
  @ApiOperation({ summary: 'Standing against the 11.2(e) minimum check set' })
  @Roles(UserRole.FIRM_ADMIN, UserRole.SUPER_ADMIN, UserRole.COMPLIANCE_OFFICER)
  screeningStanding(@Param('id') id: string) {
    return this.screening.standing(id);
  }

  @Post(':id/screenings')
  @ApiOperation({ summary: 'Record a background check; FINDINGS requires the finding described' })
  @Roles(UserRole.FIRM_ADMIN, UserRole.SUPER_ADMIN)
  recordScreening(
    @Param('id') id: string,
    @Body()
    body: {
      checkType: ScreeningCheckType;
      outcome: ScreeningOutcome;
      findingsNote?: string;
      screenedAt: string;
      conductedBy: string;
      evidenceUrl?: string;
    },
    @Tenant() tenantContext: TenantContext
  ) {
    return this.screening.record(id, body, tenantContext);
  }
}
