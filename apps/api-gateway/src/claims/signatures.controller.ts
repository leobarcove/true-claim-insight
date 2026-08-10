import {
  Controller,
  HttpException,
  HttpStatus,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { catchError, map } from 'rxjs/operators';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../auth/guards/tenant.guard';

/**
 * Proxy controller for case-service signing endpoints. Mirrors the
 * lifecycle:
 *   POST /documents/:id/request-signature    NOT_REQUESTED -> PENDING
 *   POST /documents/:id/complete-signature   PENDING       -> SIGNED
 *   POST /documents/:id/cancel-signature     PENDING       -> CANCELLED
 *
 * Lives under the claims module since signatures belong to claim
 * documents; could move to its own module if SignaturesController gains
 * non-claim concerns later.
 */
@ApiTags('Signatures')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TenantGuard)
@Controller('documents')
export class SignaturesController {
  private readonly caseServiceUrl: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService
  ) {
    this.caseServiceUrl =
      this.configService.get('CASE_SERVICE_URL') || 'http://localhost:3001';
  }

  @Post(':id/request-signature')
  @ApiOperation({ summary: 'Create a signing request for a document' })
  requestSignature(@Param('id') id: string, @Req() req: any) {
    return this.forward(id, 'request-signature', req);
  }

  @Post(':id/complete-signature')
  @ApiOperation({
    summary:
      'Mark a document as SIGNED (stub for the vendor webhook; safe to call from the UI in dev/demo).',
  })
  completeSignature(@Param('id') id: string, @Req() req: any) {
    return this.forward(id, 'complete-signature', req);
  }

  @Post(':id/cancel-signature')
  @ApiOperation({ summary: 'Cancel a pending signing request' })
  cancelSignature(@Param('id') id: string, @Req() req: any) {
    return this.forward(id, 'cancel-signature', req);
  }

  private forward(id: string, action: string, req: any) {
    const headers = this.buildHeaders(req);
    return this.httpService
      .post(`${this.caseServiceUrl}/api/v1/documents/${id}/${action}`, {}, { headers })
      .pipe(
        map(response => response.data.data),
        catchError(e => {
          throw new HttpException(
            e.response?.data || `Failed: ${action}`,
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
