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
      return {
        channel: this.channel,
        platformUserId: String(query.message?.chat.id ?? query.from.id),
        platformMessageId: String(update.update_id),
        callbackValue: query.data,
      };
    }

    const message = update.message;
    if (!message) return null;

    const payload: InboundTurnPayload = {
      channel: this.channel,
      platformUserId: String(message.chat.id),
      platformMessageId: String(update.update_id),
    };

    // request_contact result. Telegram vouches for this number, which spares
    // the claimant typing it — the one-time code still follows.
    if (message.contact?.phone_number) {
      payload.sharedPhone = this.normalisePhone(message.contact.phone_number);
    }

    if (message.text) payload.text = message.text;

    // Largest rendition of a photo, or a document. Stored as a reference only:
    // the bytes are fetched when a document step actually wants them, so a
    // claimant sending unrelated pictures costs neither a download nor a
    // storage write.
    if (message.photo?.length) {
      payload.mediaRef = message.photo[message.photo.length - 1].file_id;
    } else if (message.document?.file_id) {
      payload.mediaRef = message.document.file_id;
    }

    // Nothing usable — not even a turn.
    if (!payload.text && !payload.mediaRef && !payload.sharedPhone) return null;

    return payload;
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

    await firstValueFrom(this.http.post(`${this.api}/sendMessage`, body));
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
        { text: option.label, callback_data: option.value },
      ]);
      if (rendering.hasMore) {
        rows.push([
          { text: 'More options ▸', callback_data: `${PAGE_CALLBACK_PREFIX}${page + 1}` },
        ]);
      }
      return { inline_keyboard: rows };
    }

    if (step.answerType === 'confirm') {
      return {
        inline_keyboard: [
          [
            { text: '✅ Confirm', callback_data: 'true' },
            { text: '✏️ Change something', callback_data: 'false' },
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
  private normalisePhone(raw: string): string {
    const digits = raw.replace(/[^\d]/g, '');
    return digits.startsWith('60') ? `+${digits}` : digits;
  }
}
