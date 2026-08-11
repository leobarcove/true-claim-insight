import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CaseChannel } from '@prisma/client';
import { CHANNEL_CAPABILITIES, renderChoices, type ChannelCapabilities } from '@tci/shared-types';
import { firstValueFrom } from 'rxjs';
import {
  PAGE_CALLBACK_PREFIX,
  type ChannelAdapter,
  type InboundTurnPayload,
  type OutboundPrompt,
} from '../channel-adapter.interface';
import type { TelegramUpdate } from './telegram.types';

/**
 * Separates the step id from the value inside `callback_data`.
 *
 * A pipe because no step id or choice value in any flow contains one, and the
 * publish gate rejects ids that would. Telegram caps callback_data at 64
 * bytes, which the builder below enforces rather than discovering as a 400.
 */
const CALLBACK_SEPARATOR = '|';
const CALLBACK_DATA_LIMIT = 64;

/**
 * Message kinds a claim intake cannot read, in the order we would name them.
 *
 * Not an oversight list — each is a thing a real claimant plausibly sends. The
 * point is to say so rather than ignore it.
 */
const UNREADABLE_KINDS = [
  'voice',
  'video_note',
  'video',
  'audio',
  'sticker',
  'animation',
  'location',
  'venue',
  'poll',
  'dice',
] as const;

/** Telegram refuses `getFile` above this, and says so unhelpfully. */
const MAX_DOWNLOAD_BYTES = 20 * 1024 * 1024;

/** A file Telegram will not hand over. Distinguished so the claimant hears why. */
export class MediaTooLargeError extends Error {
  constructor(readonly sizeBytes: number) {
    super(`Telegram will not serve files above 20 MB (this one is ${sizeBytes} bytes)`);
    this.name = 'MediaTooLargeError';
  }
}

/**
 * Telegram Bot API adapter.
 *
 * Inert without `TELEGRAM_BOT_TOKEN`: `isConfigured()` returns false and the
 * poller never starts, so a deployment without a bot simply has no Telegram
 * channel rather than a stream of auth failures — the same contract as
 * NotificationTransport.
 *
 * Telegram is the loosest-constrained messaging platform available: no
 * template pre-approval, no 24-hour reply window, ~100 inline-keyboard
 * buttons. That is why it is first — every constraint a later channel adds
 * (WhatsApp's 10-row lists and template rules above all) is a tightening of
 * what already works here, not a new shape.
 */
@Injectable()
export class TelegramAdapter implements ChannelAdapter {
  readonly channel = CaseChannel.TELEGRAM;
  readonly capabilities: ChannelCapabilities = CHANNEL_CAPABILITIES[CaseChannel.TELEGRAM];

  private readonly logger = new Logger(TelegramAdapter.name);
  private readonly token: string | undefined;

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService
  ) {
    this.token = this.config.get<string>('TELEGRAM_BOT_TOKEN') || undefined;
  }

  isConfigured(): boolean {
    return Boolean(this.token);
  }

  private get api(): string {
    return `https://api.telegram.org/bot${this.token}`;
  }

  /**
   * Normalise one Telegram update.
   *
   * Returns null for updates that carry nothing we can act on — edited
   * messages, channel posts, service notifications. Dropping them here keeps
   * the gateway free of platform trivia, and they are genuinely not turns:
   * nobody is waiting for a reply to them.
   */
  parseUpdate(update: TelegramUpdate): InboundTurnPayload | null {
    // A tapped inline button. Preferred over text: the value is exact.
    if (update.callback_query) {
      const query = update.callback_query;
      // callback_data is "<stepId>|<value>" where the sender knew the step.
      // Split on the FIRST separator only: a value may legitimately contain
      // one (`__consent:agree` does not, but an authored choice might).
      const raw = query.data ?? '';
      const cut = raw.indexOf(CALLBACK_SEPARATOR);
      const callbackStepId = cut > 0 ? raw.slice(0, cut) : undefined;
      const callbackValue = cut > 0 ? raw.slice(cut + 1) : raw || undefined;

      return {
        channel: this.channel,
        platformUserId: String(query.message?.chat.id ?? query.from.id),
        platformMessageId: String(update.update_id),
        callbackValue,
        callbackStepId,
        callbackAckId: query.id,
      };
    }

    const message = update.message;
    if (!message) return null;

    const payload: InboundTurnPayload = {
      channel: this.channel,
      platformUserId: String(message.chat.id),
      platformMessageId: String(update.update_id),
      // The account's own language setting, so nobody has to be asked which
      // language they read — and so the consent notice can be shown in it.
      locale: message.from?.language_code,
      // A group is not a claimant. Carried up rather than filtered here, so
      // the gateway can answer once instead of the bot going mute in a chat
      // somebody deliberately added it to.
      chatType: message.chat.type,
    };

    // request_contact result — and the identity control for the whole channel,
    // now that no one-time code follows it.
    //
    // `contact` arrives from two very different gestures. The keyboard button
    // returns the sender's OWN number, with `user_id` equal to their id.
    // Sharing a card from the address book returns an arbitrary number with a
    // different `user_id`, or none. Reading `phone_number` without checking
    // meant an attacker could share the victim's contact card and be bound as
    // them; the OTP was the only thing standing in the way, because the code
    // went to the real owner's handset.
    //
    // With the check, `sharedPhone` means what it says: Telegram asserts this
    // account controls this number.
    const contact = message.contact;
    if (contact?.phone_number) {
      if (message.from?.id !== undefined && contact.user_id === message.from.id) {
        payload.sharedPhone = this.normalisePhone(contact.phone_number);
      } else {
        this.logger.warn(
          `Chat ${message.chat.id} shared a contact that is not their own; refusing to bind.`
        );
        payload.sharedForeignContact = true;
      }
    }

    // A caption is the claimant answering *with* the photo — "here is the
    // damage, it happened on Tuesday". Dropped until now, so on a non-document
    // step they got "that does not look right" about text they had provided.
    if (message.text) payload.text = message.text;
    else if (message.caption) payload.text = message.caption;

    // Largest rendition of a photo, or a document. Stored as a reference only:
    // the bytes are fetched when a document step actually wants them, so a
    // claimant sending unrelated pictures costs neither a download nor a
    // storage write.
    if (message.photo?.length) {
      payload.mediaRef = message.photo[message.photo.length - 1].file_id;
    } else if (message.document?.file_id) {
      payload.mediaRef = message.document.file_id;
    }

    // Something we cannot read as an answer. Named rather than dropped: these
    // produced no payload at all, so the turn left no row, no reply and no
    // trace, and the claimant simply got silence.
    if (!payload.text && !payload.mediaRef && !payload.sharedPhone) {
      const kind = UNREADABLE_KINDS.find(candidate => message[candidate] !== undefined);
      if (kind) payload.unsupportedMedia = kind;
    }

    // Nothing usable — not even a turn. A refused contact *is* a turn, though:
    // the claimant tapped share and is waiting, so dropping it here would
    // leave them staring at silence with no idea what went wrong.
    if (
      !payload.text &&
      !payload.mediaRef &&
      !payload.sharedPhone &&
      !payload.sharedForeignContact &&
      !payload.unsupportedMedia
    ) {
      return null;
    }

    return payload;
  }

  /**
   * Stop the button spinning.
   *
   * Telegram shows a loading indicator on a tapped inline button until the bot
   * answers the callback — up to thirty seconds. Nothing did, so every tap
   * looked like it had hung, and a claimant naturally tapped again. That is
   * how this became a data defect rather than a cosmetic one: the second tap
   * carried the same value into whatever question had taken its place.
   *
   * Never throws. An unacknowledged tap is a blemish; failing the turn over
   * one would be worse than the blemish.
   */
  async acknowledgeCallback(ackId: string): Promise<void> {
    if (!this.isConfigured()) return;
    try {
      await firstValueFrom(
        this.http.post(`${this.api}/answerCallbackQuery`, { callback_query_id: ackId })
      );
    } catch (error) {
      this.logger.warn(`Could not acknowledge callback ${ackId}: ${(error as Error).message}`);
    }
  }

  async send(platformUserId: string, prompt: OutboundPrompt): Promise<void> {
    if (!this.isConfigured()) {
      this.logger.warn('TELEGRAM_BOT_TOKEN not set; message not sent.');
      return;
    }

    const body: Record<string, unknown> = {
      chat_id: platformUserId,
      text: this.truncate(prompt.text),
    };

    const markup = this.replyMarkup(prompt);
    if (markup) body.reply_markup = markup;

    await this.postWithRateLimitRetry('sendMessage', body);
  }

  /**
   * Send, and honour a rate limit rather than treating it as a failure.
   *
   * Telegram allows roughly one message per second to a chat and answers 429
   * with `retry_after`. Nothing read it, so a burst — and one answer can fire
   * four messages: the confirmation echo, a deadline warning, the "updated"
   * line and the next question — surfaced as a thrown send. That took the
   * whole turn down the failure path, which is a heavy price for the platform
   * telling us politely to wait a second.
   *
   * One retry only. If it is still refusing after the delay it asked for, the
   * problem is not pacing.
   */
  private async postWithRateLimitRetry(method: string, body: unknown): Promise<void> {
    try {
      await firstValueFrom(this.http.post(`${this.api}/${method}`, body));
    } catch (error) {
      const status = (error as { response?: { status?: number; data?: unknown } })?.response?.status;
      const retryAfter = (
        (error as { response?: { data?: { parameters?: { retry_after?: number } } } })?.response
          ?.data?.parameters?.retry_after
      );
      if (status !== 429) throw error;

      const waitMs = Math.min((retryAfter ?? 1) * 1000, 30_000);
      this.logger.warn(`Telegram rate-limited ${method}; retrying once in ${waitMs}ms.`);
      await new Promise(resolve => setTimeout(resolve, waitMs));
      await firstValueFrom(this.http.post(`${this.api}/${method}`, body));
    }
  }

  /**
   * Telegram needs the file path before the bytes: getFile, then download.
   * Two calls, and the path is short-lived, which is another reason not to
   * resolve media until it is wanted.
   */
  async fetchMedia(
    mediaRef: string
  ): Promise<{ buffer: Buffer; filename: string; mimeType: string }> {
    if (!this.isConfigured()) throw new Error('TELEGRAM_BOT_TOKEN not set');

    const { data: meta } = await firstValueFrom(
      this.http.get(`${this.api}/getFile`, { params: { file_id: mediaRef } })
    );
    const filePath = meta?.result?.file_path;
    if (!filePath) throw new Error(`Telegram returned no file_path for ${mediaRef}`);

    // Checked before the download rather than discovered as a generic failure.
    // A hospital bill or policy PDF over 20 MB is ordinary, and the claimant
    // was being told "something went wrong on our side" — untrue, and no
    // reason not to send the same file again forever.
    const sizeBytes = Number(meta?.result?.file_size ?? 0);
    if (sizeBytes > MAX_DOWNLOAD_BYTES) throw new MediaTooLargeError(sizeBytes);

    const { data, headers } = await firstValueFrom(
      this.http.get(`https://api.telegram.org/file/bot${this.token}/${filePath}`, {
        responseType: 'arraybuffer',
      })
    );

    return {
      buffer: Buffer.from(data),
      filename: filePath.split('/').pop() || mediaRef,
      mimeType: (headers['content-type'] as string) || 'application/octet-stream',
    };
  }

  /**
   * Build the keyboard for a prompt.
   *
   * Choice steps become an inline keyboard, one button per row — Malaysian
   * claim reasons are long enough that side-by-side buttons truncate on a
   * phone. Paginated through the shared `renderChoices`, so the rule is the
   * same on every channel even though Telegram's ceiling is high enough that
   * it rarely engages.
   */
  /**
   * Pack the step id alongside the value, within Telegram's 64-byte cap.
   *
   * Over the cap Telegram rejects the whole send with a 400, which would take
   * out the question rather than just the safeguard — so the step id is
   * dropped and the value sent alone, loudly. The tap then behaves as it did
   * before this existed: accepted against whatever step is current. Better a
   * question that works with a known gap than a flow nobody can answer.
   */
  private callbackData(stepId: string, value: string): string {
    const packed = `${stepId}${CALLBACK_SEPARATOR}${value}`;
    if (Buffer.byteLength(packed, 'utf8') <= CALLBACK_DATA_LIMIT) return packed;

    this.logger.warn(
      `callback_data for step "${stepId}" exceeds ${CALLBACK_DATA_LIMIT} bytes; ` +
        'sending the value without its step, so a stale tap cannot be detected here.'
    );
    return value.slice(0, CALLBACK_DATA_LIMIT);
  }

  private replyMarkup(prompt: OutboundPrompt): Record<string, unknown> | undefined {
    if (prompt.requestPhone) {
      return {
        keyboard: [[{ text: '📱 Share my number', request_contact: true }]],
        resize_keyboard: true,
        one_time_keyboard: true,
      };
    }

    const step = prompt.step;
    if (!step) return undefined;

    if (step.answerType === 'choice' && step.choices?.length) {
      const page = prompt.choicePage ?? 0;
      const rendering = renderChoices(this.capabilities, step.choices, page);
      const rows = rendering.options.map(option => [
        { text: option.label, callback_data: this.callbackData(step.id, option.value) },
      ]);
      if (rendering.hasMore) {
        rows.push([
          {
            text: 'More options ▸',
            callback_data: this.callbackData(step.id, `${PAGE_CALLBACK_PREFIX}${page + 1}`),
          },
        ]);
      }
      return { inline_keyboard: rows };
    }

    if (step.answerType === 'confirm') {
      return {
        inline_keyboard: [
          [
            { text: '✅ Confirm', callback_data: this.callbackData(step.id, 'true') },
            { text: '✏️ Change something', callback_data: this.callbackData(step.id, 'false') },
          ],
        ],
      };
    }

    return undefined;
  }

  /**
   * Telegram rejects a message body over 4096 characters outright, so a long
   * prompt would fail to send rather than arrive clipped. Truncating here
   * keeps the conversation moving; flow copy this long is a content problem
   * the editor should be flagging, not something to discover at send time.
   */
  private truncate(text: string): string {
    const limit = this.capabilities.maxMessageChars;
    if (text.length <= limit) return text;
    this.logger.warn(`Prompt exceeded ${limit} characters and was truncated.`);
    return `${text.slice(0, limit - 1)}…`;
  }

  /** Telegram returns numbers with or without a +; store one shape. */
  /**
   * One shape for every number, not one for Malaysia and another for the rest.
   *
   * This prefixed `+` only when the number began `60`, so a Singaporean or
   * British claimant was stored as bare digits while a Malaysian got E.164 —
   * two formats in one column. Travel claimants are *by definition* abroad, so
   * this was the common case, and the cost is a duplicate Claimant: the same
   * person binding by Telegram would not match the record their PWA login
   * created, and their claims would sit under two identities.
   *
   * Telegram's request_contact always returns an international number, so
   * prefixing the digits is correct for every country.
   */
  private normalisePhone(raw: string): string {
    const digits = raw.replace(/[^\d]/g, '');
    return digits ? `+${digits}` : digits;
  }
}
