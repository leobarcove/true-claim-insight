import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  ConsentChannel,
  ConsentPurpose,
  ConsentStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../config/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { DRAFT_CONSENT_NOTICES, REQUIRED_LOCALES } from './consent-notices.draft';

/**
 * PDPA consent: notice, capture, checking and withdrawal.
 *
 * Replaces `isPdpaCompliant`, a boolean the frontends set to true and nothing
 * ever read — the archetypal false-comfort finding (§3.6 item 4). Consent is now
 * a record of *which wording* a named person agreed to, *when*, and whether it
 * still stands.
 *
 * Three gates, all server-side:
 *  1. A notice version cannot be approved unless it exists in both English and
 *     Bahasa Malaysia (PDPA s.7).
 *  2. Consent cannot be recorded against an unapproved notice.
 *  3. Processing that requires consent checks for a live grant, not a flag.
 */
@Injectable()
export class ConsentService {
  private readonly logger = new Logger(ConsentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService
  ) {}

  /**
   * Install the draft notices if absent. Idempotent, and deliberately leaves
   * them unapproved — seeding wording is not approving it.
   */
  async seedDraftNotices(): Promise<number> {
    let created = 0;
    for (const draft of DRAFT_CONSENT_NOTICES) {
      const existing = await this.prisma.consentNotice.findUnique({
        where: {
          purpose_version_locale: {
            purpose: draft.purpose,
            version: draft.version,
            locale: draft.locale,
          },
        },
      });
      if (existing) continue;

      await this.prisma.consentNotice.create({ data: draft });
      created += 1;
    }
    if (created) this.logger.log(`Seeded ${created} draft consent notices (unapproved)`);
    return created;
  }

  /** Every locale of one notice version. */
  async noticeVersion(purpose: ConsentPurpose, version: number) {
    return this.prisma.consentNotice.findMany({ where: { purpose, version } });
  }

  /**
   * Approve a notice version for use.
   *
   * Refuses unless every required locale is present: a Malay speaker shown only
   * an English notice has not been given the notice PDPA s.7 requires, and
   * approving a half-translated version is how that happens quietly.
   */
  async approveNotice(purpose: ConsentPurpose, version: number, approverUserId: string) {
    const notices = await this.noticeVersion(purpose, version);
    if (!notices.length) {
      throw new NotFoundException(`No consent notice found for ${purpose} version ${version}`);
    }

    const locales = new Set(notices.map(notice => notice.locale));
    const missing = REQUIRED_LOCALES.filter(locale => !locales.has(locale));
    if (missing.length) {
      throw new BadRequestException(
        `Cannot approve ${purpose} v${version}: missing ${missing.join(', ')}. ` +
          'PDPA s.7 requires the notice in both English and Bahasa Malaysia.'
      );
    }

    const alreadyApproved = notices.filter(notice => notice.approvedAt);
    if (alreadyApproved.length === notices.length) {
      throw new BadRequestException(
        `${purpose} v${version} is already approved. Approved wording is immutable — ` +
          'publish a new version instead, so past consents remain provable.'
      );
    }

    const approvedAt = new Date();
    await this.prisma.consentNotice.updateMany({
      where: { purpose, version },
      data: { approvedByUserId: approverUserId, approvedAt },
    });

    await this.audit.record({
      entityType: 'CONSENT_NOTICE',
      entityId: `${purpose}:v${version}`,
      action: 'CONSENT_NOTICE_APPROVED',
      actorId: approverUserId,
      userId: approverUserId,
      newValues: { purpose, version, locales: [...locales], approvedAt },
    });

    this.logger.log(`Consent notice ${purpose} v${version} approved by ${approverUserId}`);
    return this.noticeVersion(purpose, version);
  }

  /** The current approved notice for a purpose in one locale, or null. */
  async currentNotice(purpose: ConsentPurpose, locale = 'en') {
    return this.prisma.consentNotice.findFirst({
      where: { purpose, locale, approvedAt: { not: null } },
      orderBy: { version: 'desc' },
    });
  }

  /**
   * Record consent.
   *
   * Refuses against an unapproved notice, so unreviewed wording cannot produce
   * a consent that looks valid in the record but would not survive scrutiny.
   */
  async grant(params: {
    claimantId: string;
    purpose: ConsentPurpose;
    locale?: string;
    capturedVia?: ConsentChannel;
    capturedByUserId?: string | null;
    ipAddress?: string | null;
    /**
     * How an agent-attested verbal consent was obtained.
     *
     * Only meaningful with `capturedVia: VERBAL_AGENT_ATTESTED`. Stored in the
     * row's `metadata` rather than in new columns because the `Consent` model
     * already carries everything that identifies the act — who captured it
     * (`capturedByUserId`), when (`grantedAt`), and against exactly which
     * wording (`noticeId`). What is missing is only the shape of the
     * conversation, which is the firm's operational record, not the platform's
     * evidence.
     *
     * `interactionReference` is a call or appointment reference we can trace
     * back — never the recording itself.
     */
    attestation?: {
      interactionChannel: 'PHONE' | 'IN_PERSON' | 'VIDEO' | 'OTHER';
      interactionReference?: string;
      attestedByTenantId?: string;
    };
  }) {
    const { claimantId, purpose, locale = 'en' } = params;

    const notice = await this.currentNotice(purpose, locale);
    if (!notice) {
      throw new BadRequestException(
        `No approved ${locale} consent notice exists for ${purpose}. ` +
          'Consent cannot be recorded against unapproved wording — have the notice ' +
          'reviewed and approved first.'
      );
    }

    // Re-granting after withdrawal is legitimate; the partial unique index keeps
    // only one live grant, so supersede any existing one rather than duplicating.
    const existing = await this.prisma.consent.findFirst({
      where: { claimantId, purpose, status: ConsentStatus.GRANTED },
    });
    if (existing) return existing;

    const capturedVia = params.capturedVia ?? ConsentChannel.WEB_FORM;

    // An attested verbal consent rests entirely on a staff member's word about
    // a conversation the platform cannot see. The one thing it must never do is
    // arrive anonymously: without a capturer there is nobody whose account the
    // attestation belongs to, and the record would assert that consent was
    // obtained while naming nobody who says so.
    if (capturedVia === ConsentChannel.VERBAL_AGENT_ATTESTED && !params.capturedByUserId) {
      throw new BadRequestException(
        'An agent-attested verbal consent must name the staff member who attested it.'
      );
    }

    const consent = await this.prisma.consent.create({
      data: {
        claimantId,
        purpose,
        noticeId: notice.id,
        capturedVia,
        capturedByUserId: params.capturedByUserId ?? undefined,
        ipAddress: params.ipAddress ?? undefined,
        metadata: params.attestation ? { ...params.attestation } : undefined,
      },
    });

    await this.audit.record({
      entityType: 'CONSENT',
      entityId: consent.id,
      action: 'CONSENT_GRANTED',
      actorId: params.capturedByUserId ?? null,
      // The notice version is the point: it records what was actually agreed to.
      newValues: { purpose, noticeVersion: notice.version, locale: notice.locale },
      ipAddress: params.ipAddress ?? null,
    });

    return consent;
  }

  /**
   * Withdraw consent.
   *
   * The grant is not deleted. Evidencing *when* processing became unlawful needs
   * the original grant to survive next to the withdrawal.
   */
  async withdraw(claimantId: string, purpose: ConsentPurpose, reason?: string) {
    const consent = await this.prisma.consent.findFirst({
      where: { claimantId, purpose, status: ConsentStatus.GRANTED },
    });
    if (!consent) {
      throw new NotFoundException(`No active ${purpose} consent to withdraw`);
    }

    const withdrawn = await this.prisma.consent.update({
      where: { id: consent.id },
      data: {
        status: ConsentStatus.WITHDRAWN,
        withdrawnAt: new Date(),
        withdrawalReason: reason,
      },
    });

    await this.audit.record({
      entityType: 'CONSENT',
      entityId: consent.id,
      action: 'CONSENT_WITHDRAWN',
      oldValues: { status: ConsentStatus.GRANTED, grantedAt: consent.grantedAt },
      newValues: { status: ConsentStatus.WITHDRAWN, reason: reason ?? null },
    });

    this.logger.warn(
      `Consent withdrawn: claimant ${claimantId}, purpose ${purpose}. ` +
        'Processing relying on this basis must stop.'
    );
    return withdrawn;
  }

  /** Is there a live consent for this purpose right now? */
  async hasConsent(claimantId: string, purpose: ConsentPurpose): Promise<boolean> {
    const consent = await this.prisma.consent.findFirst({
      where: { claimantId, purpose, status: ConsentStatus.GRANTED },
    });
    return Boolean(consent);
  }

  /**
   * Refuse to proceed without consent.
   *
   * Called by processing that depends on a consent basis — biometric analysis
   * above all, since voice and facial data are sensitive personal data under the
   * amended PDPA and carry a higher bar than ordinary claim handling.
   */
  async assertConsent(claimantId: string, purpose: ConsentPurpose): Promise<void> {
    if (await this.hasConsent(claimantId, purpose)) return;

    throw new BadRequestException(
      `No active ${purpose} consent for this claimant. ` +
        'This processing cannot proceed until consent is recorded, or it must rely ' +
        'on a different lawful basis.'
    );
  }

  /** Every consent for a claimant, current and withdrawn — the PDPA record. */
  async forClaimant(claimantId: string) {
    return this.prisma.consent.findMany({
      where: { claimantId },
      include: { notice: { select: { purpose: true, version: true, locale: true, title: true } } },
      orderBy: { grantedAt: 'desc' },
    });
  }

  /** Notices awaiting approval, so nobody has to remember they are pending. */
  async pendingApproval() {
    const notices = await this.prisma.consentNotice.findMany({
      where: { approvedAt: null },
      orderBy: [{ purpose: 'asc' }, { version: 'asc' }],
    });

    const grouped = new Map<string, { purpose: ConsentPurpose; version: number; locales: string[] }>();
    for (const notice of notices) {
      const key = `${notice.purpose}:${notice.version}`;
      const entry = grouped.get(key) ?? {
        purpose: notice.purpose,
        version: notice.version,
        locales: [],
      };
      entry.locales.push(notice.locale);
      grouped.set(key, entry);
    }
    return [...grouped.values()];
  }
}
