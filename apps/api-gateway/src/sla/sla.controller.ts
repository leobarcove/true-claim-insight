import { HttpService } from '@nestjs/axios';
import { Controller, Get, Param, Req, UseGuards, Body, Post } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { firstValueFrom } from 'rxjs';
import { map } from 'rxjs/operators';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../auth/guards/tenant.guard';
import { unwrapEnvelope } from '../common/unwrap-envelope';
import { passThroughDownstreamError } from '../common/proxy-error';

/**
 * Edge proxy for SLA clocks.
 *
 * Role gating stays downstream in case-service, which owns who may see what;
 * duplicating it here would give the rule two homes to drift between.
 */
@ApiTags('SLA')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TenantGuard)
@Controller('sla')
export class SlaProxyController {
  private readonly caseServiceUrl: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService
  ) {
    this.caseServiceUrl = this.configService.get('CASE_SERVICE_URL') || 'http://localhost:3001';
  }

  private forward(req: any) {
    return {
      Authorization: req.headers.authorization,
      'X-Tenant-Id': req.tenantContext?.tenantId || req.user?.currentTenantId || req.user?.tenantId,
      'X-User-Id': req.user?.id,
      'X-User-Role': req.tenantContext?.userRole || req.user?.role,
    };
  }

  @Get('claims/:claimId')
  @ApiOperation({ summary: 'SLA clocks for one claim, newest first' })
  forClaim(@Param('claimId') claimId: string, @Req() req: any) {
    return firstValueFrom(
      this.httpService
        .get(`${this.caseServiceUrl}/api/v1/sla/claims/${claimId}`, {
          headers: this.forward(req),
        })
        .pipe(
          map(response => unwrapEnvelope(response.data)),
          passThroughDownstreamError('The SLA service is unavailable')
        )
    );
  }

  @Post('claims/:claimId/exceptional')
  @ApiOperation({ summary: 'Record a CSP 10.13 exceptional circumstance on a clock' })
  recordExceptional(@Param('claimId') claimId: string, @Body() body: any, @Req() req: any) {
    return firstValueFrom(
      this.httpService
        .post(`${this.caseServiceUrl}/api/v1/sla/claims/${claimId}/exceptional`, body, {
          headers: this.forward(req),
        })
        .pipe(
          map(response => unwrapEnvelope(response.data)),
          passThroughDownstreamError('The SLA service is unavailable')
        )
    );
  }

  @Get('insurer-mi')
  @ApiOperation({ summary: 'Insurer-side CSP performance per insurer' })
  insurerMi(@Req() req: any) {
    return firstValueFrom(
      this.httpService
        .get(`${this.caseServiceUrl}/api/v1/sla/insurer-mi`, { headers: this.forward(req) })
        .pipe(
          map(response => unwrapEnvelope(response.data)),
          passThroughDownstreamError('The SLA service is unavailable')
        )
    );
  }
}
