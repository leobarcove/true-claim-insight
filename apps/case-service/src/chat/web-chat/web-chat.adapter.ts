import { Injectable, Logger } from '@nestjs/common';
import { CaseChannel } from '@prisma/client';
import { CHANNEL_CAPABILITIES, type ChannelCapabilities } from '@tci/shared-types';

import type { ChannelAdapter, OutboundPrompt } from '../channel-adapter.interface';

/**
 * The claimant PWA as a conversational channel.
 *
 * Every other adapter pushes: it holds a token, calls someone else's API and a
 * message appears on a device. Web chat pulls — the browser asks us what has
 * been said. That difference turns out to need almost no machinery, because
 * `ConversationGateway.say()` already persists every outbound message before
 * sending it. The row *is* the delivery. `send` has nothing left to do.
 *
 * Which is the point of building this at all. The PWA had its own intake
 * implementation — the React page drove the flow, called PATCH answers per
 * step, and rendered its own bubbles. It shared the rules with Telegram and
 * nothing else: no transcript, no "back", no progress count, no route to a
 * human. A claimant who got stuck could not be helped, because there was
 * nothing for an operator to open. Everything fixed on the messaging side over
 * the last week had to be written twice or not at all, and it was not at all.
 *
 * Nothing here decides anything. Same contract as Telegram: an adapter knows
 * how to say things on one platform and nothing about what to say.
 */
@Injectable()
export class WebChatAdapter implements ChannelAdapter {
  private readonly logger = new Logger(WebChatAdapter.name);

  readonly channel = CaseChannel.WEB_CHAT;

  /**
   * Declared long before this adapter existed, and consumed by nothing until
   * now: native choice lists with no cap, a real date picker, its own summary
   * panel, and — unlike the messaging channels — no plaintext left sitting in
   * a third party's message history.
   */
  readonly capabilities: ChannelCapabilities = CHANNEL_CAPABILITIES[CaseChannel.WEB_CHAT];

  /**
   * Always. There is no token to configure and no third party to be down: the
   * transport is the claimant's own authenticated session.
   */
  isConfigured(): boolean {
    return true;
  }

  /**
   * Deliberately empty.
   *
   * The gateway persisted this message before calling us, and the PWA reads it
   * from there. Writing it again would put two rows in the transcript for one
   * thing said — the duplicate being the one the claimant actually saw.
   */
  async send(_platformUserId: string, _prompt: OutboundPrompt): Promise<void> {
    // Intentionally no-op. See the class comment.
  }

  /**
   * Never called on this channel, and it must stay that way.
   *
   * Telegram keeps the claimant's file on its own servers and hands us a
   * reference to fetch. A browser has no such staging area — the PWA posts the
   * bytes to our upload endpoint, which validates and stores them, and the turn
   * then carries the resulting document id. The gateway takes that branch
   * instead of this one.
   *
   * Throwing rather than returning empty: a silent zero-byte document would be
   * accepted as evidence and reach an adjuster as a file that will not open.
   */
  async fetchMedia(mediaRef: string): Promise<{ buffer: Buffer; filename: string; mimeType: string }> {
    this.logger.error(
      `fetchMedia called on web chat for "${mediaRef}". The PWA uploads through ` +
        'POST /cases/:id/documents/upload and sends the stored id on the turn.'
    );
    throw new Error('Web chat has no media to fetch; documents arrive already stored.');
  }
}
