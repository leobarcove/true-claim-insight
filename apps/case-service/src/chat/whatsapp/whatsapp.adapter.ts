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

/** Meta rejects a media download above this; surfaced rather than swallowed. */
export class MediaTooLargeError extends Error {
  override readonly name = 'MediaTooLargeError';
  constructor(readonly sizeBytes: number) {
    super(`Attachment is ${(sizeBytes / 1_048_576).toFixed(1)} MB, over the 16 MB limit.`);
  }
}

/** WhatsApp's document limit is 100 MB, but images and video cap far lower. */
const MAX_MEDIA_BYTES = 16 * 1_048_576;

/**
 * Same packing as Telegram's `callback_data`, deliberately.
 *
 * A row id carries "<stepId>|<value>" so the step travels with the answer and
 * the gateway can ignore a tap on a question that has already moved on. Getting
 * this wrong on Telegram stored the claim type as the policy number on a
 * double-tap, silently, on the claimant's first interaction — the same failure
 * is available here and is closed the same way.
 */
const REPLY_SEPARATOR = '|';

/** Meta's cap on an interactive row id — three times Telegram's 64 bytes. */
const REPLY_ID_LIMIT = 200;

/**
 * Split a body to WhatsApp's limit, on a line break where possible.
 *
 * Same reasoning as the Telegram splitter and the same reason it cannot
 * truncate: on a channel with no summary panel the review embeds the whole
 * answer summary in the message body, so clipping it asks a claimant to
 * confirm a claim whose details were cut off mid-line.
 */
export function splitForWhatsApp(text: string, limit = 1024): string[] {
  if (text.length <= limit) return [text];

  const parts: string[] = [];
  let rest = text;
  while (rest.length > limit) {
    const window = rest.slice(0, limit);
    const breakAt = window.lastIndexOf('\n');
    const cut = breakAt > limit * 0.5 ? breakAt : limit;
    parts.push(rest.slice(0, cut).trimEnd());
    rest = rest.slice(cut).trimStart();
  }
  if (rest) parts.push(rest);
  return parts;
}

/**
 * WhatsApp Cloud API as a conversational channel.
 *
 * Structurally the Telegram adapter with three platform differences that are
 * not cosmetic:
 *
 * **Identity arrives for free.** Telegram needs `request_contact` and a check
 * that the shared card belongs to the sender; WhatsApp puts the sender's
 * verified number on every inbound message as `wa_id`. There is nothing to ask
 * for and nothing to spoof, so binding happens on the first message.
 *
 * **Choices are an interactive list, capped at ten rows.** Telegram's inline
 * keyboard holds around a hundred, so pagination never fired there. Here it
 * will, on any list longer than nine — `renderChoices` already reserves a slot
 * for "More options" and the gateway already interprets it.
 *
 * **There is a 24-hour service window.** Replies inside it are free-form and
 * free of charge; outside it, only an approved template may be sent. Intake is
 * claimant-initiated so it sits inside the window, but a conversation left
 * overnight cannot be resumed by us without a template — see `send`.
 */
@Injectable()
export class WhatsAppAdapter implements ChannelAdapter {
  readonly channel = CaseChannel.WHATSAPP;
  readonly capabilities: ChannelCapabilities = CHANNEL_CAPABILITIES[CaseChannel.WHATSAPP];

  private readonly logger = new Logger(WhatsAppAdapter.name);

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService
  ) {}

  isConfigured(): boolean {
    return Boolean(
      this.config.get<string>('WHATSAPP_PHONE_NUMBER_ID') &&
        this.config.get<string>('WHATSAPP_ACCESS_TOKEN')
    );
  }

  private get version(): string {
    return this.config.get<string>('WHATSAPP_API_VERSION') ?? 'v21.0';
  }

  private get api(): string {
    return `https://graph.facebook.com/${this.version}/${this.config.get<string>(
      'WHATSAPP_PHONE_NUMBER_ID'
    )}`;
  }

  private get authHeader(): Record<string, string> {
    return { Authorization: `Bearer ${this.config.get<string>('WHATSAPP_ACCESS_TOKEN')}` };
  }

  /**
   * Turn one inbound webhook message into a turn the gateway can handle.
   *
   * Returns null for anything that is not a claimant saying something —
   * delivery receipts and read receipts arrive on the same webhook and vastly
   * outnumber real messages.
   */
  parseMessage(message: WhatsAppInboundMessage, contactWaId?: string): InboundTurnPayload | null {
    const from = message.from ?? contactWaId;
    if (!from) return null;

    const base = {
      channel: CaseChannel.WHATSAPP,
      platformUserId: from,
      platformMessageId: message.id,
      // The number WhatsApp itself vouches for. Unlike Telegram there is no
      // separate share step and no foreign-contact case: a message can only
      // come from the account that sent it.
      sharedPhone: this.normalisePhone(from),
      chatType: 'private' as const,
    };

    if (message.type === 'text') {
      return { ...base, text: message.text?.body };
    }

    if (message.type === 'interactive') {
      // A list row or a reply button. `id` carries what we encoded when the
      // prompt was sent, so the step travels with the answer and a tap on a
      // question that has moved on is caught by the gateway.
      const reply = message.interactive?.list_reply ?? message.interactive?.button_reply;
      if (!reply?.id) return null;

      // Split on the FIRST separator only: an authored choice value may
      // legitimately contain one.
      const cut = reply.id.indexOf(REPLY_SEPARATOR);
      return {
        ...base,
        callbackStepId: cut > 0 ? reply.id.slice(0, cut) : undefined,
        callbackValue: cut > 0 ? reply.id.slice(cut + 1) : reply.id,
      };
    }

    if (message.type === 'image' || message.type === 'document') {
      const media = message.image ?? message.document;
      return {
        ...base,
        mediaRef: media?.id,
        // A caption is how people label a photo, and discarding it loses an
        // answer the claimant thought they gave.
        text: media?.caption,
      };
    }

    if (message.type === 'button') {
      return { ...base, text: message.button?.text };
    }

    // Audio, video, sticker, location, contacts, reaction. Named so the
    // claimant is told what happened rather than met with silence.
    return { ...base, unsupportedMedia: message.type };
  }

  /**
   * Meta uses one id space for both directions and has no acknowledgement
   * concept for a list tap — the message simply appears in the thread. Nothing
   * to do, and declaring it keeps the interface honest.
   */
  async acknowledgeCallback(): Promise<void> {
    // Intentionally empty. WhatsApp taps need no acknowledgement.
  }

  async send(platformUserId: string, prompt: OutboundPrompt): Promise<void> {
    if (!this.isConfigured()) {
      this.logger.warn('WhatsApp is not configured; message not sent.');
      return;
    }

    const choices = this.choicesFor(prompt);
    const confirm = this.confirmFor(prompt);
    const parts = splitForWhatsApp(prompt.text, this.capabilities.maxMessageChars);

    for (const [index, part] of parts.entries()) {
      const isLast = index === parts.length - 1;

      // The interactive list carries its own body, so it replaces the final
      // plain message rather than following it — two messages would ask the
      // question twice.
      if (isLast && choices) {
        await this.post(
          'messages',
          this.interactivePayload(platformUserId, part, choices, prompt.step!.id)
        );
        continue;
      }

      // Same reasoning for the confirm buttons: they carry the last part as
      // their body, so the summary and the buttons arrive as one bubble.
      if (isLast && confirm) {
        await this.post(
          'messages',
          this.confirmPayload(platformUserId, part, confirm, prompt.step!.id)
        );
        continue;
      }

      await this.post('messages', {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: platformUserId,
        type: 'text',
        text: { body: part },
      });
    }
  }

  /**
   * Send an approved template — the only way to open a conversation Meta has
   * closed.
   *
   * The 24-hour service window runs from the claimant's last message. Inside
   * it, `send` above works and costs nothing; outside it, Meta refuses
   * free-form text (error 131047) and only a template it has approved gets
   * through. That is why the info-request push could not reach a claimant who
   * had gone quiet overnight — which is exactly the claimant a reminder is
   * for.
   *
   * Returns false rather than throwing on refusal: an undeliverable courtesy
   * must not fail the operator's action, and the caller records the outcome.
   * Inert until `WHATSAPP_INFO_REQUEST_TEMPLATE` names an approved template,
   * so nothing changes on a deployment that has not submitted one.
   */
  async sendTemplate(
    platformUserId: string,
    template: { name: string; languageCode: string; bodyParams: string[] }
  ): Promise<boolean> {
    if (!this.isConfigured() || !template.name) return false;

    try {
      await this.post('messages', {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: platformUserId,
        type: 'template',
        template: {
          name: template.name,
          language: { code: template.languageCode },
          components: template.bodyParams.length
            ? [
                {
                  type: 'body',
                  parameters: template.bodyParams.map(text => ({ type: 'text', text })),
                },
              ]
            : [],
        },
      });
      return true;
    } catch (error) {
      // A rejected template is a configuration fact — the name is wrong, or
      // Meta has not approved it — so it is logged loudly and reported as
      // undelivered rather than retried into the void.
      this.logger.error(
        `WhatsApp template "${template.name}" was not delivered: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      return false;
    }
  }

  /**
   * Fetch an attachment: resolve the media id to a URL, then download it.
   *
   * Two calls, as with Telegram, and the URL is short-lived — another reason
   * the gateway resolves media only when a document step actually wants it.
   * The download needs the bearer token too; the URL alone is not enough.
   */
  async fetchMedia(
    mediaRef: string
  ): Promise<{ buffer: Buffer; filename: string; mimeType: string }> {
    const lookup = await firstValueFrom(
      this.http.get(`https://graph.facebook.com/${this.version}/${mediaRef}`, {
        headers: this.authHeader,
      })
    );

    const { url, mime_type: mimeType, file_size: fileSize } = lookup.data ?? {};
    if (!url) throw new Error(`WhatsApp returned no URL for media ${mediaRef}`);
    if (typeof fileSize === 'number' && fileSize > MAX_MEDIA_BYTES) {
      throw new MediaTooLargeError(fileSize);
    }

    const download = await firstValueFrom(
      this.http.get(url, { headers: this.authHeader, responseType: 'arraybuffer' })
    );

    const buffer = Buffer.from(download.data);
    if (buffer.byteLength > MAX_MEDIA_BYTES) throw new MediaTooLargeError(buffer.byteLength);

    return {
      buffer,
      filename: `${mediaRef}${this.extensionFor(mimeType)}`,
      mimeType: mimeType || 'application/octet-stream',
    };
  }

  // ---------------------------------------------------------------------

  private async post(path: string, body: unknown): Promise<void> {
    try {
      await firstValueFrom(this.http.post(`${this.api}/${path}`, body, { headers: this.authHeader }));
    } catch (error) {
      const status = (error as { response?: { status?: number } })?.response?.status;
      // 131047: outside the 24-hour service window, template required. Worth
      // naming, because the generic failure gives no hint and the fix is not
      // a retry — it is an approved template, or waiting for the claimant.
      const detail = JSON.stringify(
        (error as { response?: { data?: unknown } })?.response?.data ?? {}
      );
      if (detail.includes('131047')) {
        this.logger.error(
          'WhatsApp refused the message: outside the 24-hour service window. ' +
            'Re-engaging a quiet conversation needs an approved template.'
        );
      }
      if (status !== 429) throw error;

      // Meta rate-limits per number. One retry, as with Telegram: if it is
      // still refusing, the problem is not pacing.
      this.logger.warn('WhatsApp rate-limited the send; retrying once in 1s.');
      await new Promise(resolve => setTimeout(resolve, 1000));
      await firstValueFrom(this.http.post(`${this.api}/${path}`, body, { headers: this.authHeader }));
    }
  }

  /** The choice rows for this prompt, paginated to the channel's ten-row cap. */
  private choicesFor(prompt: OutboundPrompt) {
    if (prompt.step?.answerType !== 'choice' || !prompt.step.choices?.length) return null;
    return renderChoices(this.capabilities, prompt.step.choices, prompt.choicePage ?? 0);
  }

  /**
   * Reply buttons for a confirm step — the review among them.
   *
   * A confirm step carries no `choices`, so it fell through `choicesFor` and
   * was sent as plain text. The claimant reached the end of intake, read
   * "please review your details, then confirm to submit", and had nothing to
   * confirm *with*: no button, and no keyword offered. Telegram had rendered a
   * keyboard for this since the beginning; WhatsApp never did, so a claim could
   * be filled in completely on WhatsApp and never submitted.
   *
   * Reply buttons rather than a list: there are two options, and a list would
   * hide them behind a "Choose" tap for no gain. Meta caps a button title at 20
   * characters and truncates silently past it.
   */
  private confirmFor(prompt: OutboundPrompt) {
    if (prompt.step?.answerType !== 'confirm') return null;
    return [
      { value: 'true', title: 'Confirm & submit' },
      { value: 'false', title: 'Change something' },
    ];
  }

  private interactivePayload(
    to: string,
    body: string,
    rendering: ReturnType<typeof renderChoices>,
    stepId: string
  ) {
    const rows = rendering.options.map(option => ({
      id: this.replyId(stepId, option.value),
      // Meta truncates a row title over 24 characters server-side, which would
      // silently clip a claim-type label. Cut here so at least it is visible
      // in our own payload when someone asks why the option reads oddly.
      // A choice that carries a short title uses it — the edit menu's
      // "label — value" form lost its value to this very cap on a real
      // handset — and the value rides the 72-character description row.
      title: (option.title ?? option.label).slice(0, 24),
      ...(option.description ? { description: option.description.slice(0, 72) } : {}),
    }));

    if (rendering.hasMore) {
      rows.push({
        id: `${PAGE_CALLBACK_PREFIX}${rendering.page + 1}`,
        title: 'More options',
      });
    }

    return {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'interactive',
      interactive: {
        type: 'list',
        // The body has its own 1024 cap; the caller has already split to it.
        body: { text: body },
        action: { button: 'Choose', sections: [{ rows }] },
      },
    };
  }

  private confirmPayload(
    to: string,
    body: string,
    buttons: Array<{ value: string; title: string }>,
    stepId: string
  ) {
    return {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'interactive',
      interactive: {
        type: 'button',
        // Same 1024 cap as the list body; the caller has already split to it.
        body: { text: body },
        action: {
          buttons: buttons.map(button => ({
            type: 'reply',
            reply: {
              id: this.replyId(stepId, button.value),
              // Cut here rather than letting Meta truncate server-side, so an
              // oddly-worded button is visible in our own payload.
              title: button.title.slice(0, 20),
            },
          })),
        },
      },
    };
  }

  /**
   * Pack the step and the value into one row id.
   *
   * 200 characters is roomy next to Telegram's 64 bytes, so this stays
   * readable rather than hashed. If a pathological step id and value still
   * overflow, the value goes alone and the warning says why the staleness
   * check will not fire for that row — silently dropping the step is how the
   * protection disappears without anyone noticing.
   */
  private replyId(stepId: string, value: string): string {
    const packed = `${stepId}${REPLY_SEPARATOR}${value}`;
    if (packed.length <= REPLY_ID_LIMIT) return packed;

    this.logger.warn(
      `Row id for step "${stepId}" exceeds ${REPLY_ID_LIMIT} characters; ` +
        'sending the value without its step, so a stale tap cannot be detected here.'
    );
    return value.slice(0, REPLY_ID_LIMIT);
  }

  /** E.164, which is what `wa_id` already is minus the plus sign. */
  private normalisePhone(waId: string): string {
    const digits = waId.replace(/\D/g, '');
    return `+${digits}`;
  }

  private extensionFor(mimeType?: string): string {
    if (!mimeType) return '';
    if (mimeType.includes('pdf')) return '.pdf';
    if (mimeType.includes('png')) return '.png';
    if (mimeType.includes('jpeg') || mimeType.includes('jpg')) return '.jpg';
    return '';
  }
}

/** The shape of one message on Meta's inbound webhook. */
export interface WhatsAppInboundMessage {
  id: string;
  from?: string;
  type: string;
  text?: { body: string };
  button?: { text?: string };
  image?: { id?: string; caption?: string };
  document?: { id?: string; caption?: string };
  interactive?: {
    list_reply?: { id: string; title?: string };
    button_reply?: { id: string; title?: string };
  };
}
