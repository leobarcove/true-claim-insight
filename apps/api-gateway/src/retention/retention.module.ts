import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';

import { AuditModule } from '../common/audit/audit.module';
import { PrismaModule } from '../config/prisma.module';
import { ClaimantRetentionScheduler } from './claimant-retention.scheduler';
import { ClaimantRetentionService } from './claimant-retention.service';
import { RetentionController } from './retention.controller';

@Module({
  imports: [PrismaModule, AuditModule, ScheduleModule.forRoot()],
  controllers: [RetentionController],
  providers: [ClaimantRetentionService, ClaimantRetentionScheduler],
  exports: [ClaimantRetentionService],
})
export class RetentionModule {}
