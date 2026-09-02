import { HttpService } from '@nestjs/axios';
import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { firstValueFrom } from 'rxjs';
import { map } from 'rxjs/operators';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../auth/guards/tenant.guard';
import { unwrapEnvelope } from '../common/unwrap-envelope';
import { passThroughDownstreamError } from '../common/proxy-error';

/**
 * Edge proxy for consent, so the claimant app can show the approved notice and
 * record agreement before intake begins.
 *
 * Role gating and the own-record check stay in case-service, where they have
 * one home rather than two lists that drift.
 */
@ApiTags('Consent')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TenantGuard)
@Controller('consent')
export class ConsentProxyController {
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
      'X-Tenant-Id':
        req.tenantContext?.tenantId || req.user?.currentTenantId || req.user?.tenantId,
      'X-User-Id': req.user?.id,
      'X-User-Role': req.tenantContext?.userRole || req.user?.role,
    };
  }

  @Get('notice')
  @ApiOperation({ summary: 'Current approved notice for a purpose and locale' })
  notice(@Query() query: Record<string, string>, @Req() req: any) {
    return firstValueFrom(
      this.httpService
        .get(`${this.caseServiceUrl}/api/v1/consent/notice`, {
          headers: this.forward(req),
          params: query,
        })
        .pipe(
          map(response => unwrapEnvelope(response.data)),
          passThroughDownstreamError('The consent service is unavailable')
        )
    );
  }

  /**
   * Notice versions still waiting to be approved, and the two routes that clear
   * them.
   *
   * These existed in case-service and were reachable from nowhere: not proxied,
   * no screen. On a fresh database every notice is unapproved, and
   * `assertConsent` refuses to open a Case without an approved one — so *all*
   * intake was blocked, on every channel, and the only way out was editing the
   * database by hand. See docs/PDPA_NOTICE_APPROVAL_GAP.md.
   */
  @Get('pending-approval')
  @ApiOperation({ summary: 'Notice versions still awaiting approval' })
  pendingApproval(@Req() req: any) {
    return firstValueFrom(
      this.httpService
        .get(`${this.caseServiceUrl}/api/v1/consent/pending-approval`, {
          headers: this.forward(req),
        })
        .pipe(
          map(response => unwrapEnvelope(response.data)),
          passThroughDownstreamError('The consent service is unavailable')
        )
    );
  }

  @Post('notice/:purpose/:version/approve')
  @ApiOperation({ summary: 'Approve a notice version (refused unless EN and BM both exist)' })
  approveNotice(
    @Param('purpose') purpose: string,
    @Param('version') version: string,
    @Req() req: any
  ) {
    return firstValueFrom(
      this.httpService
        .post(
          `${this.caseServiceUrl}/api/v1/consent/notice/${encodeURIComponent(
            purpose
          )}/${encodeURIComponent(version)}/approve`,
          {},
          { headers: this.forward(req) }
        )
        .pipe(
          map(response => unwrapEnvelope(response.data)),
          passThroughDownstreamError('The consent service is unavailable')
        )
    );
  }

  @Get('claimant/:claimantId')
  @ApiOperation({ summary: "A claimant's consent standing" })
  forClaimant(@Param('claimantId') claimantId: string, @Req() req: any) {
    return firstValueFrom(
      this.httpService
        .get(`${this.caseServiceUrl}/api/v1/consent/claimant/${claimantId}`, {
          headers: this.forward(req),
        })
        .pipe(
          map(response => unwrapEnvelope(response.data)),
          passThroughDownstreamError('The consent service is unavailable')
        )
    );
  }

  @Post('claimant/:claimantId/grant')
  @ApiOperation({ summary: 'Record consent against the approved notice' })
  grant(@Param('claimantId') claimantId: string, @Body() body: any, @Req() req: any) {
    return firstValueFrom(
      this.httpService
        .post(`${this.caseServiceUrl}/api/v1/consent/claimant/${claimantId}/grant`, body, {
          headers: this.forward(req),
        })
        .pipe(
          map(response => unwrapEnvelope(response.data)),
          passThroughDownstreamError('The consent service is unavailable')
        )
    );
  }
}
