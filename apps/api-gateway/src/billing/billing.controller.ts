import { HttpService } from '@nestjs/axios';
import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { firstValueFrom } from 'rxjs';
import { map } from 'rxjs/operators';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../auth/guards/tenant.guard';
import { unwrapEnvelope } from '../common/unwrap-envelope';

/**
 * Edge proxy for fee notes, time and disbursements.
 *
 * Role gating stays downstream: case-service decides who may draft, issue or
 * settle a note, and duplicating that here would give the rule two homes.
 * `InternalHttpModule` carries the internal key as an axios default — the
 * video module built its own headers, forgot it, and 502'd on everything.
 */
@ApiTags('Billing')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TenantGuard)
@Controller('billing')
export class BillingProxyController {
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

  private get(path: string, req: any) {
    return firstValueFrom(
      this.httpService
        .get(`${this.caseServiceUrl}/api/v1/billing/${path}`, { headers: this.forward(req) })
        .pipe(map(response => unwrapEnvelope(response.data)))
    );
  }

  private post(path: string, body: unknown, req: any) {
    return firstValueFrom(
      this.httpService
        .post(`${this.caseServiceUrl}/api/v1/billing/${path}`, body ?? {}, {
          headers: this.forward(req),
        })
        .pipe(map(response => unwrapEnvelope(response.data)))
    );
  }

  @Get('claims/:claimId/fee-note')
  @ApiOperation({ summary: 'The fee note on a claim, with the time and disbursements behind it' })
  forClaim(@Param('claimId') claimId: string, @Req() req: any) {
    return this.get(`claims/${claimId}/fee-note`, req);
  }

  @Get('statement')
  @ApiOperation({ summary: 'Outstanding fee notes per insurer, aged — the CSP 11.16–11.18 evidence' })
  statement(@Req() req: any) {
    return this.get('statement', req);
  }

  @Post('claims/:claimId/fee-note')
  @ApiOperation({ summary: 'Draft the fee note from the claim records and the insurer scale' })
  draft(@Param('claimId') claimId: string, @Req() req: any) {
    return this.post(`claims/${claimId}/fee-note`, {}, req);
  }

  @Post('claims/:claimId/time')
  @ApiOperation({ summary: 'Record time on a claim' })
  recordTime(@Param('claimId') claimId: string, @Body() body: unknown, @Req() req: any) {
    return this.post(`claims/${claimId}/time`, body, req);
  }

  @Post('claims/:claimId/disbursements')
  @ApiOperation({ summary: 'Record a disbursement' })
  recordDisbursement(@Param('claimId') claimId: string, @Body() body: unknown, @Req() req: any) {
    return this.post(`claims/${claimId}/disbursements`, body, req);
  }

  @Post('scales/:insurerTenantId')
  @ApiOperation({ summary: "Set the insurer's fee scale — rates are configuration, never code" })
  setScale(
    @Param('insurerTenantId') insurerTenantId: string,
    @Body() body: unknown,
    @Req() req: any
  ) {
    return this.post(`scales/${insurerTenantId}`, body, req);
  }

  @Post('fee-notes/:id/issue')
  @ApiOperation({ summary: 'Issue to the insurer; due per the scale payment terms' })
  issue(@Param('id') id: string, @Req() req: any) {
    return this.post(`fee-notes/${id}/issue`, {}, req);
  }

  @Post('fee-notes/:id/paid')
  @ApiOperation({ summary: 'Record settlement; the payment reference is the proof' })
  markPaid(@Param('id') id: string, @Body() body: unknown, @Req() req: any) {
    return this.post(`fee-notes/${id}/paid`, body, req);
  }

  @Post('fee-notes/:id/dispute')
  @ApiOperation({ summary: "Record the insurer's dispute" })
  dispute(@Param('id') id: string, @Body() body: unknown, @Req() req: any) {
    return this.post(`fee-notes/${id}/dispute`, body, req);
  }
}
