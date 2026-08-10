import {
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Observable } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../auth/guards/tenant.guard';
import { ClaimantsService } from '../claimants/claimants.service';

/**
 * Proxy for the travel intake Case + Policy endpoints on case-service.
 *
 * NOTE: guards MUST be mounted here explicitly — gateway controllers are
 * public by default (JwtAuthGuard is per-controller in this codebase).
 */
@ApiTags('Cases')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TenantGuard)
@Controller('cases')
export class CasesController {
  private caseServiceUrl: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly claimantsService: ClaimantsService
  ) {
    this.caseServiceUrl = this.configService.get('CASE_SERVICE_URL') || 'http://localhost:3001';
  }

  private identityHeaders(req: any) {
    return {
      Authorization: req.headers.authorization,
      'X-Tenant-Id': req.tenantContext?.tenantId || req.user?.currentTenantId || req.user?.tenantId,
      'X-User-Id': req.user?.id,
      'X-User-Role': req.tenantContext?.userRole || req.user?.role,
    };
  }

  private unwrap(request: Observable<any>, failure: string) {
    return request.pipe(
      map(response => response.data.data),
      catchError(e => {
        throw new HttpException(
          e.response?.data || failure,
          e.response?.status || HttpStatus.INTERNAL_SERVER_ERROR
        );
      })
    );
  }

  @Post()
  @ApiOperation({ summary: 'Create a travel intake case' })
  async create(@Body() body: any, @Req() req: any) {
    // Staff capture: resolve the claimant by phone/NRIC before proxying, the
    // same pattern as POST /claims (agent flow).
    let claimantId = body.claimantId;
    if (!claimantId && body.claimantPhone && req.user?.role !== 'CLAIMANT') {
      const claimant = await this.claimantsService.findOrCreate({
        nric: body.claimantNric,
        phoneNumber: body.claimantPhone,
        fullName: body.claimantFullName,
      });
      claimantId = claimant.id;
    }

    const payload = { ...body, claimantId };
    return this.unwrap(
      this.httpService.post(`${this.caseServiceUrl}/api/v1/cases`, payload, {
        headers: this.identityHeaders(req),
      }),
      'Failed to create case'
    );
  }

  @Get()
  @ApiOperation({ summary: 'Vetting queue: list cases' })
  findAll(@Query() query: any, @Req() req: any) {
    return this.unwrap(
      this.httpService.get(`${this.caseServiceUrl}/api/v1/cases`, {
        headers: this.identityHeaders(req),
        params: query,
      }),
      'Failed to list cases'
    );
  }

  @Get('mine')
  @ApiOperation({ summary: "List the authenticated claimant's cases" })
  findMine(@Req() req: any) {
    return this.unwrap(
      this.httpService.get(`${this.caseServiceUrl}/api/v1/cases/mine`, {
        headers: this.identityHeaders(req),
      }),
      'Failed to list cases'
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Case detail' })
  findOne(@Param('id') id: string, @Req() req: any) {
    return this.unwrap(
      this.httpService.get(`${this.caseServiceUrl}/api/v1/cases/${id}`, {
        headers: this.identityHeaders(req),
      }),
      'Failed to fetch case'
    );
  }

  @Get(':id/flow')
  @ApiOperation({ summary: 'The intake flow this case is walking (pinned version)' })
  getFlow(@Param('id') id: string, @Req() req: any) {
    return this.unwrap(
      this.httpService.get(`${this.caseServiceUrl}/api/v1/cases/${id}/flow`, {
        headers: this.identityHeaders(req),
      }),
      'Failed to fetch case flow'
    );
  }

  @Patch(':id/answers')
  @ApiOperation({ summary: 'Save one intake answer' })
  patchAnswer(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    return this.unwrap(
      this.httpService.patch(`${this.caseServiceUrl}/api/v1/cases/${id}/answers`, body, {
        headers: this.identityHeaders(req),
      }),
      'Failed to save answer'
    );
  }

  @Post(':id/documents/upload')
  @ApiOperation({ summary: 'Upload an intake document' })
  uploadDocument(@Param('id') id: string, @Req() req: any) {
    return this.unwrap(
      this.httpService.post(`${this.caseServiceUrl}/api/v1/cases/${id}/documents/upload`, req.raw, {
        headers: {
          ...this.identityHeaders(req),
          'Content-Type': req.headers['content-type'],
        },
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
      }),
      'Failed to upload document'
    );
  }

  @Post(':id/submit')
  @ApiOperation({ summary: 'Submit the case for vetting' })
  submit(@Param('id') id: string, @Req() req: any) {
    return this.unwrap(
      this.httpService.post(`${this.caseServiceUrl}/api/v1/cases/${id}/submit`, {}, {
        headers: this.identityHeaders(req),
      }),
      'Failed to submit case'
    );
  }

  @Post(':id/request-info')
  @ApiOperation({ summary: 'Request more information from the claimant' })
  requestInfo(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    return this.unwrap(
      this.httpService.post(`${this.caseServiceUrl}/api/v1/cases/${id}/request-info`, body, {
        headers: this.identityHeaders(req),
      }),
      'Failed to request information'
    );
  }

  @Post(':id/refer-expert')
  @ApiOperation({ summary: 'Refer a medical case to a claims expert' })
  referExpert(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    return this.unwrap(
      this.httpService.post(`${this.caseServiceUrl}/api/v1/cases/${id}/refer-expert`, body, {
        headers: this.identityHeaders(req),
      }),
      'Failed to refer case'
    );
  }

  @Get(':id/payout-details')
  @ApiOperation({ summary: 'Decrypt payout bank details (audited, firm admins only)' })
  revealPayoutDetails(@Param('id') id: string, @Req() req: any) {
    return this.unwrap(
      this.httpService.get(`${this.caseServiceUrl}/api/v1/cases/${id}/payout-details`, {
        headers: this.identityHeaders(req),
      }),
      'Failed to retrieve payout details'
    );
  }

  @Post(':id/link-policy')
  @ApiOperation({ summary: 'Manually link a policy' })
  linkPolicy(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    return this.unwrap(
      this.httpService.post(`${this.caseServiceUrl}/api/v1/cases/${id}/link-policy`, body, {
        headers: this.identityHeaders(req),
      }),
      'Failed to link policy'
    );
  }

  @Post(':id/convert')
  @ApiOperation({ summary: 'Convert the case into a claim' })
  convert(@Param('id') id: string, @Req() req: any) {
    return this.unwrap(
      this.httpService.post(`${this.caseServiceUrl}/api/v1/cases/${id}/convert`, {}, {
        headers: this.identityHeaders(req),
      }),
      'Failed to convert case'
    );
  }

  @Post(':id/reject')
  @ApiOperation({ summary: 'Reject the case' })
  reject(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    return this.unwrap(
      this.httpService.post(`${this.caseServiceUrl}/api/v1/cases/${id}/reject`, body, {
        headers: this.identityHeaders(req),
      }),
      'Failed to reject case'
    );
  }
}

@ApiTags('Policies')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TenantGuard)
@Controller('policies')
export class PoliciesController {
  private caseServiceUrl: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService
  ) {
    this.caseServiceUrl = this.configService.get('CASE_SERVICE_URL') || 'http://localhost:3001';
  }

  private identityHeaders(req: any) {
    return {
      Authorization: req.headers.authorization,
      'X-Tenant-Id': req.tenantContext?.tenantId || req.user?.currentTenantId || req.user?.tenantId,
      'X-User-Id': req.user?.id,
      'X-User-Role': req.tenantContext?.userRole || req.user?.role,
    };
  }

  private unwrap(request: Observable<any>, failure: string) {
    return request.pipe(
      map(response => response.data.data),
      catchError(e => {
        throw new HttpException(
          e.response?.data || failure,
          e.response?.status || HttpStatus.INTERNAL_SERVER_ERROR
        );
      })
    );
  }

  @Get()
  @ApiOperation({ summary: 'Search insurer policies' })
  search(@Query() query: any, @Req() req: any) {
    return this.unwrap(
      this.httpService.get(`${this.caseServiceUrl}/api/v1/policies`, {
        headers: this.identityHeaders(req),
        params: query,
      }),
      'Failed to search policies'
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a policy' })
  findOne(@Param('id') id: string, @Req() req: any) {
    return this.unwrap(
      this.httpService.get(`${this.caseServiceUrl}/api/v1/policies/${id}`, {
        headers: this.identityHeaders(req),
      }),
      'Failed to fetch policy'
    );
  }

  @Post()
  @ApiOperation({ summary: 'Manually record an insurer policy' })
  create(@Body() body: any, @Req() req: any) {
    return this.unwrap(
      this.httpService.post(`${this.caseServiceUrl}/api/v1/policies`, body, {
        headers: this.identityHeaders(req),
      }),
      'Failed to create policy'
    );
  }
}
