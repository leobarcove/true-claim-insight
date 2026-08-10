import { HttpService } from '@nestjs/axios';
import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { firstValueFrom } from 'rxjs';
import { map } from 'rxjs/operators';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../auth/guards/tenant.guard';
import { unwrapEnvelope } from '../common/unwrap-envelope';

/**
 * Edge proxy for the conversations inbox.
 *
 * Same shape as the ingestion proxy: the internal key rides on `httpService`,
 * and role gating stays in case-service so it has one home rather than two
 * lists that drift.
 */
@ApiTags('Conversations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TenantGuard)
@Controller('conversations')
export class ConversationsProxyController {
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
    return `${this.caseServiceUrl}/api/v1/conversations${path}`;
  }

  @Get()
  @ApiOperation({ summary: 'Conversations for this tenant, most recent first' })
  list(@Query() query: Record<string, string>, @Req() req: any) {
    return firstValueFrom(
      this.httpService
        .get(this.base(), { headers: this.forward(req), params: query })
        .pipe(map(response => unwrapEnvelope(response.data)))
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Full transcript, oldest first' })
  transcript(@Param('id') id: string, @Req() req: any) {
    return firstValueFrom(
      this.httpService
        .get(this.base(`/${id}`), { headers: this.forward(req) })
        .pipe(map(response => unwrapEnvelope(response.data)))
    );
  }

  @Post(':id/take-over')
  @ApiOperation({ summary: 'Take the conversation; the bot stands down' })
  takeOver(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    return firstValueFrom(
      this.httpService
        .post(this.base(`/${id}/take-over`), body, { headers: this.forward(req) })
        .pipe(map(response => unwrapEnvelope(response.data)))
    );
  }

  @Post(':id/reply')
  @ApiOperation({ summary: 'Send a message to the claimant as the firm' })
  reply(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    return firstValueFrom(
      this.httpService
        .post(this.base(`/${id}/reply`), body, { headers: this.forward(req) })
        .pipe(map(response => unwrapEnvelope(response.data)))
    );
  }

  @Post(':id/resolve')
  @ApiOperation({ summary: 'Hand back to the bot' })
  resolve(@Param('id') id: string, @Req() req: any) {
    return firstValueFrom(
      this.httpService
        .post(this.base(`/${id}/resolve`), {}, { headers: this.forward(req) })
        .pipe(map(response => unwrapEnvelope(response.data)))
    );
  }
}
