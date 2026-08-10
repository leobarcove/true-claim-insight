/**
 * The only capability the writer needs. Declared structurally rather than as
 * `PrismaClient` because each service extends the client with its own options
 * (see TciPrismaOptions), and a concrete client type would not accept them.
 */
export interface AuditTrailCapable {
  auditTrail: { create(args: { data: Record<string, unknown> }): Promise<unknown> };
}

export interface AuditRecord {
  entityType: string;
  entityId: string;
  action: string;
  actorId?: string | null;
  actorType?: string | null;
  tenantId?: string | null;
  userId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  oldValues?: unknown;
  newValues?: unknown;
  metadata?: unknown;
}

/**
 * Writes audit rows, shared by every service that records one.
 *
 * One implementation because the row *shape* is what makes the trail queryable:
 * if one service writes `entityType: 'CLAIM'` and another `'Claim'`, an examiner
 * asking "everything that touched this claim" gets a partial answer and no
 * indication that it is partial. That failure is silent, which is the worst kind.
 *
 * Two behaviours are deliberate:
 *
 *  - **A failed write never propagates.** Blocking a claim operation because the
 *    trail is unavailable trades a recorded gap for an unrecorded outage. The
 *    failure is surfaced through `onFailure` so each service can log it loudly.
 *  - **Insert only.** `audit_trail` is append-only at the database level, so an
 *    attempted correction raises. A mistaken entry is corrected by adding a row.
 *
 * Free of NestJS decorators so services wrap it in their own provider — the same
 * arrangement as PrismaKeyStore, and for the same reason.
 */
export class AuditWriter {
  constructor(
    private readonly prisma: AuditTrailCapable,
    private readonly onFailure?: (record: AuditRecord, error: unknown) => void
  ) {}

  async record(entry: AuditRecord): Promise<void> {
    try {
      await this.prisma.auditTrail.create({
        data: {
          entityType: entry.entityType,
          entityId: entry.entityId,
          action: entry.action,
          actorId: entry.actorId ?? undefined,
          actorType: (entry.actorType as never) ?? undefined,
          tenantId: entry.tenantId ?? undefined,
          userId: entry.userId ?? undefined,
          ipAddress: entry.ipAddress ?? undefined,
          // Bound the user agent rather than storing whatever a client sends.
          userAgent: entry.userAgent?.slice(0, 400) ?? undefined,
          oldValues: (entry.oldValues as never) ?? undefined,
          newValues: (entry.newValues as never) ?? undefined,
          metadata: (entry.metadata as never) ?? undefined,
        },
      });
    } catch (error) {
      this.onFailure?.(entry, error);
    }
  }
}
