import { HttpService } from '@nestjs/axios';
import { Controller, Get, Param, Req, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { firstValueFrom } from 'rxjs';
import { map } from 'rxjs/operators';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../auth/guards/tenant.guard';
import { unwrapEnvelope } from '../common/unwrap-envelope';

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
        .pipe(map(response => unwrapEnvelope(response.data)))
    );
  }

  @Get('insurer-mi')
  @ApiOperation({ summary: 'Insurer-side CSP performance per insurer' })
  insurerMi(@Req() req: any) {
    return firstValueFrom(
      this.httpService
        .get(`${this.caseServiceUrl}/api/v1/sla/insurer-mi`, { headers: this.forward(req) })
        .pipe(map(response => unwrapEnvelope(response.data)))
    );
  }
}
