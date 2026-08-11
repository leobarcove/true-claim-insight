import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { InternalHttpModule } from '../common/internal-http.module';
import { ConversationsProxyController } from './conversations.controller';
import { ClaimantConversationProxyController } from './claimant-conversation.controller';

@Module({
  imports: [InternalHttpModule, ConfigModule],
  controllers: [ConversationsProxyController, ClaimantConversationProxyController],
})
export class ConversationsProxyModule {}
