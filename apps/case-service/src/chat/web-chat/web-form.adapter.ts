import { Injectable, Logger } from '@nestjs/common';
import { CaseChannel } from '@prisma/client';
import { CHANNEL_CAPABILITIES, type ChannelCapabilities } from '@tci/shared-types';

import type { ChannelAdapter, OutboundPrompt } from '../channel-adapter.interface';

/**
 * The web form as a conversational channel.
 *
 * Mechanically the same as `WebChatAdapter` — a pull channel, where
 * `ConversationGateway.say()` has already persisted the row and the row *is*
 * the delivery, so `send` has nothing left to do. It exists as its own class
 * because the gateway routes on `CaseChannel` and refuses a turn it has no
 * adapter for: without this, every form turn was dropped with "No adapter
 * registered for WEB_FORM", and the claimant saw a form that silently would not
 * advance.
 *
 * Not merged with the chat adapter by giving that one two channels, because the
 * two surfaces genuinely differ where it matters — `capabilities` below is
 * `WEB_FORM`'s, and it is the entry that can honestly declare a summary panel.
 * Sharing the class would mean the form advertising the chat's limitations.
 *
 * Nothing here decides anything. Same contract as every other adapter: it knows
 * how to say things on one surface and nothing about what to say.
 */
@Injectable()
export class WebFormAdapter implements ChannelAdapter {
  private readonly logger = new Logger(WebFormAdapter.name);

  readonly channel = CaseChannel.WEB_FORM;

  /**
   * The form's own profile, not the chat's. The difference that matters is
   * `summaryPanel: true` — the rail beside every section and the review page
   * are real here, where on the chat the same flag had to be false because the
   * panel it promised was never built.
   */
  readonly capabilities: ChannelCapabilities = CHANNEL_CAPABILITIES[CaseChannel.WEB_FORM];

  /** Always. There is no token to configure and no third party to be down. */
  isConfigured(): boolean {
    return true;
  }

  /**
   * Deliberately empty — the gateway persisted this message before calling us,
   * and the form reads it from `GET /public/conversation/state`. Writing it
   * again would put two rows in the transcript for one thing said.
   */
  async send(_platformUserId: string, _prompt: OutboundPrompt): Promise<void> {
    // Intentionally no-op. See the class comment.
  }

  /**
   * Never called here, and it must stay that way. A browser has no staging
   * area a server can fetch from: the form posts the bytes to the upload
   * endpoint, which validates and stores them, and the turn then carries the
   * stored id. Throwing rather than returning empty, because a silent
   * zero-byte document would reach an adjuster as a file that will not open.
   */
  async fetchMedia(
    mediaRef: string
  ): Promise<{ buffer: Buffer; filename: string; mimeType: string }> {
    this.logger.error(
      `fetchMedia called on the web form for "${mediaRef}". The form uploads through ` +
        'POST /public/conversation/upload and sends the stored id on the turn.'
    );
    throw new Error('The web form has no media to fetch; documents arrive already stored.');
  }
}
