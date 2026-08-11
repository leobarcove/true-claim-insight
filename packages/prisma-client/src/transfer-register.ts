/**
 * Cross-border transfer register — PDPA s.129 and the CBPDT Guidelines (2025).
 *
 * The Guidelines require a record of each transfer of personal data outside
 * Malaysia: recipient, country, data type, purpose and the basis relied on.
 * Shared here for the same reason as AuditWriter: two services describing the
 * same recipient differently ("Hume" vs "HUME_AI") would give a regulator a
 * partial answer with no sign it is partial.
 */

/** The offshore recipients the platform actually uses. */
export const OFFSHORE_PROVIDERS = {
  HUME_AI: {
    provider: 'HUME_AI',
    country: 'United States',
    what: 'Voice and facial expression analysis of assessment recordings',
  },
  GOOGLE_GEMINI: {
    provider: 'GOOGLE_GEMINI',
    country: 'United States',
    what: 'Document image text extraction (MyKad, police reports, receipts)',
  },
  DAILY_CO: {
    provider: 'DAILY_CO',
    country: 'United States',
    what: 'Video call hosting and recording of assessment sessions',
  },
  SUPABASE: {
    provider: 'SUPABASE',
    country: 'United States',
    what: 'Claim document and recording storage (when the cloud path is active)',
  },
  TELEGRAM: {
    provider: 'TELEGRAM',
    country: 'United Arab Emirates (distributed infrastructure)',
    what: 'Claimant conversation content during Telegram intake — every message both ways, retained in Telegram’s own message history beyond our retention sweep',
  },
  WHATSAPP: {
    provider: 'WHATSAPP',
    country: 'United States (Meta Platforms)',
    what: 'Claimant phone number and a six-digit login code, sent as a WhatsApp authentication template. No claim content — materially narrower than the Telegram entry above, which carries the whole conversation',
  },
  N8N_OCR_WEBHOOK: {
    provider: 'N8N_OCR_WEBHOOK',
    country: 'Unverified — third-party n8n workflow, hosting region not established',
    what: 'Claim document images (MyKad, receipts, damage photos) posted for OCR extraction when OCR_WEBHOOK_URL is configured',
  },
} as const;

export type OffshoreProviderKey = keyof typeof OFFSHORE_PROVIDERS;

export interface TransferEntry {
  provider: OffshoreProviderKey;
  /** What was sent, in words a regulator can read. Defaults to the registry text. */
  dataDescription?: string;
  purpose: string;
  /** s.129 basis, e.g. 'CONSENT s.129(3)(a)'. Omit when none is established — the
   * honest record says so rather than inventing one. */
  lawfulBasis?: string | null;
  claimId?: string | null;
  claimantId?: string | null;
  metadata?: unknown;
}

export interface TransferRecordCapable {
  transferRecord: { create(args: { data: Record<string, unknown> }): Promise<unknown> };
}

/**
 * Writes transfer records. Fail-soft like AuditWriter: a register outage must
 * not take claim processing down with it, but the gap is surfaced loudly via
 * `onFailure` because an unrecorded transfer is a compliance breach in itself.
 */
export class TransferRegister {
  constructor(
    private readonly prisma: TransferRecordCapable,
    private readonly sourceService: string,
    private readonly onFailure?: (entry: TransferEntry, error: unknown) => void
  ) {}

  async record(entry: TransferEntry): Promise<void> {
    const registry = OFFSHORE_PROVIDERS[entry.provider];
    try {
      await this.prisma.transferRecord.create({
        data: {
          provider: registry.provider,
          country: registry.country,
          dataDescription: entry.dataDescription ?? registry.what,
          purpose: entry.purpose,
          lawfulBasis: entry.lawfulBasis ?? null,
          sourceService: this.sourceService,
          claimId: entry.claimId ?? undefined,
          claimantId: entry.claimantId ?? undefined,
          metadata: (entry.metadata as never) ?? undefined,
        },
      });
    } catch (error) {
      this.onFailure?.(entry, error);
    }
  }
}
