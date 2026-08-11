import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TransferRegister } from '@tci/prisma-client';

import { PrismaService } from '../config/prisma.service';
import type { OtpDeliveryResult, OtpTransport } from './otp-transport.interface';

/**
 * Deliver the login code over WhatsApp, via Meta's Cloud API.
 *
 * Chosen over SMS for reach: WhatsApp is how Malaysia messages, and Meta's
 * authentication rate for a locally-registered account (RM 0.0564/message) is
 * competitive with local SMS while being read far more reliably.
 *
 * **Register the WhatsApp Business Account in Malaysia.** Sending to Malaysian
 * numbers from an account registered elsewhere is billed at the
 * authentication-international rate — roughly RM 0.1685, three times the
 * domestic one — for an identical message.
 *
 * **Copy-code, not one-tap.** One-tap and zero-tap autofill need a native
 * Android package name and signature hash, and the claimant app is a PWA. The
 * copy-code button is the only option available to us, and it is the
 * universally supported one; on iOS 26+ it additionally surfaces a keyboard
 * autofill suggestion without any work on our side.
 *
 * **This crosses a border.** The claimant's phone number and the code reach
 * Meta in the United States, and every send is recorded in the transfer
 * register with no lawful basis, exactly like the Telegram channel. It is a
 * materially narrower transfer — a number and six digits, no claim content —
 * but it does mean the in-country web channel has an offshore *login* step,
 * and that is a trade made deliberately rather than a property to claim
 * (MASTER_PLAN §3.4).
 */
@Injectable()
export class WhatsAppOtpTransport implements OtpTransport {
  private readonly logger = new Logger(WhatsAppOtpTransport.name);
  private readonly transfers: TransferRegister;

  readonly name = 'whatsapp';

  constructor(
    private readonly config: ConfigService,
    prisma: PrismaService
  ) {
    this.transfers = new TransferRegister(prisma, 'api-gateway', (entry, error) =>
      // Fail-soft, matching the register's use elsewhere: losing the record of
      // a transfer must not stop a claimant logging in, but it must be loud —
      // an unrecorded transfer is the gap the register exists to close.
      this.logger.error(
        `Failed to record the ${entry.provider} transfer: ${
          error instanceof Error ? error.message : String(error)
        }`
      )
    );
  }

  /**
   * Every setting must be present. A half-configured transport that reported
   * itself ready would make the service believe codes were being delivered,
   * and in production the service refuses to return the code — so claimants
   * would meet a login that silently never works.
   */
  isConfigured(): boolean {
    return Boolean(
      this.config.get<string>('WHATSAPP_PHONE_NUMBER_ID') &&
        this.config.get<string>('WHATSAPP_ACCESS_TOKEN') &&
        this.config.get<string>('WHATSAPP_OTP_TEMPLATE')
    );
  }

  async send(phoneNumber: string, code: string): Promise<OtpDeliveryResult> {
    if (!this.isConfigured()) return { delivered: false };

    const phoneNumberId = this.config.get<string>('WHATSAPP_PHONE_NUMBER_ID');
    const token = this.config.get<string>('WHATSAPP_ACCESS_TOKEN');
    const template = this.config.get<string>('WHATSAPP_OTP_TEMPLATE');
    const locale = this.config.get<string>('WHATSAPP_OTP_TEMPLATE_LOCALE') ?? 'en';
    const version = this.config.get<string>('WHATSAPP_API_VERSION') ?? 'v21.0';

    // Recorded before the call, not after. A transfer that fails mid-flight
    // still sent the number, and a register that only logs successes
    // understates what left the country.
    await this.transfers.record({
      provider: 'WHATSAPP',
      purpose: 'Claimant login code delivery',
      // None established. Stated as null rather than omitted — the register is
      // useful precisely because it does not imply a basis it cannot show.
      lawfulBasis: null,
    });

    try {
      const response = await fetch(
        `https://graph.facebook.com/${version}/${phoneNumberId}/messages`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: phoneNumber,
            type: 'template',
            template: {
              name: template,
              language: { code: locale },
              components: [
                // An authentication template carries the code twice: once in
                // the body the claimant reads, and once as the button payload
                // so "Copy code" copies it. Sending only the body renders a
                // button that copies nothing.
                { type: 'body', parameters: [{ type: 'text', text: code }] },
                {
                  type: 'button',
                  sub_type: 'url',
                  index: '0',
                  parameters: [{ type: 'text', text: code }],
                },
              ],
            },
          }),
          // A login should fail fast rather than hang. The claimant is waiting
          // on this screen, and the console fallback cannot engage until this
          // call has finished one way or the other.
          signal: AbortSignal.timeout(10_000),
        }
      );

      if (!response.ok) {
        // Meta's error body names the cause — an unapproved template, a number
        // outside the allow-list in test mode, a spent token — and none of
        // that is guessable from a status code alone.
        const detail = await response.text().catch(() => '');
        this.logger.error(
          `WhatsApp rejected the code for ${phoneNumber}: ${response.status} ${detail.slice(0, 300)}`
        );
        return { delivered: false };
      }

      this.logger.log(`Login code sent to ${phoneNumber} over WhatsApp`);
      return { delivered: true };
    } catch (error) {
      this.logger.error(
        `WhatsApp send failed for ${phoneNumber}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      return { delivered: false };
    }
  }
}
