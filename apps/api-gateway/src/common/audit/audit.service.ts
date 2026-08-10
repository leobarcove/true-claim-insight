import { Injectable, Logger } from '@nestjs/common';
import { AuditWriter, type AuditRecord } from '@tci/prisma-client';
import { PrismaService } from '../../config/prisma.service';

export type AuditEntry = AuditRecord;

/**
 * NestJS provider around the shared AuditWriter.
 *
 * The write itself lives in @tci/prisma-client so every service produces rows of
 * the same shape — see the note there on why a divergent `entityType` is a
 * silent failure. What this adds is the loud local logging of a failed write: an
 * audit gap must be visible in the service's own logs, not swallowed.
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

  record(entry: AuditEntry): Promise<void> {
    return this.writer.record(entry);
  }
}
