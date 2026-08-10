import { Module } from '@nestjs/common';
import { ConsentGateService } from '../common/consent/consent-gate.service';
import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';
import { RoomsModule } from '../rooms/rooms.module';

@Module({
  imports: [RoomsModule],
  controllers: [WebhooksController],
  providers: [WebhooksService, ConsentGateService],
})
export class WebhooksModule {}
