import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Req,
  Res,
  Delete,
  UseGuards,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { firstValueFrom } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../auth/guards/tenant.guard';
import { CurrentTenant } from '../auth/decorators/current-tenant.decorator';
import { ClaimantsService } from '../claimants/claimants.service';
import { UpdateClaimStatusDto } from './dto/update-claim-status.dto';

@ApiTags('Claims')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TenantGuard)
@Controller('claims')
export class ClaimsController {
  private caseServiceUrl: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly claimantsService: ClaimantsService
  ) {
    this.caseServiceUrl = this.configService.get('CASE_SERVICE_URL') || 'http://localhost:3001';
  }

  @Post()
  @ApiOperation({ summary: 'Create a new claim' })
  async create(@Body() createClaimDto: any, @Req() req: any) {
    const headers = {
      Authorization: req.headers.authorization,
      'X-Tenant-Id': req.tenantContext?.tenantId || req.user?.currentTenantId || req.user?.tenantId,
      'X-User-Id': req.user?.id,
      'X-User-Role': req.tenantContext?.userRole || req.user?.role,
    };

    let claimantId = createClaimDto.claimantId;

    // Resolve claimant if NRIC/Phone provided (mainly for Agent flow)
    if (!claimantId && createClaimDto.claimantNric && createClaimDto.claimantPhone) {
      const claimant = await this.claimantsService.findOrCreate({
        nric: createClaimDto.claimantNric,
        phoneNumber: createClaimDto.claimantPhone,
        fullName: createClaimDto.claimantName,
      });
      claimantId = claimant.id;
    }

    const payload = {
      ...createClaimDto,
      claimantId,
      tenantId:
        createClaimDto.tenantId ||
        req.tenantContext?.tenantId ||
        req.user?.currentTenantId ||
        req.user?.tenantId,
    };
    delete payload.claimantNric;
    delete payload.claimantPhone;
    delete payload.claimantName;

    return this.httpService.post(`${this.caseServiceUrl}/api/v1/claims`, payload, { headers }).pipe(
      map(response => response.data.data),
      catchError(e => {
        throw new HttpException(
          e.response?.data || 'Failed to create claim',
          e.response?.status || HttpStatus.INTERNAL_SERVER_ERROR
        );
      })
    );
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get claim statistics' })
  getStats(@Req() req: any) {
    const headers = {
      Authorization: req.headers.authorization,
      'X-Tenant-Id': req.tenantContext?.tenantId || req.user?.currentTenantId || req.user?.tenantId,
      'X-User-Id': req.user?.id,
      'X-User-Role': req.tenantContext?.userRole || req.user?.role,
    };

    const adjusterId = req.user?.adjuster?.id;
    // Default to tenant stats unless personal scope is explicitly requested
    const useTenantStats = req.query?.scope !== 'personal' || !adjusterId;

    const endpoint = useTenantStats
      ? `${this.caseServiceUrl}/api/v1/claims/stats`
      : `${this.caseServiceUrl}/api/v1/adjusters/${adjusterId}/stats`;

    return this.httpService.get(endpoint, { headers, params: req.query }).pipe(
      map(response => {
        // Flattened, not recomputed. This map used to redefine three of the
        // figures on the way through — `totalAssigned` was fed the *active*
        // count and `inProgress` the SCHEDULED bucket — so the dashboard could
        // not agree with the service that produced them, and a fix in one place
        // did not reach the screen. Each field now carries the value it is
        // named for, and a new figure appears here or it does not appear at all.
        const data = response.data.data;
        const stats = data.stats ?? {};
        return {
          totalAssigned: stats.totalAssigned ?? 0,
          activeClaims: stats.activeClaims ?? 0,
          totalCases: stats.totalCases ?? 0,
          pendingReview: data.statusBreakdown?.REPORT_PENDING ?? 0,
          inProgress: stats.inProgress ?? 0,
          completedThisMonth: stats.completedThisMonth ?? 0,
          completedThisWeek: stats.completedThisWeek ?? 0,
          averagePerDay: stats.averagePerDay ?? 0,
          totalClaims: stats.totalClaims ?? 0,
          monthlyChange: stats.monthlyChange ?? 0,
          statusBreakdown: data.statusBreakdown ?? {},
        };
      }),
      catchError(e => {
        throw new HttpException(
          e.response?.data || 'Failed to fetch claim stats',
          e.response?.status || HttpStatus.INTERNAL_SERVER_ERROR
        );
      })
    );
  }

  @Get()
  @ApiOperation({ summary: 'Get all claims for the user/tenant' })
  findAll(@Req() req: any) {
    const headers = {
      Authorization: req.headers.authorization,
      'X-Tenant-Id': req.tenantContext?.tenantId || req.user?.currentTenantId || req.user?.tenantId,
      'X-User-Id': req.user?.id,
      'X-User-Role': req.tenantContext?.userRole || req.user?.role,
    };

    const params = { ...req.query };

    // Default to tenant-wide claims unless personal scope is requested
    if (req.query?.scope === 'personal' && req.user?.adjuster?.id && !params.adjusterId) {
      params.adjusterId = req.user.adjuster.id;
    }

    // Force claimant-only view if user is a claimant
    if (req.user?.role === 'CLAIMANT') {
      params.claimantId = req.user.id;
    }

    // Remove scope parameter as it's not supported by case-service DTO
    delete params.scope;

    return this.httpService
      .get(`${this.caseServiceUrl}/api/v1/claims`, {
        headers,
        params,
      })
      .pipe(
        map(response => response.data.data),
        catchError(e => {
          throw new HttpException(
            e.response?.data || 'Failed to fetch claims',
            e.response?.status || HttpStatus.INTERNAL_SERVER_ERROR
          );
        })
      );
  }

  @Get(':id/export/archive')
  @ApiOperation({ summary: 'Claim file as ZIP (sealed bundle + binaries + report PDFs)' })
  async exportArchive(@Param('id') id: string, @Req() req: any, @Res() reply: any) {
    const headers = {
      Authorization: req.headers.authorization,
      'X-Tenant-Id': req.tenantContext?.tenantId || req.user?.currentTenantId || req.user?.tenantId,
      'X-User-Id': req.user?.id,
      'X-User-Role': req.tenantContext?.userRole || req.user?.role,
    };
    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.caseServiceUrl}/api/v1/claims/${id}/export/archive`, {
          headers,
          responseType: 'arraybuffer',
        })
      );
      return reply
        .header('Content-Type', 'application/zip')
        .header('Content-Disposition', response.headers['content-disposition'] ?? 'attachment')
        .header('X-Bundle-Sha256', response.headers['x-bundle-sha256'] ?? '')
        .send(Buffer.from(response.data));
    } catch (e: any) {
      throw new HttpException(
        e.response?.data ? JSON.parse(Buffer.from(e.response.data).toString() || '{}') : 'Failed to export archive',
        e.response?.status || HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Get(':id/export')
  @ApiOperation({ summary: 'Complete claim file (FSA s.143) — compliance roles, audited' })
  exportFile(@Param('id') id: string, @Req() req: any) {
    // Role enforcement lives in case-service; the gateway only forwards
    // identity. The audit interceptor records this read by pattern.
    const headers = {
      Authorization: req.headers.authorization,
      'X-Tenant-Id': req.tenantContext?.tenantId || req.user?.currentTenantId || req.user?.tenantId,
      'X-User-Id': req.user?.id,
      'X-User-Role': req.tenantContext?.userRole || req.user?.role,
    };
    return this.httpService
      .get(`${this.caseServiceUrl}/api/v1/claims/${id}/export`, { headers })
      .pipe(
        map(response => response.data.data),
        catchError(e => {
          throw new HttpException(
            e.response?.data || 'Failed to export claim file',
            e.response?.status || HttpStatus.INTERNAL_SERVER_ERROR
          );
        })
      );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a claim by ID' })
  findOne(@Param('id') id: string, @Req() req: any) {
    const headers = {
      Authorization: req.headers.authorization,
      'X-Tenant-Id': req.tenantContext?.tenantId || req.user?.currentTenantId || req.user?.tenantId,
      'X-User-Id': req.user?.id,
      'X-User-Role': req.tenantContext?.userRole || req.user?.role,
    };

    return this.httpService.get(`${this.caseServiceUrl}/api/v1/claims/${id}`, { headers }).pipe(
      map(response => response.data.data),
      catchError(e => {
        throw new HttpException(
          e.response?.data || 'Failed to fetch claim',
          e.response?.status || HttpStatus.INTERNAL_SERVER_ERROR
        );
      })
    );
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a claim' })
  update(@Param('id') id: string, @Body() updateClaimDto: any, @Req() req: any) {
    const headers = {
      Authorization: req.headers.authorization,
      'X-Tenant-Id': req.tenantContext?.tenantId || req.user?.currentTenantId || req.user?.tenantId,
      'X-User-Id': req.user?.id,
      'X-User-Role': req.tenantContext?.userRole || req.user?.role,
    };

    return this.httpService
      .patch(`${this.caseServiceUrl}/api/v1/claims/${id}`, updateClaimDto, { headers })
      .pipe(
        map(response => response.data.data),
        catchError(e => {
          throw new HttpException(
            e.response?.data || 'Failed to update claim',
            e.response?.status || HttpStatus.INTERNAL_SERVER_ERROR
          );
        })
      );
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Update claim status' })
  updateStatus(@Param('id') id: string, @Body() dto: UpdateClaimStatusDto, @Req() req: any) {
    const headers = {
      Authorization: req.headers.authorization,
      'X-Tenant-Id': req.tenantContext?.tenantId || req.user?.currentTenantId || req.user?.tenantId,
      'X-User-Id': req.user?.id,
      'X-User-Role': req.tenantContext?.userRole || req.user?.role,
    };

    return this.httpService
      .patch(`${this.caseServiceUrl}/api/v1/claims/${id}/status`, { status: dto.status }, { headers })
      .pipe(
        map(response => response.data.data),
        catchError(e => {
          throw new HttpException(
            e.response?.data || 'Failed to update claim status',
            e.response?.status || HttpStatus.INTERNAL_SERVER_ERROR
          );
        })
      );
  }

  @Post(':id/assign')
  @ApiOperation({ summary: 'Assign an adjuster' })
  assignAdjuster(@Param('id') id: string, @Body() assignAdjusterDto: any, @Req() req: any) {
    const headers = {
      Authorization: req.headers.authorization,
      'X-Tenant-Id': req.tenantContext?.tenantId || req.user?.currentTenantId || req.user?.tenantId,
      'X-User-Id': req.user?.id,
      'X-User-Role': req.tenantContext?.userRole || req.user?.role,
    };

    return this.httpService
      .post(`${this.caseServiceUrl}/api/v1/claims/${id}/assign`, assignAdjusterDto, { headers })
      .pipe(
        map(response => response.data.data),
        catchError(e => {
          throw new HttpException(
            e.response?.data || 'Failed to assign adjuster',
            e.response?.status || HttpStatus.INTERNAL_SERVER_ERROR
          );
        })
      );
  }

  // ============================================================
  // Non-motor claim endpoints (Flood is the first concrete type)
  // ============================================================

  @Post('flood')
  @ApiOperation({ summary: 'Create a new flood claim' })
  async createFlood(@Body() body: any, @Req() req: any) {
    const headers = {
      Authorization: req.headers.authorization,
      'X-Tenant-Id': req.tenantContext?.tenantId || req.user?.currentTenantId || req.user?.tenantId,
      'X-User-Id': req.user?.id,
      'X-User-Role': req.tenantContext?.userRole || req.user?.role,
    };

    // Same claimant-resolution pattern as the motor POST /claims route:
    // if the caller passes claimantNric + claimantPhone instead of an id,
    // upsert the Claimant and substitute the resulting id.
    let claimantId = body.claimantId;
    if (!claimantId && body.claimantNric && body.claimantPhone) {
      const claimant = await this.claimantsService.findOrCreate({
        nric: body.claimantNric,
        phoneNumber: body.claimantPhone,
        fullName: body.claimantName,
      });
      claimantId = claimant.id;
    }

    const payload = { ...body, claimantId };
    delete payload.claimantNric;
    delete payload.claimantPhone;
    delete payload.claimantName;

    return this.httpService
      .post(`${this.caseServiceUrl}/api/v1/claims/flood`, payload, { headers })
      .pipe(
        map(response => response.data.data),
        catchError(e => {
          throw new HttpException(
            e.response?.data || 'Failed to create flood claim',
            e.response?.status || HttpStatus.INTERNAL_SERVER_ERROR
          );
        })
      );
  }

  @Get('flood')
  @ApiOperation({ summary: 'List flood claims' })
  listFlood(@Req() req: any) {
    const headers = {
      Authorization: req.headers.authorization,
      'X-Tenant-Id': req.tenantContext?.tenantId || req.user?.currentTenantId || req.user?.tenantId,
      'X-User-Id': req.user?.id,
      'X-User-Role': req.tenantContext?.userRole || req.user?.role,
    };
    return this.httpService
      .get(`${this.caseServiceUrl}/api/v1/claims/flood`, { headers })
      .pipe(
        map(response => response.data.data),
        catchError(e => {
          throw new HttpException(
            e.response?.data || 'Failed to list flood claims',
            e.response?.status || HttpStatus.INTERNAL_SERVER_ERROR
          );
        })
      );
  }

  @Get('flood/:id')
  @ApiOperation({ summary: 'Get a flood claim with sub-table data' })
  getFlood(@Param('id') id: string, @Req() req: any) {
    const headers = {
      Authorization: req.headers.authorization,
      'X-Tenant-Id': req.tenantContext?.tenantId || req.user?.currentTenantId || req.user?.tenantId,
      'X-User-Id': req.user?.id,
      'X-User-Role': req.tenantContext?.userRole || req.user?.role,
    };
    return this.httpService
      .get(`${this.caseServiceUrl}/api/v1/claims/flood/${id}`, { headers })
      .pipe(
        map(response => response.data.data),
        catchError(e => {
          throw new HttpException(
            e.response?.data || 'Failed to fetch flood claim',
            e.response?.status || HttpStatus.INTERNAL_SERVER_ERROR
          );
        })
      );
  }

  @Get(':id/evidence-checklist')
  @ApiOperation({ summary: 'Get evidence checklist for a claim (any category)' })
  getEvidenceChecklist(@Param('id') id: string, @Req() req: any) {
    const headers = {
      Authorization: req.headers.authorization,
      'X-Tenant-Id': req.tenantContext?.tenantId || req.user?.currentTenantId || req.user?.tenantId,
      'X-User-Id': req.user?.id,
      'X-User-Role': req.tenantContext?.userRole || req.user?.role,
    };
    return this.httpService
      .get(`${this.caseServiceUrl}/api/v1/claims/${id}/evidence-checklist`, { headers })
      .pipe(
        map(response => response.data.data),
        catchError(e => {
          throw new HttpException(
            e.response?.data || 'Failed to fetch evidence checklist',
            e.response?.status || HttpStatus.INTERNAL_SERVER_ERROR
          );
        })
      );
  }

  @Get(':id/timeline')
  @ApiOperation({ summary: 'Get claim timeline' })
  getTimeline(@Param('id') id: string, @Req() req: any) {
    const headers = {
      Authorization: req.headers.authorization,
      'X-Tenant-Id': req.tenantContext?.tenantId || req.user?.currentTenantId || req.user?.tenantId,
      'X-User-Id': req.user?.id,
      'X-User-Role': req.tenantContext?.userRole || req.user?.role,
    };

    return this.httpService
      .get(`${this.caseServiceUrl}/api/v1/claims/${id}/timeline`, { headers })
      .pipe(
        map(response => response.data.data),
        catchError(e => {
          throw new HttpException(
            e.response?.data || 'Failed to fetch timeline',
            e.response?.status || HttpStatus.INTERNAL_SERVER_ERROR
          );
        })
      );
  }

  @Post(':id/notes')
  @ApiOperation({ summary: 'Add a note to a claim' })
  addNote(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    const headers = {
      Authorization: req.headers.authorization,
      'X-Tenant-Id': req.tenantContext?.tenantId || req.user?.currentTenantId || req.user?.tenantId,
      'X-User-Id': req.user?.id,
      'X-User-Role': req.tenantContext?.userRole || req.user?.role,
    };

    return this.httpService
      .post(`${this.caseServiceUrl}/api/v1/claims/${id}/notes`, body, { headers })
      .pipe(
        map(response => response.data.data),
        catchError(e => {
          throw new HttpException(
            e.response?.data || 'Failed to add note',
            e.response?.status || HttpStatus.INTERNAL_SERVER_ERROR
          );
        })
      );
  }

  // Document Endpoints
  @Post(':id/documents')
  @ApiOperation({ summary: 'Add a document to a claim' })
  addDocument(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    const headers = {
      Authorization: req.headers.authorization,
      'X-Tenant-Id': req.tenantContext?.tenantId || req.user?.currentTenantId || req.user?.tenantId,
      'X-User-Id': req.user?.id,
      'X-User-Role': req.tenantContext?.userRole || req.user?.role,
    };

    return this.httpService
      .post(`${this.caseServiceUrl}/api/v1/claims/${id}/documents`, body, { headers })
      .pipe(
        map(response => response.data.data),
        catchError(e => {
          throw new HttpException(
            e.response?.data || 'Failed to add document',
            e.response?.status || HttpStatus.INTERNAL_SERVER_ERROR
          );
        })
      );
  }

  @Post(':id/documents/upload')
  @ApiOperation({ summary: 'Upload a document file' })
  async uploadDocument(@Param('id') id: string, @Req() req: any) {
    const headers = {
      Authorization: req.headers.authorization,
      'X-Tenant-Id': req.tenantContext?.tenantId || req.user?.currentTenantId || req.user?.tenantId,
      'X-User-Id': req.user?.id,
      'X-User-Role': req.tenantContext?.userRole || req.user?.role,
      'Content-Type': req.headers['content-type'],
    };

    // Forward the multipart request as a stream
    return this.httpService
      .post(`${this.caseServiceUrl}/api/v1/claims/${id}/documents/upload`, req.raw, {
        headers,
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
      })
      .pipe(
        map(response => response.data.data),
        catchError(e => {
          throw new HttpException(
            e.response?.data || 'Failed to upload document',
            e.response?.status || HttpStatus.INTERNAL_SERVER_ERROR
          );
        })
      );
  }

  @Get(':id/documents')
  @ApiOperation({ summary: 'Get documents for a claim' })
  getDocuments(@Param('id') id: string, @Req() req: any) {
    const headers = {
      Authorization: req.headers.authorization,
      'X-Tenant-Id': req.tenantContext?.tenantId || req.user?.currentTenantId || req.user?.tenantId,
      'X-User-Id': req.user?.id,
      'X-User-Role': req.tenantContext?.userRole || req.user?.role,
    };

    return this.httpService
      .get(`${this.caseServiceUrl}/api/v1/claims/${id}/documents`, { headers })
      .pipe(
        map(response => response.data.data),
        catchError(e => {
          throw new HttpException(
            e.response?.data || 'Failed to fetch documents',
            e.response?.status || HttpStatus.INTERNAL_SERVER_ERROR
          );
        })
      );
  }

  @Delete(':id/documents/:docId')
  @ApiOperation({ summary: 'Delete a document' })
  deleteDocument(@Param('id') id: string, @Param('docId') docId: string, @Req() req: any) {
    const headers = {
      Authorization: req.headers.authorization,
      'X-Tenant-Id': req.tenantContext?.tenantId || req.user?.currentTenantId || req.user?.tenantId,
      'X-User-Id': req.user?.id,
      'X-User-Role': req.tenantContext?.userRole || req.user?.role,
    };

    return this.httpService
      .delete(`${this.caseServiceUrl}/api/v1/claims/${id}/documents/${docId}`, { headers })
      .pipe(
        map(response => response.data.data),
        catchError(e => {
          throw new HttpException(
            e.response?.data || 'Failed to delete document',
            e.response?.status || HttpStatus.INTERNAL_SERVER_ERROR
          );
        })
      );
  }

  @Post(':id/documents/:docId/replace')
  @ApiOperation({ summary: 'Replace an existing document' })
  async replaceDocument(@Param('id') id: string, @Param('docId') docId: string, @Req() req: any) {
    const headers = {
      Authorization: req.headers.authorization,
      'X-Tenant-Id': req.tenantContext?.tenantId || req.user?.currentTenantId || req.user?.tenantId,
      'X-User-Id': req.user?.id,
      'X-User-Role': req.tenantContext?.userRole || req.user?.role,
      'Content-Type': req.headers['content-type'],
    };

    // Forward the multipart request as a stream
    return this.httpService
      .post(`${this.caseServiceUrl}/api/v1/claims/${id}/documents/${docId}/replace`, req.raw, {
        headers,
      })
      .pipe(
        map(response => response.data.data),
        catchError(e => {
          throw new HttpException(
            e.response?.data || 'Failed to replace document',
            e.response?.status || HttpStatus.INTERNAL_SERVER_ERROR
          );
        })
      );
  }

  @Post(':id/documents/trinity-check')
  @ApiOperation({ summary: 'Trigger Trinity AI checks for all documents in a claim' })
  triggerTrinityCheck(@Param('id') id: string, @Req() req: any) {
    const headers = {
      Authorization: req.headers.authorization,
      'X-Tenant-Id': req.tenantContext?.tenantId || req.user?.currentTenantId || req.user?.tenantId,
      'X-User-Id': req.user?.id,
      'X-User-Role': req.tenantContext?.userRole || req.user?.role,
    };

    return this.httpService
      .post(`${this.caseServiceUrl}/api/v1/claims/${id}/documents/trinity-check`, {}, { headers })
      .pipe(
        map(response => response.data.data),
        catchError(e => {
          throw new HttpException(
            e.response?.data || 'Failed to trigger Trinity check',
            e.response?.status || HttpStatus.INTERNAL_SERVER_ERROR
          );
        })
      );
  }
}
