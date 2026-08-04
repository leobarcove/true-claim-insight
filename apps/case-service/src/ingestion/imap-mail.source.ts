import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { createHash } from 'node:crypto';

import {
  InboundAttachment,
  InboundMailSource,
  InboundMessage,
} from './inbound-mail.interface';

/**
 * IMAP implementation of the FNOL intake mailbox.
 *
 * Server-side bookkeeping uses a custom IMAP keyword rather than `\Seen`.
 * `\Seen` is set by anything that opens the mailbox — a human glancing at it
 * in a mail client would make the message invisible to the poller, and the
 * claim it announced would never be created. A private keyword is only ever
 * set by this code.
 */
const INGESTED_KEYWORD = 'TciIngested';

/** Attachments above this size are skipped rather than buffered into memory. */
const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

@Injectable()
export class ImapMailSource implements InboundMailSource {
  readonly name = 'imap';

  private readonly logger = new Logger(ImapMailSource.name);

  constructor(private readonly config: ConfigService) {}

  isConfigured(): boolean {
    const imap = this.config.get<Record<string, unknown>>('fnolIntake.imap');
    return Boolean(imap?.host && imap?.user && imap?.password);
  }

  async fetch(limit: number): Promise<InboundMessage[]> {
    if (!this.isConfigured()) return [];

    return this.withClient(async client => {
      // Only messages this code has not already taken. Everything else in the
      // mailbox — read, unread, replied to — is irrelevant to that question.
      const uids = await client.search({ unKeyword: INGESTED_KEYWORD });
      if (!uids || uids.length === 0) return [];

      // Oldest first: FNOL order is claim order, and a backlog should drain in
      // the sequence the incidents were reported.
      const batch = uids.slice(0, limit);
      const messages: InboundMessage[] = [];

      for (const uid of batch) {
        const item = await client.fetchOne(String(uid), { source: true }, { uid: true });
        if (!item || !item.source) continue;

        try {
          messages.push(await this.toInboundMessage(item.source));
        } catch (error) {
          // A single unparseable message must not stall the batch behind it.
          // It stays unflagged, so it is retried; if it is permanently
          // malformed the operator sees it as a FAILED row.
          this.logger.warn(
            `Could not parse message uid=${uid}: ${(error as Error).message}`
          );
        }
      }

      return messages;
    });
  }

  async acknowledge(messageId: string): Promise<void> {
    if (!this.isConfigured()) return;

    await this.withClient(async client => {
      // Resolved by header rather than a cached UID so acknowledgement still
      // works after a process restart. If it does not resolve, the message
      // simply stays unflagged and is fetched again — which the messageId
      // unique constraint makes harmless.
      const uids = await client.search({ header: { 'message-id': messageId } });
      if (!uids || uids.length === 0) {
        this.logger.warn(`Cannot acknowledge unknown message-id ${messageId}`);
        return;
      }
      await client.messageFlagsAdd(
        { uid: uids.join(',') },
        [INGESTED_KEYWORD],
        { uid: true }
      );
    });
  }

  async fetchByMessageId(messageId: string): Promise<InboundMessage | null> {
    if (!this.isConfigured()) return null;

    return this.withClient(async client => {
      const uids = await client.search({ header: { 'message-id': messageId } });
      if (!uids || uids.length === 0) return null;

      const item = await client.fetchOne(String(uids[0]), { source: true }, { uid: true });
      if (!item || !item.source) return null;

      return this.toInboundMessage(item.source);
    });
  }

  /** Open a connection, run the operation, and always close it. */
  private async withClient<T>(operation: (client: ImapFlow) => Promise<T>): Promise<T> {
    const imap = this.config.get<{
      host: string;
      port: number;
      secure: boolean;
      user: string;
      password: string;
      mailbox: string;
    }>('fnolIntake.imap')!;

    const client = new ImapFlow({
      host: imap.host,
      port: imap.port,
      secure: imap.secure,
      auth: { user: imap.user, pass: imap.password },
      // The library logs full message metadata at info level, which for this
      // mailbox means claimant names and subjects in the service log.
      logger: false,
    });

    await client.connect();
    const lock = await client.getMailboxLock(imap.mailbox);
    try {
      return await operation(client);
    } finally {
      lock.release();
      await client.logout().catch(() => undefined);
    }
  }

  private async toInboundMessage(source: Buffer): Promise<InboundMessage> {
    const parsed = await simpleParser(source);

    const from = parsed.from?.value?.[0]?.address ?? '';
    const to = Array.isArray(parsed.to)
      ? parsed.to[0]?.value?.[0]?.address
      : parsed.to?.value?.[0]?.address;

    const attachments: InboundAttachment[] = (parsed.attachments ?? [])
      .filter(attachment => {
        if (attachment.size > MAX_ATTACHMENT_BYTES) {
          this.logger.warn(
            `Skipping oversized attachment ${attachment.filename} (${attachment.size} bytes)`
          );
          return false;
        }
        return true;
      })
      .map(attachment => ({
        filename: attachment.filename ?? 'attachment',
        mimeType: attachment.contentType ?? 'application/octet-stream',
        content: attachment.content,
        sizeBytes: attachment.size,
      }));

    return {
      messageId: parsed.messageId ?? this.synthesiseMessageId(source),
      from,
      to,
      subject: parsed.subject,
      receivedAt: parsed.date ?? new Date(),
      text: parsed.text ?? this.htmlToText(parsed.html || ''),
      attachments,
    };
  }

  /**
   * Some senders omit Message-ID. A content hash is used rather than a random
   * id so the same email always produces the same key — a random one would
   * make every re-poll look like a new claim.
   */
  private synthesiseMessageId(source: Buffer): string {
    const digest = createHash('sha256').update(source).digest('hex');
    return `<sha256-${digest}@tci.local>`;
  }

  private htmlToText(html: string | false): string {
    if (!html) return '';
    return html
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/[ \t]+/g, ' ')
      .trim();
  }
}
