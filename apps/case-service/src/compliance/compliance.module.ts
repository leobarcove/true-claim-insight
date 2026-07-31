import { Module } from '@nestjs/common';
import { PrismaModule } from '../config/prisma.module';
import { ComplianceEventsController } from './compliance-events.controller';
import { ComplianceEventsService } from './compliance-events.service';

@Module({
  imports: [PrismaModule],
  controllers: [ComplianceEventsController],
  providers: [ComplianceEventsService],
  exports: [ComplianceEventsService],
})
export class ComplianceModule {}
