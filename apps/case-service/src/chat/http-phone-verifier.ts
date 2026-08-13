import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';

import type { PhoneVerifier } from './phone-verifier.interface';

/**
 * PhoneVerifier backed by api-gateway's OTP service.
 *
 * Mirrors HttpClaimantResolver exactly — same seam, same internal key, same
 * fail-closed behaviour when it is missing. A misconfigured service should say
 * what is wrong rather than report an authentication failure it caused itself.
 *
 * The code is delivered over the WhatsApp business account the intake channel
 * already uses. That is deliberate: one sender identity for both the claim
 * conversation and the login code, no second vendor to contract, and the
 * cost per message is already understood (MASTER_PLAN §2.5).
 */
@Injectable()
export class HttpPhoneVerifier implements PhoneVerifier {
  private readonly logger = new Logger(HttpPhoneVerifier.name);
  private readonly gatewayUrl: string;
  private readonly internalKey: string;

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService
  ) {
    this.gatewayUrl = this.config.get('API_GATEWAY_URL') || 'http://localhost:3000';
    this.internalKey = this.config.get('INTERNAL_API_KEY') || '';
  }

  private get headers() {
    if (!this.internalKey) {
      throw new Error(
        'INTERNAL_API_KEY is not configured — cannot verify a phone number for a channel binding.'
      );
    }
    return { 'x-internal-key': this.internalKey };
  }

  async send(phoneNumber: string): Promise<{ expiresIn: number; code?: string }> {
    const { data } = await firstValueFrom(
      this.http.post(
        `${this.gatewayUrl}/api/v1/auth/channel/send-code`,
        { phoneNumber },
        { headers: this.headers }
      )
    );
    const result = data?.data ?? data;
    return { expiresIn: result?.expiresIn ?? 0, code: result?.code };
  }

  async verify(phoneNumber: string, code: string): Promise<boolean> {
    try {
      const { data } = await firstValueFrom(
        this.http.post(
          `${this.gatewayUrl}/api/v1/auth/channel/verify-code`,
          { phoneNumber, code },
          { headers: this.headers }
        )
      );
      const result = data?.data ?? data;
      return result?.verified === true;
    } catch (error) {
      // Never true on failure. A transport error must read as "not verified",
      // never as "verified" — this is the only check standing between a
      // stranger and somebody else's claim.
      this.logger.error(
        `Code verification failed: ${error instanceof Error ? error.message : String(error)}`
      );
      return false;
    }
  }
}
