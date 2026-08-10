/**
 * Abstraction over the FNOL intake mailbox. Same plugin pattern as
 * LlmProvider, RainfallDataSource and SignatureProvider: bind a concrete
 * implementation to the INBOUND_MAIL_SOURCE token in IngestionModule, and
 * every consumer depends on the interface.
 *
 * Why an interface rather than "just use IMAP": the transport is the part
 * most likely to change and the part least connected to the domain. A pilot
 * runs against whatever mailbox the firm already has; production may move to
 * SES inbound receiving, a provider webhook, or a shared mailbox on the
 * insurer's side. Parsing, matching and Case creation must not know which.
 *
 * Current implementations:
 *  - ImapMailSource: polls any IMAP mailbox. Works with the mailbox the firm
 *    already owns, which is what a pilot needs.
 *
 * Data-residency note: whichever transport is chosen, the mailbox host
 * processes claimant personal data. That is a cross-border question if the
 * mailbox is on an offshore provider — see MASTER_PLAN §3.4 and the transfer
 * register. Choosing the mailbox is an operational decision, not a code one,
 * but it is a PDPA-relevant one.
 */

/** One attachment on an inbound message, already read into memory. */
export interface InboundAttachment {
  filename: string;
  mimeType: string;
  content: Buffer;
  sizeBytes: number;
}

/**
 * A received email, normalised away from any transport's own shape.
 *
 * `messageId` is the RFC 5322 Message-ID and is the idempotency key for the
 * whole pipeline. A source that cannot supply one must synthesise a stable
 * value (see ImapMailSource) — never a random one, which would defeat the
 * unique constraint that stops duplicate Cases.
 */
export interface InboundMessage {
  messageId: string;
  from: string;
  to?: string;
  subject?: string;
  receivedAt: Date;
  /** Plain-text body. HTML-only mail is converted by the source. */
  text: string;
  attachments: InboundAttachment[];
}

export interface InboundMailSource {
  /** Stable identifier, recorded so the trail shows how mail arrived. */
  readonly name: string;

  /**
   * Whether the source is configured well enough to run. Returns false rather
   * than throwing so the scheduler can skip cleanly on a deployment where
   * intake is deliberately switched off.
   */
  isConfigured(): boolean;

  /**
   * Fetch messages not yet seen, oldest first, up to `limit`.
   *
   * Implementations must NOT delete or permanently mark messages here —
   * `acknowledge` is a separate call made only after the message is safely
   * recorded. Fetching and acknowledging in one step loses mail whenever the
   * process dies mid-batch, and lost FNOL intake is invisible: nobody knows
   * to look for a claim that was never created.
   */
  fetch(limit: number): Promise<InboundMessage[]>;

  /**
   * Mark a message as handled on the server, after it has been durably
   * recorded locally. Safe to call more than once for the same id.
   */
  acknowledge(messageId: string): Promise<void>;

  /**
   * Re-read a single message by its id, for operator retry.
   *
   * This is why acknowledgement flags rather than deletes: the raw email is
   * never stored locally — it carries NRIC and bank details in the clear, and
   * this platform encrypts both at rest — so the mailbox remains the only
   * copy. Returns null if the message is no longer on the server.
   */
  fetchByMessageId(messageId: string): Promise<InboundMessage | null>;
}

export const INBOUND_MAIL_SOURCE = Symbol('INBOUND_MAIL_SOURCE');
