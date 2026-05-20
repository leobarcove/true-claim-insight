import { Module } from '@nestjs/common';
import { FloodClaimsController } from './flood-claims.controller';
import { FloodClaimsService } from './flood-claims.service';
import { TenantModule } from '../tenant/tenant.module';

@Module({
  imports: [TenantModule],
  controllers: [FloodClaimsController],
  providers: [FloodClaimsService],
  exports: [FloodClaimsService],
})
export class FloodClaimsModule {}
