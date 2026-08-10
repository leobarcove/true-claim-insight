import { Module } from '@nestjs/common';

import { AuditModule } from '../common/audit/audit.module';
import { PrismaModule } from '../config/prisma.module';
import { TenantConfigController } from './tenant-config.controller';
import { TenantConfigService } from './tenant-config.service';

@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [TenantConfigController],
  providers: [TenantConfigService],
  exports: [TenantConfigService],
})
export class TenantConfigModule {}
