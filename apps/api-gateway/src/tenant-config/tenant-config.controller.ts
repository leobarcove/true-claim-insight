import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantGuard, type TenantContext } from '../auth/guards/tenant.guard';
import { UpdateTenantSettingsDto } from './dto/update-settings.dto';
import { TenantConfigService } from './tenant-config.service';

/**
 * Per-tenant configuration.
 *
 * Implemented here rather than proxied: `Tenant` is identity-context data and
 * the gateway owns it. Reading is open to compliance as well as firm admins —
 * the settings determine whether a control blocked, so a compliance officer
 * reviewing a claim needs to see the configuration it was handled under.
 */
@ApiTags('Tenant configuration')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TenantGuard)
@Controller('tenants/:tenantId/settings')
export class TenantConfigController {
  constructor(private readonly service: TenantConfigService) {}

  private context(req: any): TenantContext {
    return {
      tenantId: req.tenantContext?.tenantId || req.user?.currentTenantId || req.user?.tenantId,
      userId: req.user?.id,
      userRole: req.tenantContext?.userRole || req.user?.role,
    } as TenantContext;
  }

  @Get()
  @ApiOperation({ summary: 'Effective settings, with defaults made explicit' })
  read(@Param('tenantId', ParseUUIDPipe) tenantId: string, @Req() req: any) {
    return this.service.read(tenantId, this.context(req));
  }

  @Patch()
  @ApiOperation({ summary: 'Merge a partial change; licensed mode requires a reason' })
  update(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Body() dto: UpdateTenantSettingsDto,
    @Req() req: any
  ) {
    return this.service.update(tenantId, dto, this.context(req));
  }
}
