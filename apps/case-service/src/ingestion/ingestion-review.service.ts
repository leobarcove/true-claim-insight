import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InboundMessageStatus } from '@prisma/client';

import { PrismaService } from '../config/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { TenantContext } from '../common/guards/tenant.guard';
import { INBOUND_MAIL_SOURCE, InboundMailSource } from './inbound-mail.interface';
import { IngestionService } from './ingestion.service';

/** Newest-first page size for the operator queue. */
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

@Injectable()
export class IngestionReviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ingestion: IngestionService,
    private readonly audit: AuditService,
    @Inject(INBOUND_MAIL_SOURCE) private readonly mailSource: InboundMailSource
  ) {}

  async list(tenantContext: TenantContext, status?: InboundMessageStatus, limit?: number) {
    const take = Math.min(limit ?? DEFAULT_LIMIT, MAX_LIMIT);

    const messages = await this.prisma.inboundMessage.findMany({
      where: { tenantId: tenantContext.tenantId, ...(status ? { status } : {}) },
      orderBy: { receivedAt: 'desc' },
      take,
      select: {
        id: true,
        messageId: true,
        fromAddress: true,
        subject: true,
        receivedAt: true,
        status: true,
        caseId: true,
        error: true,
        attempts: true,
        parsed: true,
        processedAt: true,
        case: { select: { caseNumber: true, status: true } },
      },
    });

    return { messages, total: messages.length };
  }

  /**
   * Re-run intake for a message an operator has since made viable — a policy
   * keyed in, a tenant configured, a parser rule fixed.
   *
   * The email is re-read from the mailbox rather than from a stored copy: the
   * raw MIME is never persisted (it carries NRIC and bank details in the
   * clear), so the server holds the only copy.
   */
  async retry(id: string, tenantContext: TenantContext) {
    const record = await this.find(id, tenantContext);

    if (record.status === InboundMessageStatus.PROCESSED) {
      throw new BadRequestException(
        `Already ingested as case ${record.caseId}. Retrying would duplicate it.`
      );
    }

    const message = await this.mailSource.fetchByMessageId(record.messageId);
    if (!message) {
      throw new BadRequestException(
        'The original email is no longer in the mailbox, so it cannot be re-read. ' +
          'Create the case manually from the details recorded here.'
      );
    }

    const result = await this.ingestion.processRecord(record.id, message);

    await this.audit.record({
      entityId: record.id,
      entityType: 'INBOUND_MESSAGE',
      action: 'INBOUND_MESSAGE_RETRIED',
      metadata: { messageId: record.messageId, outcome: result },
      tenantId: tenantContext.tenantId,
      userId: tenantContext.userId,
      actorId: tenantContext.userId,
      actorType: tenantContext.userRole ?? 'SYSTEM',
    });

    return this.find(id, tenantContext);
  }

  /**
   * Dismiss a message that is not an FNOL.
   *
   * Recorded rather than deleted: "why is there no claim for the email the
   * client says they sent?" is answerable only if the decision to ignore it
   * left a trace, with a name against it.
   */
  async ignore(id: string, tenantContext: TenantContext) {
    const record = await this.find(id, tenantContext);

    if (record.status === InboundMessageStatus.PROCESSED) {
      throw new BadRequestException(
        `Already ingested as case ${record.caseId}; ignoring it now would misrepresent the record.`
      );
    }

    const updated = await this.prisma.inboundMessage.update({
      where: { id: record.id },
      data: { status: InboundMessageStatus.IGNORED, processedAt: new Date() },
    });

    await this.audit.record({
      entityId: record.id,
      entityType: 'INBOUND_MESSAGE',
      action: 'INBOUND_MESSAGE_IGNORED',
      oldValues: { status: record.status },
      newValues: { status: InboundMessageStatus.IGNORED },
      metadata: { messageId: record.messageId, from: record.fromAddress },
      tenantId: tenantContext.tenantId,
      userId: tenantContext.userId,
      actorId: tenantContext.userId,
      actorType: tenantContext.userRole ?? 'SYSTEM',
    });

    return updated;
  }

  private async find(id: string, tenantContext: TenantContext) {
    const record = await this.prisma.inboundMessage.findUnique({ where: { id } });

    // Tenant check is an existence check: a message belonging to another
    // tenant must be indistinguishable from one that does not exist.
    if (!record || record.tenantId !== tenantContext.tenantId) {
      throw new NotFoundException('Inbound message not found');
    }
    return record;
  }
}
