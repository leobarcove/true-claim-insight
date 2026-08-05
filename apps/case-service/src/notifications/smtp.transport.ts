import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, Transporter } from 'nodemailer';

import {
  NotificationTransport,
  OutboundMessage,
  SendResult,
} from './notification-transport.interface';

/**
 * SMTP sender — Mailhog locally, Amazon SES `ap-southeast-5` in staging and
 * production. One implementation for both, because the difference is entirely
 * configuration.
 *
 * The connection is created lazily and reused. Building a transporter per
 * message would open a TCP connection per notification, which SES rate-limits
 * and Mailhog simply accumulates.
 */
@Injectable()
export class SmtpTransport implements NotificationTransport, OnModuleDestroy {
  readonly name = 'smtp';

  private readonly logger = new Logger(SmtpTransport.name);
  private transporter?: Transporter;

  constructor(private readonly config: ConfigService) {}

  isConfigured(): boolean {
    if (!this.config.get<boolean>('notifications.enabled')) return false;
    return Boolean(this.config.get<string>('notifications.smtp.host'));
  }

  async send(message: OutboundMessage): Promise<SendResult> {
    const from = this.config.get<string>('notifications.from')!;
    const info = await this.client().sendMail({
      from,
      to: message.to,
      subject: message.subject,
      text: message.text,
      ...(message.html ? { html: message.html } : {}),
    });

    return { messageId: info.messageId };
  }

  private client(): Transporter {
    if (this.transporter) return this.transporter;

    const smtp = this.config.get<{
      host: string;
      port: number;
      secure: boolean;
      user?: string;
      pass?: string;
    }>('notifications.smtp')!;

    this.transporter = createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      // Mailhog accepts unauthenticated mail; SES requires credentials. Passing
      // an empty auth object to Mailhog makes nodemailer attempt AUTH and fail,
      // so the key is omitted entirely when no user is configured.
      ...(smtp.user ? { auth: { user: smtp.user, pass: smtp.pass } } : {}),
    });

    this.logger.log(`SMTP transport ready — ${smtp.host}:${smtp.port}`);
    return this.transporter;
  }

  onModuleDestroy() {
    this.transporter?.close();
  }
}
