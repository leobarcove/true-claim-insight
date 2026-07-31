import { Module } from '@nestjs/common';
import { PrismaModule } from '../config/prisma.module';
import { ComplianceEventsController } from './compliance-events.controller';
import { BnmNotificationsController } from './bnm-notifications.controller';
import { BnmNotificationsService } from './bnm-notifications.service';
import { ComplianceEventsService } from './compliance-events.service';
import { KeyPersonsController } from './key-persons.controller';
import { KeyPersonsService } from './key-persons.service';

@Module({
  imports: [PrismaModule],
  controllers: [ComplianceEventsController, KeyPersonsController, BnmNotificationsController],
  providers: [ComplianceEventsService, KeyPersonsService, BnmNotificationsService],
  exports: [ComplianceEventsService],
})
export class ComplianceModule {}
