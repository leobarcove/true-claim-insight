import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { CasesModule } from '../cases/cases.module';
import { ConsentModule } from '../consent/consent.module';
import { CHANNEL_ADAPTERS } from './channel-adapter.interface';
import { ConversationGateway } from './conversation.gateway';
import { ConversationsController } from './conversations.controller';
import { ConversationsService } from './conversations.service';
import { ANSWER_NORMALISER } from './answer-normaliser.interface';
import { HttpAnswerNormaliser } from './http-answer-normaliser';
import { HttpClaimantResolver } from './http-claimant-resolver';
import { CLAIMANT_RESOLVER } from './claimant-resolver.interface';
import { TelegramAdapter } from './telegram/telegram.adapter';
import { TelegramPoller } from './telegram/telegram.poller';

/**
 * Conversational intake over messaging channels.
 *
 * Adapters are collected behind one token so the gateway depends on the
 * interface and never on a platform. Adding WhatsApp or Messenger later means
 * one more provider in this array — the gateway does not change.
 *
 * OTP is a port rather than a service: `otpCode` and `claimant` belong to the
 * `identity` context, which only api-gateway may write, so the implementation
 * calls its endpoints instead of the tables.
 */
@Module({
  imports: [HttpModule, CasesModule, ConsentModule],
  controllers: [ConversationsController],
  providers: [
    ConversationGateway,
    ConversationsService,
    TelegramAdapter,
    TelegramPoller,
    { provide: CLAIMANT_RESOLVER, useClass: HttpClaimantResolver },
    { provide: ANSWER_NORMALISER, useClass: HttpAnswerNormaliser },
    {
      provide: CHANNEL_ADAPTERS,
      useFactory: (telegram: TelegramAdapter) => [telegram],
      inject: [TelegramAdapter],
    },
  ],
  exports: [ConversationGateway, ConversationsService],
})
export class ChatModule {}
