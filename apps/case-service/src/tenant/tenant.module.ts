import { Module, Global } from '@nestjs/common';
import { TenantService } from './tenant.service';
import { TenantGuard } from '../common/guards/tenant.guard';

/**
 * TenantModule provides multi-tenant isolation services.
 *
 * This module is marked as @Global so TenantService is available
 * throughout the application without explicit imports.
 */
@Global()
@Module({
  providers: [TenantService, TenantGuard],
  exports: [TenantService, TenantGuard],
})
export class TenantModule {}
