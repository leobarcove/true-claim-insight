import { HttpService } from '@nestjs/axios';
import { Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { firstValueFrom } from 'rxjs';
import { map } from 'rxjs/operators';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../auth/guards/tenant.guard';
import { unwrapEnvelope } from '../common/unwrap-envelope';

/**
 * Edge proxy for the FNOL inbound queue.
 *
 * Same shape as the quantum proxy: the internal key rides on `httpService`,
 * and role gating stays in case-service so it has one home.
 */
@ApiTags('Ingestion')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TenantGuard)
@Controller('ingestion')
export class IngestionProxyController {
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

  @Get('messages')
  @ApiOperation({ summary: 'Inbound FNOL emails, newest first' })
  list(@Query() query: Record<string, string>, @Req() req: any) {
    return firstValueFrom(
      this.httpService
        .get(`${this.caseServiceUrl}/api/v1/ingestion/messages`, {
          headers: this.forward(req),
          params: query,
        })
        .pipe(map(response => unwrapEnvelope(response.data)))
    );
  }

  @Post('messages/:id/retry')
  @ApiOperation({ summary: 'Re-run parsing and Case creation for a message' })
  retry(@Param('id') id: string, @Req() req: any) {
    return firstValueFrom(
      this.httpService
        .post(
          `${this.caseServiceUrl}/api/v1/ingestion/messages/${id}/retry`,
          {},
          { headers: this.forward(req) }
        )
        .pipe(map(response => unwrapEnvelope(response.data)))
    );
  }

  @Post('messages/:id/ignore')
  @ApiOperation({ summary: 'Dismiss a message that is not an FNOL' })
  ignore(@Param('id') id: string, @Req() req: any) {
    return firstValueFrom(
      this.httpService
        .post(
          `${this.caseServiceUrl}/api/v1/ingestion/messages/${id}/ignore`,
          {},
          { headers: this.forward(req) }
        )
        .pipe(map(response => unwrapEnvelope(response.data)))
    );
  }
}
