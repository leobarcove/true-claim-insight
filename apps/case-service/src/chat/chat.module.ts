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
import { HttpPhoneVerifier } from './http-phone-verifier';
import { PublicConversationController } from './public-conversation.controller';
import { PHONE_VERIFIER } from './phone-verifier.interface';
import { TelegramAdapter } from './telegram/telegram.adapter';
import { WebChatAdapter } from './web-chat/web-chat.adapter';
import { WebFormAdapter } from './web-chat/web-form.adapter';
import { WhatsAppAdapter } from './whatsapp/whatsapp.adapter';
import { WhatsAppWebhookController } from './whatsapp/whatsapp.controller';
import { ClaimantConversationController } from './claimant-conversation.controller';
import { ClaimantConversationService } from './claimant-conversation.service';
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
  imports: [
    // A timeout, because there was none. The poll loop is strictly serial —
    // one turn is awaited fully before the next update, and before the next
    // getUpdates — so a single black-holed connection to api.telegram.org
    // froze the entire channel for every claimant until OS-level TCP
    // keepalive, on the order of two hours, with nothing detecting it.
    //
    // 30s is generous enough for a 20 MB document download and far short of
    // that. `getUpdates` sets its own longer timeout per request, which
    // overrides this, so long-polling is unaffected.
    HttpModule.register({ timeout: 30_000 }),
    CasesModule,
    ConsentModule,
  ],
  controllers: [ConversationsController, ClaimantConversationController, WhatsAppWebhookController,
    PublicConversationController,
  ],
  providers: [
    ConversationGateway,
    ConversationsService,
    TelegramAdapter,
    TelegramPoller,
    WebChatAdapter,
    WebFormAdapter,
    WhatsAppAdapter,
    ClaimantConversationService,
    { provide: CLAIMANT_RESOLVER, useClass: HttpClaimantResolver },
    { provide: ANSWER_NORMALISER, useClass: HttpAnswerNormaliser },
    // Only web chat consumes this; the messaging channels arrive with a
    // platform-verified number and never call it.
    { provide: PHONE_VERIFIER, useClass: HttpPhoneVerifier },
    {
      provide: CHANNEL_ADAPTERS,
      useFactory: (
        telegram: TelegramAdapter,
        webChat: WebChatAdapter,
        webForm: WebFormAdapter,
        whatsapp: WhatsAppAdapter
      ) => [telegram, webChat, webForm, whatsapp],
      inject: [TelegramAdapter, WebChatAdapter, WebFormAdapter, WhatsAppAdapter],
    },
  ],
  exports: [ConversationGateway, ConversationsService],
})
export class ChatModule {}
