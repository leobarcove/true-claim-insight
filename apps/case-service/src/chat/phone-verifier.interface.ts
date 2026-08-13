/**
 * Proving a phone number belongs to whoever is typing.
 *
 * A port, for the same reason `ClaimantResolver` is one: the work happens in
 * api-gateway, because OTP codes and claimant identity are that service's data
 * to write, and case-service must not reach into them directly.
 *
 * Only channels that cannot attest a number use this. WhatsApp and Telegram
 * never do — the platform already proved it, which is why those conversations
 * open with a question about the claim rather than a code. Web chat has no such
 * attestation: a browser can claim any number, so the code is the only thing
 * standing between a stranger and filing a claim as somebody else.
 */
export interface PhoneVerifier {
  /**
   * Send a code to `phoneNumber`.
   *
   * Returns the code only where the platform already permits it (non-production
   * configurations return it so a developer can log in without a handset). The
   * caller must never put it in a message.
   */
  send(phoneNumber: string): Promise<{ expiresIn: number; code?: string }>;

  /**
   * Whether `code` matches an outstanding code for `phoneNumber`.
   *
   * False rather than throwing for a wrong or expired code: on a conversational
   * channel that is an ordinary turn to answer, not a fault to propagate.
   */
  verify(phoneNumber: string, code: string): Promise<boolean>;
}

export const PHONE_VERIFIER = Symbol('PHONE_VERIFIER');
