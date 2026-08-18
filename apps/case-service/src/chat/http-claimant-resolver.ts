import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';

import type { ClaimantResolver, ResolvedClaimant } from './claimant-resolver.interface';

/**
 * ClaimantResolver backed by api-gateway.
 *
 * Unlike the OTP endpoints this replaced, the route it calls is **not public**:
 * find-or-create on a bare phone number is a claimant-creation and
 * enumeration oracle, and the only thing that makes it safe is the caller
 * having proof the number belongs to the sender. So it is guarded by the
 * internal key, and this client fails closed without one rather than calling
 * and being refused — a misconfigured service should say what is wrong, not
 * report an authentication failure it caused itself.
 */
@Injectable()
export class HttpClaimantResolver implements ClaimantResolver {
  private readonly logger = new Logger(HttpClaimantResolver.name);
  private readonly gatewayUrl: string;
  private readonly internalKey: string;

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService
  ) {
    this.gatewayUrl = this.config.get('API_GATEWAY_URL') || 'http://localhost:3000';
    this.internalKey = this.config.get('INTERNAL_API_KEY') || '';
  }

  async resolveByVerifiedPhone(phoneNumber: string, channel: string): Promise<ResolvedClaimant> {
    if (!this.internalKey) {
      throw new Error(
        'INTERNAL_API_KEY is not configured — cannot resolve a claimant for a channel binding.'
      );
    }

    const { data } = await firstValueFrom(
      this.http.post(
        `${this.gatewayUrl}/api/v1/auth/channel/resolve-claimant`,
        { phoneNumber, channel },
        { headers: { 'x-internal-key': this.internalKey } }
      )
    );

    const claimant = data?.data ?? data;
    if (!claimant?.claimantId) {
      // A 2xx with no claimant means the contract changed under us. Refusing
      // is the safe reading: the alternative is a conversation bound to
      // nobody, which every later access check would then wave through.
      this.logger.error('resolve-claimant returned success without a claimant; refusing to bind.');
      throw new Error('Identity service returned no claimant');
    }

    return { claimantId: claimant.claimantId, tenantId: claimant.tenantId ?? undefined };
  }

  async resolveByUnverifiedContact(input: {
    phoneNumber: string;
    fullName?: string;
    source: string;
  }): Promise<ResolvedClaimant> {
    if (!this.internalKey) {
      throw new Error(
        'INTERNAL_API_KEY is not configured — cannot resolve a claimant for intake.'
      );
    }

    const { data } = await firstValueFrom(
      this.http.post(
        `${this.gatewayUrl}/api/v1/auth/intake/resolve-claimant`,
        input,
        { headers: { 'x-internal-key': this.internalKey } }
      )
    );

    const claimant = data?.data ?? data;
    if (!claimant?.claimantId) {
      this.logger.error(
        'intake/resolve-claimant returned success without a claimant; refusing to open a case.'
      );
      throw new Error('Identity service returned no claimant');
    }

    return { claimantId: claimant.claimantId, tenantId: claimant.tenantId ?? undefined };
  }
}
