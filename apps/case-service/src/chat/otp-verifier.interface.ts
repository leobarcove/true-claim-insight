/**
 * Abstraction over sending and checking a one-time code.
 *
 * This is a port rather than a service because case-service must not do the
 * work itself. `otpCode` and `claimant` belong to the `identity` context, which
 * only api-gateway may write (see packages/prisma-client/src/data-ownership.ts)
 * — so the concrete implementation calls the gateway's existing claimant OTP
 * endpoints over HTTP rather than touching those tables.
 *
 * That reuses the rate limiting, expiry and attempt counting already built
 * there. Reimplementing them here would mean two OTP policies drifting apart,
 * with the weaker one reachable from a channel nobody is watching.
 */

export interface OtpVerifyResult {
  valid: boolean;
  /** Set when valid: the Claimant the phone resolved to, created if new. */
  claimantId?: string;
  /** Set when valid, where the identity service knows it. */
  tenantId?: string;
}

export interface OtpVerifier {
  /** Send a code to this phone. Throws if the identity service refuses. */
  send(phoneNumber: string): Promise<void>;

  /**
   * Check a code and resolve the Claimant behind the phone.
   *
   * Returns `{ valid: false }` for a wrong or expired code rather than
   * throwing: a claimant mistyping a digit is an ordinary turn in the
   * conversation, not an exception.
   */
  verify(phoneNumber: string, code: string): Promise<OtpVerifyResult>;
}

export const OTP_VERIFIER = Symbol('OTP_VERIFIER');
