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
  Res,
  UseGuards,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { FastifyReply } from 'fastify';
import { firstValueFrom, Observable } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../auth/guards/tenant.guard';

/**
 * Proxy for the adjuster-report endpoints on case-service.
 *
 * Guards are mounted explicitly — gateway controllers are public by default in
 * this codebase. Authorship and sign-off rules (PD 12.7) are enforced in
 * case-service, not here: the gateway must not be the place a compliance gate
 * lives, or bypassing the gateway bypasses the gate.
 */
@ApiTags('Adjuster Reports')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TenantGuard)
@Controller('reports')
export class ReportsController {
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

  @Get('template')
  @ApiOperation({ summary: 'Section template for a report type' })
  template(@Query('type') type: string, @Req() req: any) {
    return this.unwrap(
      this.httpService.get(`${this.caseServiceUrl}/api/v1/reports/template`, {
        params: { type },
        headers: this.identityHeaders(req),
      }),
      'Failed to load report template'
    );
  }

  @Get('claim/:claimId')
  @ApiOperation({ summary: 'Reports on a claim' })
  forClaim(@Param('claimId') claimId: string, @Req() req: any) {
    return this.unwrap(
      this.httpService.get(`${this.caseServiceUrl}/api/v1/reports/claim/${claimId}`, {
        headers: this.identityHeaders(req),
      }),
      'Failed to load reports'
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'One report' })
  findOne(@Param('id') id: string, @Req() req: any) {
    return this.unwrap(
      this.httpService.get(`${this.caseServiceUrl}/api/v1/reports/${id}`, {
        headers: this.identityHeaders(req),
      }),
      'Failed to load report'
    );
  }

  /**
   * Streams the rendered PDF through rather than unwrapping a JSON envelope —
   * the response body is the document itself.
   */
  @Get(':id/pdf')
  @ApiOperation({ summary: 'Rendered report PDF' })
  async pdf(@Param('id') id: string, @Req() req: any, @Res() reply: FastifyReply) {
    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.caseServiceUrl}/api/v1/reports/${id}/pdf`, {
          headers: this.identityHeaders(req),
          responseType: 'arraybuffer',
        })
      );

      return reply
        .header('Content-Type', 'application/pdf')
        .header('Content-Disposition', response.headers['content-disposition'] ?? 'inline')
        .send(Buffer.from(response.data));
    } catch (e: any) {
      throw new HttpException(
        'Failed to render report',
        e.response?.status || HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Post('claim/:claimId')
  @ApiOperation({ summary: 'Open a report on a claim' })
  create(@Param('claimId') claimId: string, @Body() body: any, @Req() req: any) {
    return this.unwrap(
      this.httpService.post(`${this.caseServiceUrl}/api/v1/reports/claim/${claimId}`, body, {
        headers: this.identityHeaders(req),
      }),
      'Failed to open report'
    );
  }

  @Patch(':id/sections')
  @ApiOperation({ summary: 'Write section content' })
  updateSections(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    return this.unwrap(
      this.httpService.patch(`${this.caseServiceUrl}/api/v1/reports/${id}/sections`, body, {
        headers: this.identityHeaders(req),
      }),
      'Failed to update report'
    );
  }

  @Post(':id/:action')
  @ApiOperation({ summary: 'submit | return | sign | issue | supersede | withdraw' })
  action(
    @Param('id') id: string,
    @Param('action') action: string,
    @Body() body: any,
    @Req() req: any
  ) {
    const allowed = ['submit', 'return', 'sign', 'issue', 'supersede', 'withdraw'];
    if (!allowed.includes(action)) {
      throw new HttpException(`Unknown report action "${action}"`, HttpStatus.NOT_FOUND);
    }

    return this.unwrap(
      this.httpService.post(`${this.caseServiceUrl}/api/v1/reports/${id}/${action}`, body ?? {}, {
        headers: this.identityHeaders(req),
      }),
      `Failed to ${action} report`
    );
  }
}
