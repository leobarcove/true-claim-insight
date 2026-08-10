/**
 * Abstraction over the outbound message transport.
 *
 * Same plugin pattern as InboundMailSource, LlmProvider and SignatureProvider:
 * bind a concrete implementation to the NOTIFICATION_TRANSPORT token in
 * NotificationsModule, and every caller depends on the interface.
 *
 * The transport is the part most likely to change and least connected to the
 * domain. Local development sends to Mailhog; staging and production send
 * through Amazon SES in `ap-southeast-5` (§8 — the region was chosen so the
 * notification path exercises the same residency story as everything else).
 * Both are SMTP, so one implementation covers them, and an SDK-based sender or
 * an SMS/WhatsApp channel can be added later without touching a caller.
 */

export interface OutboundMessage {
  to: string;
  subject: string;
  /** Plain text. Every template renders text; HTML is deliberately optional. */
  text: string;
  html?: string;
}

export interface SendResult {
  /** Provider message id, kept so a delivery can be traced in SES later. */
  messageId?: string;
}

export interface NotificationTransport {
  /** Stable identifier, recorded so the trail shows how a message left. */
  readonly name: string;

  /**
   * Whether the transport can actually send. Returns false rather than
   * throwing, so a deployment with notifications switched off records
   * SUPPRESSED against each message instead of accumulating failures that
   * look like an outage.
   */
  isConfigured(): boolean;

  /**
   * Send one message. Throws on failure — the queue's retry and the
   * NotificationLog row are what turn that into something recoverable and
   * visible, so swallowing it here would hide the only signal.
   */
  send(message: OutboundMessage): Promise<SendResult>;
}

export const NOTIFICATION_TRANSPORT = Symbol('NOTIFICATION_TRANSPORT');
