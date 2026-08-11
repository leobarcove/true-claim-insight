/**
 * Abstraction over how a one-time code reaches a claimant.
 *
 * Same plugin pattern as NotificationTransport, InboundMailSource and
 * LlmProvider: bind an implementation to the OTP_TRANSPORT token in
 * AuthModule, and the service depends only on this interface.
 *
 * It exists because the code had no transport at all — `sendOtp` printed the
 * code to the server console behind a `TODO: Send SMS via provider`. That is
 * fine for a developer reading logs and impossible for a claimant, so the
 * in-country web channel was unreachable by any real person while the offshore
 * Telegram one worked. A missing provider is the honest name for that, and a
 * port is how the rest of this codebase names missing providers.
 *
 * The distinction this preserves: **verification is never skipped.** A code is
 * still generated with a CSPRNG, still stored, still expires, still rate
 * limits, still counts attempts. Only delivery is stubbed. The dev bypass
 * removed on 10 August was a different thing — a hardcoded code that verified
 * any phone number in any environment, including staging — and nothing here
 * brings it back.
 */

export interface OtpDeliveryResult {
  /** Whether the code actually reached the claimant. */
  delivered: boolean;
}

export interface OtpTransport {
  /** Stable identifier, recorded so the trail shows how a code was sent. */
  readonly name: string;

  /**
   * Whether the transport can actually send. Returns false rather than
   * throwing, matching NotificationTransport: a deployment with no SMS
   * provider should be inert and obvious, not a source of errors that look
   * like an outage.
   */
  isConfigured(): boolean;

  /** Deliver the code. Implementations must never log or return it. */
  send(phoneNumber: string, code: string): Promise<OtpDeliveryResult>;
}

export const OTP_TRANSPORT = Symbol('OTP_TRANSPORT');
