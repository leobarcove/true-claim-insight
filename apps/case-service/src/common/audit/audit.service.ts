import { Injectable, Logger } from '@nestjs/common';
import { AuditWriter, type AuditRecord } from '@tci/prisma-client';
import { PrismaService } from '../../config/prisma.service';

/**
 * NestJS provider around the shared AuditWriter — see @tci/prisma-client for why
 * the write itself is shared rather than reimplemented per service.
 *
 * Every domain audit write in this service now flows through here. The one
 * deliberate exception is ClaimExportService's export seal, which writes
 * directly and fails CLOSED — the sealed row is part of that deliverable.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);
  private readonly writer: AuditWriter;

  constructor(prisma: PrismaService) {
    this.writer = new AuditWriter(prisma, (record, error) =>
      this.logger.error(
        `AUDIT WRITE FAILED for ${record.action} on ${record.entityType}:${record.entityId} — ` +
          'this event is now unrecorded',
        error instanceof Error ? error.stack : String(error)
      )
    );
  }

  record(entry: AuditRecord): Promise<void> {
    return this.writer.record(entry);
  }
}
