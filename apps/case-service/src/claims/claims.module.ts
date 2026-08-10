import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { ConsentModule } from '../consent/consent.module';
import { AdjustersModule } from '../adjusters/adjusters.module';
import { SlaModule } from '../sla/sla.module';
import { ClaimsController } from './claims.controller';
import { ClaimsService } from './claims.service';

@Module({
  imports: [SlaModule, ConsentModule, AdjustersModule, NotificationsModule],
  controllers: [ClaimsController],
  providers: [ClaimsService],
  exports: [ClaimsService],
})
export class ClaimsModule {}
