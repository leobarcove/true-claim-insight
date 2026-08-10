import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import type { OtpVerifier, OtpVerifyResult } from './otp-verifier.interface';

/**
 * OtpVerifier backed by api-gateway's claimant OTP endpoints.
 *
 * Calls `POST /auth/claimant/send-otp` and `/auth/claimant/verify-otp`, the
 * same pair the PWA login uses. Verify also resolves or creates the Claimant
 * behind the phone number, which is exactly what a channel binding needs; the
 * JWTs it returns alongside are for browser sessions and are ignored here.
 *
 * Both endpoints are public — they are the pre-authentication path by nature —
 * so no service credential is needed.
 */
@Injectable()
export class HttpOtpVerifier implements OtpVerifier {
  private readonly logger = new Logger(HttpOtpVerifier.name);
  private readonly gatewayUrl: string;

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService
  ) {
    this.gatewayUrl = this.config.get('API_GATEWAY_URL') || 'http://localhost:3000';
  }

  async send(phoneNumber: string): Promise<void> {
    await firstValueFrom(
      this.http.post(`${this.gatewayUrl}/api/v1/auth/claimant/send-otp`, { phoneNumber })
    );
  }

  async verify(phoneNumber: string, code: string): Promise<OtpVerifyResult> {
    try {
      const { data } = await firstValueFrom(
        this.http.post(`${this.gatewayUrl}/api/v1/auth/claimant/verify-otp`, {
          phoneNumber,
          code,
        })
      );
      const user = data?.user ?? data?.data?.user;
      if (!user?.id) {
        // A 2xx without a user means the contract changed under us. Treating
        // that as "not verified" is the safe reading — the alternative is
        // binding a conversation to nobody and serving claim details to it.
        this.logger.error('Verify-OTP returned success without a claimant; refusing to bind.');
        return { valid: false };
      }
      return { valid: true, claimantId: user.id, tenantId: user.tenantId };
    } catch (error: any) {
      const status = error?.response?.status;
      // 400 is the identity service's answer for a wrong or expired code —
      // an ordinary conversational turn, not a fault.
      if (status === 400) return { valid: false };
      throw error;
    }
  }
}
