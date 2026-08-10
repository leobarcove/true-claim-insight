import {
  Controller,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { SignaturesService } from './signatures.service';
import { InternalAuthGuard } from '../common/guards/internal-auth.guard';
import { RolesGuard, UserRole } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { TenantContext, TenantGuard } from '../common/guards/tenant.guard';
import { Tenant, TenantIsolation, TenantScope } from '../common/decorators/tenant.decorator';

/**
 * Endpoints lifecycle:
 *   POST /documents/:id/request-signature   NOT_REQUESTED -> PENDING
 *   POST /documents/:id/complete-signature  PENDING       -> SIGNED   (stub/demo only)
 *   POST /documents/:id/cancel-signature    PENDING       -> CANCELLED
 *
 * complete-signature stands in for the real SigningCloud webhook handler.
 * When the real provider is wired, this endpoint becomes the webhook
 * receiver and the stub HTTP path can be left as a dev-mode admin tool.
 */
@ApiTags('signatures')
@Controller({ path: 'documents', version: '1' })
@UseGuards(InternalAuthGuard, RolesGuard, TenantGuard)
@TenantIsolation(TenantScope.STRICT)
@Roles(UserRole.ADJUSTER, UserRole.FIRM_ADMIN, UserRole.SUPER_ADMIN)
export class SignaturesController {
  constructor(private readonly service: SignaturesService) {}

  @Post(':id/request-signature')
  @ApiOperation({ summary: 'Create a signing request for the document' })
  requestSignature(
    @Param('id', ParseUUIDPipe) id: string,
    @Tenant() tenantContext: TenantContext
  ) {
    return this.service.requestSignature(id, tenantContext);
  }

  @Post(':id/complete-signature')
  // A signed document is a legal artefact — until the real vendor webhook
  // replaces this stand-in, only firm admins may flip a document to SIGNED.
  @Roles(UserRole.FIRM_ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({
    summary:
      'Mark the document as SIGNED. Stand-in for the vendor webhook; restricted to firm admins.',
  })
  completeSignature(
    @Param('id', ParseUUIDPipe) id: string,
    @Tenant() tenantContext: TenantContext
  ) {
    return this.service.completeSignature(id, tenantContext);
  }

  @Post(':id/cancel-signature')
  @ApiOperation({ summary: 'Cancel a pending signing request' })
  cancelSignature(
    @Param('id', ParseUUIDPipe) id: string,
    @Tenant() tenantContext: TenantContext
  ) {
    return this.service.cancelSignature(id, tenantContext);
  }
}
