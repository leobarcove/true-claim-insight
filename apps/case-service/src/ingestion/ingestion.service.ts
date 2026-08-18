import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CaseChannel, CaseInitiator, InboundMessageStatus, Prisma } from '@prisma/client';
import { CaseAnswers, getFlow, getStep, validateAnswer } from '@tci/shared-types';

import { PrismaService } from '../config/prisma.service';
import { CLAIMANT_RESOLVER, type ClaimantResolver } from '../chat/claimant-resolver.interface';
import { CasesService } from '../cases/cases.service';
import { TenantContext } from '../common/guards/tenant.guard';
import { TenantScope } from '../common/decorators/tenant.decorator';
import {
  INBOUND_MAIL_SOURCE,
  InboundAttachment,
  InboundMailSource,
  InboundMessage,
} from './inbound-mail.interface';
import { ParsedFnol, parseFnol, toStoredParse } from './fnol-parser';

export interface PollOutcome {
  fetched: number;
  created: number;
  needsReview: number;
  failed: number;
  duplicates: number;
}

/**
 * FNOL email intake (MASTER_PLAN §5 Phase 2).
 *
 * Deliberately builds a `CreateCaseDto` and calls `CasesService.create()`
 * rather than writing `case` rows directly. Everything that makes a Case
 * correct already lives there — policy auto-match, the CSP 24-hour and 30-day
 * deadline flags, claimant resolution, handling-firm routing, bank-detail
 * encryption and the audit row. A second creation path would drift from all of
 * it, and the divergence would show up as claims that are quietly missing a
 * deadline flag rather than as an error.
 */
@Injectable()
export class IngestionService {
  private readonly logger = new Logger(IngestionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly casesService: CasesService,
    private readonly config: ConfigService,
    @Inject(INBOUND_MAIL_SOURCE) private readonly mailSource: InboundMailSource,
    @Inject(CLAIMANT_RESOLVER) private readonly claimants: ClaimantResolver
  ) {}

  /** One poll cycle. Safe to run concurrently — see `recordArrival`. */
  async pollOnce(): Promise<PollOutcome> {
    const outcome: PollOutcome = {
      fetched: 0,
      created: 0,
      needsReview: 0,
      failed: 0,
      duplicates: 0,
    };

    if (!this.mailSource.isConfigured()) {
      this.logger.debug('FNOL intake not configured; skipping poll');
      return outcome;
    }

    const batchSize = this.config.get<number>('fnolIntake.batchSize') ?? 25;
    const messages = await this.mailSource.fetch(batchSize);
    outcome.fetched = messages.length;

    for (const message of messages) {
      try {
        const result = await this.ingest(message);
        outcome[result] += 1;
      } catch (error) {
        outcome.failed += 1;
        this.logger.error(
          `Ingestion failed for ${message.messageId}: ${(error as Error).message}`
        );
      }
    }

    return outcome;
  }

  private async ingest(
    message: InboundMessage
  ): Promise<'created' | 'needsReview' | 'failed' | 'duplicates'> {
    const record = await this.recordArrival(message);
    if (!record) {
      // Already ingested. Acknowledge again in case a previous run recorded
      // the message but died before flagging it on the server.
      await this.mailSource.acknowledge(message.messageId);
      return 'duplicates';
    }

    const result = await this.processRecord(record.id, message);
    await this.mailSource.acknowledge(message.messageId);
    return result;
  }

  /**
   * Parse a message and turn it into a Case against an already-recorded row.
   *
   * Shared by the poller and by operator retry, so a retried message follows
   * exactly the same rules as a freshly-arrived one — a retry path that
   * diverged would be the one nobody tests and everybody relies on.
   */
  async processRecord(
    recordId: string,
    message: InboundMessage
  ): Promise<'created' | 'needsReview' | 'failed'> {
    const parsed = parseFnol({
      subject: message.subject,
      text: message.text,
      fromAddress: message.from,
    });

    const blocker = this.blockingGap(parsed);
    if (blocker) {
      await this.markReview(recordId, parsed, blocker);
      return 'needsReview';
    }

    try {
      const created = await this.createCase(message, parsed);
      await this.attachDocuments(created.id, message.attachments, created.tenantId);

      await this.prisma.inboundMessage.update({
        where: { id: recordId },
        data: {
          status: InboundMessageStatus.PROCESSED,
          caseId: created.id,
          error: null,
          parsed: toStoredParse(parsed) as unknown as Prisma.InputJsonValue,
          processedAt: new Date(),
        },
      });

      this.logger.log(`FNOL ${message.messageId} → case ${created.caseNumber}`);
      return 'created';
    } catch (error) {
      // The message stays recorded with its failure reason: an FNOL that could
      // not become a Case must still be visible to an operator, because the
      // claimant believes they have notified us.
      await this.prisma.inboundMessage.update({
        where: { id: recordId },
        data: {
          status: InboundMessageStatus.FAILED,
          error: (error as Error).message.slice(0, 500),
          attempts: { increment: 1 },
          parsed: toStoredParse(parsed) as unknown as Prisma.InputJsonValue,
        },
      });
      return 'failed';
    }
  }

  /**
   * Claim the message by inserting its row, or discover that another worker
   * already has. The unique constraint on `messageId` is the arbiter rather
   * than a prior `findUnique`, which two concurrent pollers would both pass
   * before either inserted.
   */
  private async recordArrival(message: InboundMessage) {
    try {
      return await this.prisma.inboundMessage.create({
        data: {
          messageId: message.messageId,
          tenantId: this.config.get<string>('fnolIntake.tenantId') ?? null,
          fromAddress: message.from,
          toAddress: message.to,
          subject: message.subject,
          receivedAt: message.receivedAt,
          status: InboundMessageStatus.PENDING,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        return null;
      }
      throw error;
    }
  }

  /** What stops this email becoming a Case at all. */
  private blockingGap(parsed: ParsedFnol): string | null {
    if (!parsed.travelClaimType) {
      return 'Could not determine the claim type from the email';
    }
    if (parsed.missing.length > 0) {
      return `Missing mandatory detail: ${parsed.missing.join(', ')}`;
    }
    if (!this.config.get<string>('fnolIntake.tenantId')) {
      return 'FNOL_INTAKE_TENANT_ID is not configured; no handling firm to own the case';
    }
    return null;
  }

  private async markReview(recordId: string, parsed: ParsedFnol, reason: string) {
    await this.prisma.inboundMessage.update({
      where: { id: recordId },
      data: {
        status: InboundMessageStatus.NEEDS_REVIEW,
        error: reason,
        parsed: toStoredParse(parsed) as unknown as Prisma.InputJsonValue,
      },
    });
  }

  private async createCase(message: InboundMessage, parsed: ParsedFnol) {
    // The gateway owns identity, so a phone parsed out of an email is resolved
    // there rather than upserted here. Best-effort: a case with no claimant is
    // still a notification of loss an operator must see, and refusing to
    // record it because the identity service was unreachable would lose the
    // very thing FNOL ingestion exists to catch.
    let claimantId: string | null = null;
    if (parsed.claimantPhone) {
      try {
        const resolved = await this.claimants.resolveByUnverifiedContact({
          phoneNumber: parsed.claimantPhone,
          fullName: parsed.claimantName,
          source: 'FNOL_EMAIL',
        });
        claimantId = resolved.claimantId;
      } catch (error) {
        this.logger.error(
          `Could not resolve a claimant for ${message.messageId}; the case is opened without one: ` +
            `${error instanceof Error ? error.message : String(error)}`
        );
      }
    }

    return this.casesService.create(
      {
        travelClaimType: parsed.travelClaimType!,
        channel: CaseChannel.EMAIL,
        // SYSTEM, not STAFF: nobody keyed this in, and the distinction is what
        // lets an operator see which cases arrived unattended.
        initiatedBy: CaseInitiator.SYSTEM,
        claimantId: claimantId ?? undefined,
        answers: this.toAnswers(parsed),
        sourceMeta: {
          from: message.from,
          subject: message.subject ?? null,
          receivedAt: message.receivedAt.toISOString(),
          messageId: message.messageId,
          source: this.mailSource.name,
        },
      },
      this.systemContext()
    );
  }

  /**
   * Map extracted facts onto flow step ids.
   *
   * Every candidate is checked against the flow's own step definition and
   * validator before inclusion. `create()` rejects the whole Case if any
   * answer is invalid, and one unparseable date must not discard an otherwise
   * usable notification — so a value that fails validation is dropped here and
   * left for the operator instead.
   */
  private toAnswers(parsed: ParsedFnol): CaseAnswers {
    const flow = getFlow(parsed.travelClaimType!);
    const candidates: Record<string, string | undefined> = {
      'policy-number': parsed.policyNumber,
      'incident-date': parsed.incidentDate?.toISOString().slice(0, 10),
      destination: parsed.destination,
      'flight-number': parsed.flightNumber,
    };

    const answers: CaseAnswers = {};
    for (const [stepId, value] of Object.entries(candidates)) {
      if (value === undefined) continue;
      const step = getStep(flow, stepId);
      if (!step) continue;
      if (!validateAnswer(step, value).valid) {
        this.logger.debug(`Dropped ${stepId}="${value}" — fails flow validation`);
        continue;
      }
      answers[stepId] = value;
    }
    return answers;
  }

  private async attachDocuments(
    caseId: string,
    attachments: InboundAttachment[],
    tenantId: string
  ) {
    for (const attachment of attachments) {
      try {
        // Adapted to the multipart shape `uploadDocument` expects, so email
        // attachments land in the same storage, with the same validation hook,
        // as anything uploaded through the portal.
        await this.casesService.uploadDocument(
          caseId,
          {
            toBuffer: async () => attachment.content,
            filename: attachment.filename,
            mimetype: attachment.mimeType,
          },
          this.systemContext(tenantId)
        );
      } catch (error) {
        // A rejected attachment must not discard the notification itself.
        this.logger.warn(
          `Attachment "${attachment.filename}" not stored on case ${caseId}: ${
            (error as Error).message
          }`
        );
      }
    }
  }

  /**
   * Identity for unattended work.
   *
   * `SYSTEM` is a real actor type in the audit trail, not a stand-in for a
   * user: attributing an automated Case to a person would put a name against
   * a decision they did not make.
   */
  private systemContext(tenantId?: string): TenantContext {
    return {
      tenantId: tenantId ?? this.config.get<string>('fnolIntake.tenantId')!,
      userId: 'system:fnol-intake',
      userRole: 'SYSTEM',
      scope: TenantScope.STRICT,
      allowCrossTenant: false,
    };
  }
}
