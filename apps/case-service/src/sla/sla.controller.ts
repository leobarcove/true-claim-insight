import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../common/decorators/roles.decorator';
import { TenantIsolation, TenantScope } from '../common/decorators/tenant.decorator';
import { InternalAuthGuard } from '../common/guards/internal-auth.guard';
import { RolesGuard, UserRole } from '../common/guards/roles.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { SlaService } from './sla.service';

@ApiTags('sla')
@Controller({ path: 'sla', version: '1' })
@UseGuards(InternalAuthGuard, RolesGuard, TenantGuard)
@TenantIsolation(TenantScope.STRICT)
export class SlaController {
  constructor(private readonly sla: SlaService) {}

  @Get('insurer-mi')
  @ApiOperation({ summary: 'Insurer-side CSP performance (decision/payment windows) per insurer' })
  @Roles(UserRole.FIRM_ADMIN, UserRole.SUPER_ADMIN, UserRole.COMPLIANCE_OFFICER)
  insurerMi() {
    return this.sla.insurerMi();
  }
}
