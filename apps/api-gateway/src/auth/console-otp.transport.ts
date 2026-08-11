import { Injectable, Logger } from '@nestjs/common';

import type { OtpDeliveryResult, OtpTransport } from './otp-transport.interface';

/**
 * The transport for a deployment with no SMS provider.
 *
 * It reports `delivered: false`, which is the truthful answer and the whole
 * point: the service decides what to do about an undelivered code, and that
 * decision differs by environment. Outside production the code is returned to
 * the caller so a claimant can log in at all; in production an undelivered
 * code is an outage and the request fails. Neither branch lives here — a
 * transport that knew about environments would be two things.
 *
 * `isConfigured()` is true. It *can* run; it simply cannot deliver. Returning
 * false would read as "switched off" and hide the difference between a
 * deployment that chose not to send codes and one that cannot.
 */
@Injectable()
export class ConsoleOtpTransport implements OtpTransport {
  private readonly logger = new Logger(ConsoleOtpTransport.name);

  readonly name = 'console';

  isConfigured(): boolean {
    return true;
  }

  /**
   * `code` is accepted and deliberately unused. Declaring it keeps this
   * substitutable for a real transport, and makes the omission visible: the
   * one thing this must not do with a code is write it anywhere.
   */
  async send(phoneNumber: string, code: string): Promise<OtpDeliveryResult> {
    void code;

    // The code is deliberately absent from this line. Server logs are shipped,
    // searched and retained, and a credential in one is a credential in all of
    // those — the previous implementation printed it, which is exactly the
    // habit this replaces.
    this.logger.warn(
      `No SMS provider configured; a code for ${phoneNumber} was generated but not sent. ` +
        'Outside production it is returned to the caller so login works.'
    );
    return { delivered: false };
  }
}
