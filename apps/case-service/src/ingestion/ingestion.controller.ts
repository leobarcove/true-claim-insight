import { Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { InboundMessageStatus } from '@prisma/client';

import { Roles } from '../common/decorators/roles.decorator';
import { Tenant, TenantIsolation, TenantScope } from '../common/decorators/tenant.decorator';
import { InternalAuthGuard } from '../common/guards/internal-auth.guard';
import { RolesGuard, UserRole } from '../common/guards/roles.guard';
import { TenantContext, TenantGuard } from '../common/guards/tenant.guard';
import { IngestionReviewService } from './ingestion-review.service';

/**
 * The operator queue for FNOL intake.
 *
 * Every email that did not become a Case is here. That is the whole point of
 * persisting `InboundMessage` before parsing: an FNOL the system could not
 * understand is not a non-event, it is a claimant who believes they have
 * notified us and is waiting.
 */
@ApiTags('ingestion')
@Controller({ path: 'ingestion', version: '1' })
@UseGuards(InternalAuthGuard, RolesGuard, TenantGuard)
@TenantIsolation(TenantScope.STRICT)
export class IngestionController {
  constructor(private readonly service: IngestionReviewService) {}

  @Get('messages')
  @ApiOperation({ summary: 'List inbound FNOL emails, newest first' })
  @Roles(
    UserRole.SUPPORT_DESK,
    UserRole.ADJUSTER,
    UserRole.FIRM_ADMIN,
    UserRole.COMPLIANCE_OFFICER,
    UserRole.SUPER_ADMIN
  )
  list(
    @Tenant() tenantContext: TenantContext,
    @Query('status') status?: InboundMessageStatus,
    @Query('limit') limit?: string
  ) {
    return this.service.list(tenantContext, status, limit ? parseInt(limit, 10) : undefined);
  }

  @Post('messages/:id/retry')
  @ApiOperation({ summary: 'Re-run parsing and Case creation for a message' })
  // Retry creates a Case, so it needs the same authority as intake itself.
  @Roles(UserRole.SUPPORT_DESK, UserRole.ADJUSTER, UserRole.FIRM_ADMIN, UserRole.SUPER_ADMIN)
  retry(@Param('id') id: string, @Tenant() tenantContext: TenantContext) {
    return this.service.retry(id, tenantContext);
  }

  @Post('messages/:id/ignore')
  @ApiOperation({ summary: 'Dismiss a message that is not an FNOL (spam, auto-reply)' })
  @Roles(UserRole.SUPPORT_DESK, UserRole.ADJUSTER, UserRole.FIRM_ADMIN, UserRole.SUPER_ADMIN)
  ignore(@Param('id') id: string, @Tenant() tenantContext: TenantContext) {
    return this.service.ignore(id, tenantContext);
  }
}
