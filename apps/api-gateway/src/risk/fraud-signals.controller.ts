import {
  Controller,
  Get,
  Post,
  Param,
  Req,
  UseGuards,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { catchError, map } from 'rxjs/operators';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../auth/guards/tenant.guard';

/**
 * Proxy controller for risk-engine's fraud-signals endpoints. Keeps the
 * api-gateway as the single ingress point for the UI.
 */
@ApiTags('Fraud Signals')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TenantGuard)
@Controller('fraud-signals')
export class FraudSignalsController {
  private readonly riskEngineUrl: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService
  ) {
    this.riskEngineUrl =
      this.configService.get('RISK_ENGINE_URL') || 'http://localhost:3004';
  }

  @Post('claims/:claimId/evaluate')
  @ApiOperation({
    summary: 'Run all applicable fraud-signal providers for a claim',
  })
  evaluate(@Param('claimId') claimId: string, @Req() req: any) {
    const headers = this.buildHeaders(req);
    return this.httpService
      .post(
        `${this.riskEngineUrl}/api/v1/fraud-signals/claims/${claimId}/evaluate`,
        {},
        { headers }
      )
      .pipe(
        map(response => response.data),
        catchError(e => {
          throw new HttpException(
            e.response?.data || 'Failed to evaluate fraud signals',
            e.response?.status || HttpStatus.INTERNAL_SERVER_ERROR
          );
        })
      );
  }

  @Get('claims/:claimId')
  @ApiOperation({ summary: 'List fraud signals for a claim' })
  list(@Param('claimId') claimId: string, @Req() req: any) {
    const headers = this.buildHeaders(req);
    return this.httpService
      .get(`${this.riskEngineUrl}/api/v1/fraud-signals/claims/${claimId}`, {
        headers,
      })
      .pipe(
        map(response => response.data),
        catchError(e => {
          throw new HttpException(
            e.response?.data || 'Failed to list fraud signals',
            e.response?.status || HttpStatus.INTERNAL_SERVER_ERROR
          );
        })
      );
  }

  private buildHeaders(req: any) {
    return {
      Authorization: req.headers.authorization,
      'X-Tenant-Id':
        req.tenantContext?.tenantId ||
        req.user?.currentTenantId ||
        req.user?.tenantId,
      'X-User-Id': req.user?.id,
      'X-User-Role': req.tenantContext?.userRole || req.user?.role,
    };
  }
}
