import type { CaseChannel } from '@prisma/client';
import type { ChannelCapabilities, FlowStep } from '@tci/shared-types';

/**
 * Abstraction over a conversational channel.
 *
 * Same plugin pattern as NotificationTransport, InboundMailSource and
 * LlmProvider: bind a concrete implementation to the CHANNEL_ADAPTERS token in
 * ChatModule, and the gateway depends only on this interface.
 *
 * The split it enforces: an adapter knows how to *say* things on one platform
 * and nothing about what to say. Deciding the next question, validating an
 * answer and advancing the Case all happen once, above this line, against the
 * flow pinned on the Case. An adapter that started making those decisions would
 * be the beginning of a second intake implementation — which is the thing the
 * whole flow-as-data design exists to avoid.
 */

/** A normalised inbound message, whatever platform it arrived from. */
export interface InboundTurnPayload {
  channel: CaseChannel;
  /** Opaque per-channel sender id — Telegram chat id, WhatsApp wa_id. */
  platformUserId: string;
  /** Idempotency key. Unique per channel; the database dedupes on it. */
  platformMessageId: string;
  /** Free text, when the turn carried any. */
  text?: string;
  /**
   * The value behind a tapped button, where the platform distinguishes that
   * from typed text. Preferred over `text` when present: a tap is unambiguous
   * and needs no parsing.
   */
  callbackValue?: string;
  /** Platform reference for an attachment, resolved lazily. */
  mediaRef?: string;
  /**
   * A phone number the platform itself vouches for, and which the adapter has
   * confirmed belongs to the *sender* — Telegram's request_contact where
   * `contact.user_id` matches the sender, WhatsApp's verified wa_id.
   *
   * This is the channel's identity control. An adapter must never populate it
   * from a number the sender merely typed or forwarded: a contact card from an
   * address book carries someone else's number, and binding on it would be
   * impersonation.
   */
  sharedPhone?: string;
  /**
   * The sender shared a contact that is not their own.
   *
   * Distinguished from "no contact at all" so the claimant can be told why
   * nothing happened. Silence after tapping share reads as a broken bot, and
   * the honest explanation is short.
   */
  sharedForeignContact?: boolean;
}

/** What the gateway wants said next. Rendering is the adapter's problem. */
export interface OutboundPrompt {
  /** Message body. Already resolved through any channel/locale overlay. */
  text: string;
  /**
   * The step being asked, when the prompt is a flow question. Absent for
   * onboarding messages (phone request, OTP) and for plain acknowledgements.
   */
  step?: FlowStep;
  /** Page of a long choice list; the adapter passes it back on the callback. */
  choicePage?: number;
  /**
   * Ask the platform for a verified phone number rather than free text, where
   * it supports it. Telegram renders a request_contact button.
   */
  requestPhone?: boolean;
}

export interface ChannelAdapter {
  readonly channel: CaseChannel;
  readonly capabilities: ChannelCapabilities;

  /**
   * Whether the adapter can actually run. Returns false rather than throwing,
   * so a deployment with no bot token configured stays inert instead of
   * accumulating failures that look like an outage — same contract as
   * NotificationTransport.isConfigured().
   */
  isConfigured(): boolean;

  /** Send one prompt to one recipient. Throws on failure; the caller records it. */
  send(platformUserId: string, prompt: OutboundPrompt): Promise<void>;

  /**
   * Fetch an attachment the claimant sent.
   *
   * Deliberately lazy: media is pulled only when a document step is actually
   * expecting one, so a claimant who sends holiday photos mid-conversation
   * does not cost a download and a storage write per picture.
   */
  fetchMedia(mediaRef: string): Promise<{ buffer: Buffer; filename: string; mimeType: string }>;
}

/**
 * Marks a "More options" button on a paginated choice list.
 *
 * Adapters emit it, the gateway intercepts it, and the transcript renderer has
 * to name it — three consumers, so the definition lives in `@tci/shared-types`
 * and is re-exported here for the two ends that already import from this file.
 * The `__` prefix keeps it from ever colliding with a real choice value, which
 * would silently answer a question with a page number.
 */
export { PAGE_CALLBACK_PREFIX } from '@tci/shared-types';

export const CHANNEL_ADAPTERS = Symbol('CHANNEL_ADAPTERS');
