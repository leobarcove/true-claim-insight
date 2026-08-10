import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { InternalHttpModule } from '../common/internal-http.module';
import { ConversationsProxyController } from './conversations.controller';

@Module({
  imports: [InternalHttpModule, ConfigModule],
  controllers: [ConversationsProxyController],
})
export class ConversationsProxyModule {}
