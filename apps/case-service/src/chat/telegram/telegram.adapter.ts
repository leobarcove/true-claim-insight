import { createHmac, timingSafeEqual } from 'crypto';

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

/**
 * Break a long body on paragraph, then line, then hard boundaries.
 *
 * Telegram rejects anything over 4096 characters. Truncating was the previous
 * answer and is the wrong one for the review step, which carries the answer
 * summary in its body: a claimant would be asked to confirm a claim whose
 * details had been cut off. Splitting on a blank line keeps the summary
 * readable across parts.
 */
export function splitForTelegram(text: string, limit = 4096): string[] {
  if (text.length <= limit) return [text];

  const parts: string[] = [];
  let rest = text;
  while (rest.length > limit) {
    const window = rest.slice(0, limit);
    // Prefer a paragraph break, then a line break, then wherever we must.
    const cut = Math.max(window.lastIndexOf('\n\n'), window.lastIndexOf('\n'));
    const at = cut > limit * 0.5 ? cut : limit;
    parts.push(rest.slice(0, at).trimEnd());
    rest = rest.slice(at).trimStart();
  }
  if (rest) parts.push(rest);
  return parts;
}

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
/**
 * How long a Mini App launch stays usable, and how much clock drift to forgive.
 *
 * Fifteen minutes covers a claimant who opens the form, goes to find a boarding
 * pass, and comes back — the session the gateway issues afterwards carries the
 * rest of the visit, so this bounds the *launch*, not the conversation.
 */
const MINI_APP_MAX_AGE_SECONDS = 15 * 60;
const MINI_APP_CLOCK_SKEW_SECONDS = 60;

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

  /**
   * Verify a Mini App's `initData` and return the Telegram user id it attests.
   *
   * Telegram signs the launch parameters with a key derived from the bot token,
   * so a valid signature proves the page really was opened from a Telegram
   * client for that user — the same attestation the thread relies on, arriving
   * over HTTP instead of over the Bot API. Without this check `initData` is
   * just a query string the browser could invent, and the Mini App would be an
   * unauthenticated way into someone else's claim.
   *
   * The derivation is HMAC-of-HMAC and the order is not interchangeable: the
   * *key* is `HMAC_SHA256("WebAppData", botToken)`, and that result keys the
   * hash of the data. Signing with the raw token instead verifies nothing an
   * attacker could not also compute if the token ever leaked into a client.
   *
   * @returns the Telegram user id as a string, or null if it does not verify.
   */
  verifyInitData(initData: string, now: Date = new Date()): string | null {
    if (!this.token || !initData) return null;

    let params: URLSearchParams;
    try {
      params = new URLSearchParams(initData);
    } catch {
      return null;
    }

    const hash = params.get('hash');
    if (!hash) return null;

    // Every field except `hash`, sorted, as `key=value` joined by newlines.
    // Sorting is part of the spec, not a tidiness choice — Telegram signed the
    // sorted form, so any other order hashes to something else entirely.
    params.delete('hash');
    const checkString = [...params.entries()]
      .map(([key, value]) => `${key}=${value}`)
      .sort()
      .join('\n');

    const secret = createHmac('sha256', 'WebAppData').update(this.token).digest();
    const expected = createHmac('sha256', secret).update(checkString).digest('hex');

    // Constant-time, because this is a value the caller supplies and can
    // iterate on. Length-checked first: timingSafeEqual throws on a mismatch
    // rather than returning false, and a thrown comparison is a 500 where a
    // forged signature should be a refusal.
    if (hash.length !== expected.length) return null;
    if (!timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(expected, 'hex'))) return null;

    // A signature stays valid forever; `auth_date` is what stops a captured
    // launch URL being replayed next month. Telegram recommends checking it and
    // does not enforce it, so the window is ours to choose — long enough that a
    // claimant can be interrupted mid-claim, short enough that a leaked link in
    // a screenshot or a shared browser history is not a way in.
    const authDate = Number(params.get('auth_date'));
    if (!Number.isFinite(authDate)) return null;
    const ageSeconds = now.getTime() / 1000 - authDate;
    if (ageSeconds < -MINI_APP_CLOCK_SKEW_SECONDS || ageSeconds > MINI_APP_MAX_AGE_SECONDS) {
      this.logger.warn('Mini App initData verified but is outside the freshness window.');
      return null;
    }

    try {
      const user = JSON.parse(params.get('user') ?? '{}');
      // Same string the poller stores as `platformUserId`, so the binding this
      // resolves is the one the thread has been using all along.
      return user?.id ? String(user.id) : null;
    } catch {
      return null;
    }
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

    // An edit cannot be applied — the original may already be stored and
    // acted on, and a flow has no concept of revising a past turn. But the
    // claimant has done something deliberate and is waiting, so it becomes a
    // turn that can be answered rather than nothing at all.
    if (update.edited_message) {
      return {
        channel: this.channel,
        platformUserId: String(update.edited_message.chat.id),
        platformMessageId: String(update.update_id),
        chatType: update.edited_message.chat.type,
        editedMessage: true,
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

    const markup = this.replyMarkup(prompt);

    // Split rather than truncate. The review embeds the whole answer summary
    // in the body on a channel with no summary panel, so clipping it means
    // asking a claimant to confirm a claim whose details were cut off
    // mid-line — agreeing to something they were not shown.
    const parts = splitForTelegram(prompt.text);
    for (const [index, part] of parts.entries()) {
      const isLast = index === parts.length - 1;
      const body: Record<string, unknown> = { chat_id: platformUserId, text: part };
      // The keyboard belongs on the last part, next to the question it answers.
      if (isLast && markup) body.reply_markup = markup;
      // Once the contact is in, the reply keyboard has done its job. Leaving
      // it pinned means a "Share my number" button sitting under every
      // subsequent question.
      else if (isLast && prompt.removeKeyboard) body.reply_markup = { remove_keyboard: true };
      await this.postWithRateLimitRetry('sendMessage', body);
    }
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
      const rendering = renderChoices(this.capabilities, step.choices, page, step.allowOther);
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
      const rows: Array<Array<Record<string, unknown>>> = [
        [
          { text: '✅ Confirm', callback_data: this.callbackData(step.id, 'true') },
          { text: '✏️ Change something', callback_data: this.callbackData(step.id, 'false') },
        ],
      ];
      // The review is the strongest case for the form. In a thread the summary
      // is a wall of text in a bubble, and the claimant is being asked to check
      // the facts of their own claim in it.
      const form = this.miniAppButton();
      if (form) rows.push([form]);
      return { inline_keyboard: rows };
    }

    // Dates, where a picker beats parsing what someone typed and where the
    // thread has no affordance at all. Document steps are deliberately left
    // alone: Telegram's own attach button already opens the camera and the
    // file browser, so a form would be a longer route to the same place.
    if (step.answerType === 'date' || step.answerType === 'datetime') {
      const form = this.miniAppButton();
      if (form) return { inline_keyboard: [[form]] };
    }

    return undefined;
  }

  /**
   * The button that opens the Mini App, or nothing.
   *
   * Two conditions, and both must hold. `formPrimitive` is the channel's
   * declared ability to show one at all — the reason this is a capability and
   * not an `if (channel === TELEGRAM)` is that WhatsApp answers the same
   * question with `native_form`, which is not a URL and cannot be offered this
   * way. `CLAIMANT_WEB_URL` is the deployment fact: Telegram will only open an
   * HTTPS origin it can reach, so on a developer machine with no tunnel there
   * is no button rather than a broken one.
   *
   * It carries no token. The page proves who the claimant is with the
   * `initData` Telegram hands it on launch, which is the whole point — a URL
   * with a session in it is a URL that can be forwarded.
   */
  private miniAppButton(): Record<string, unknown> | undefined {
    if (this.capabilities.formPrimitive !== 'webview') return undefined;
    const url = this.config.get<string>('CLAIMANT_WEB_URL');
    if (!url?.startsWith('https://')) return undefined;
    return { text: '📝 Open the form', web_app: { url: `${url.replace(/\/$/, '')}/tg` } };
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
