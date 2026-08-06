import { HttpService } from '@nestjs/axios';
import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { firstValueFrom } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../auth/guards/tenant.guard';

/**
 * Edge proxy for quantum worksheets.
 *
 * case-service refuses any request without the internal key, so the portal
 * cannot call it directly — which is the point of A1. `httpService` here
 * carries that key as an axios default, so no call site can forget it.
 *
 * Role gating stays downstream: case-service owns who may prepare a figure,
 * and duplicating that rule here would give it two homes to drift between.
 */
@ApiTags('Quantum')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TenantGuard)
@Controller('claims/:claimId/quantum')
export class QuantumProxyController {
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

  private base(claimId: string) {
    return `${this.caseServiceUrl}/api/v1/claims/${claimId}/quantum`;
  }

  @Post()
  @ApiOperation({ summary: 'Prepare a quantum worksheet, superseding any previous revision' })
  create(@Param('claimId') claimId: string, @Body() body: unknown, @Req() req: any) {
    return firstValueFrom(
      this.httpService.post(this.base(claimId), body, { headers: this.forward(req) }).pipe(
        map(response => response.data?.data ?? response.data),
        catchError(error => {
          throw error;
        })
      )
    );
  }

  @Get()
  @ApiOperation({ summary: 'The current worksheet for this claim' })
  current(@Param('claimId') claimId: string, @Req() req: any) {
    return firstValueFrom(
      this.httpService
        .get(this.base(claimId), { headers: this.forward(req) })
        .pipe(map(response => response.data?.data ?? response.data))
    );
  }

  @Get('history')
  @ApiOperation({ summary: 'Every revision, newest first' })
  history(@Param('claimId') claimId: string, @Req() req: any) {
    return firstValueFrom(
      this.httpService
        .get(`${this.base(claimId)}/history`, { headers: this.forward(req) })
        .pipe(map(response => response.data?.data ?? response.data))
    );
  }
}
