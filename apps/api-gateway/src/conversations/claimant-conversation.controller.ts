import { HttpService } from '@nestjs/axios';
import { Body, Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { firstValueFrom } from 'rxjs';
import { map } from 'rxjs/operators';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../auth/guards/tenant.guard';
import { unwrapEnvelope } from '../common/unwrap-envelope';

/**
 * Edge proxy for the claimant's own conversation in the PWA.
 *
 * Separate from `ConversationsProxyController` because the two sides of a
 * conversation are not the same resource: that one is the firm's inbox, this
 * one is a single claimant's thread, resolved entirely from their token. No
 * route here takes an id, so there is nothing for a claimant to enumerate.
 *
 * Role gating stays in case-service, as with every other proxy — one list, not
 * two that drift. Rate limits are applied at *both* ends deliberately: this is
 * the edge a public client actually reaches, and a limit only behind the proxy
 * protects case-service while leaving the gateway to absorb the flood.
 */
@ApiTags('Claimant conversation')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TenantGuard)
@Controller('conversation')
export class ClaimantConversationProxyController {
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

  private base(path = ''): string {
    return `${this.caseServiceUrl}/api/v1/conversation${path}`;
  }

  @Post('start')
  @Throttle({ short: { limit: 3, ttl: 1000 } })
  @ApiOperation({ summary: 'Start or resume the claimant’s intake conversation' })
  start(@Query('locale') locale: string, @Req() req: any) {
    return firstValueFrom(
      this.httpService
        .post(this.base('/start'), {}, { headers: this.forward(req), params: { locale } })
        .pipe(map(response => unwrapEnvelope(response.data)))
    );
  }

  @Get()
  @ApiOperation({ summary: 'The claimant’s own transcript' })
  transcript(@Req() req: any) {
    return firstValueFrom(
      this.httpService
        .get(this.base(), { headers: this.forward(req) })
        .pipe(map(response => unwrapEnvelope(response.data)))
    );
  }

  @Post('turn')
  @Throttle({ short: { limit: 5, ttl: 1000 }, medium: { limit: 40, ttl: 10_000 } })
  @ApiOperation({ summary: 'Send one message, tap or document as the claimant' })
  turn(@Body() body: any, @Req() req: any) {
    return firstValueFrom(
      this.httpService
        .post(this.base('/turn'), body, { headers: this.forward(req) })
        .pipe(map(response => unwrapEnvelope(response.data)))
    );
  }
}
