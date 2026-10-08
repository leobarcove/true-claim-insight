import { ConversationsService } from './conversations.service';

/**
 * The inbox list must fetch one preview row per conversation, not every
 * message of every conversation.
 *
 * It used `include: { messages: { take: 1 } }`, which Prisma cannot push into
 * SQL: on staging it read 4,287 rows to show 133 previews, on every refresh
 * the portal makes every 10 s per open tab. These tests pin the replacement —
 * a single LATERAL query, one indexed probe per binding — and that the list's
 * shape is unchanged for the portal.
 */
describe('ConversationsService.list — inbox preview', () => {
  const tenantContext = { tenantId: 'tenant-1', userId: 'staff-1', userRole: 'FIRM_ADMIN' } as never;

  const binding = (id: string) => ({
    id,
    channel: 'TELEGRAM',
    mode: 'BOT',
    status: 'OPEN',
    snoozedUntil: null,
    firstRespondedAt: null,
    assignedUserId: null,
    handoverAt: null,
    handoverReason: null,
    lastSeenAt: new Date('2026-10-05T00:00:00Z'),
    claimant: { id: `claimant-${id}`, fullName: 'A', phoneNumber: '+60' },
    activeCase: null,
  });

  const build = (bindings: unknown[], previews: unknown[]) => {
    const prisma = {
      conversationBinding: { findMany: jest.fn(async () => bindings) },
      conversationMessage: {
        findMany: jest.fn(),
        groupBy: jest.fn(async () => [{ bindingId: 'b1', _count: { _all: 2 } }]),
      },
      $queryRaw: jest.fn(async () => previews),
    };
    const service = new ConversationsService(prisma as never, {} as never, {} as never);
    return { service, prisma };
  };

  it('asks for no messages through the bindings query, and fetches previews in one statement', async () => {
    const { service, prisma } = build([binding('b1'), binding('b2')], []);

    await service.list(tenantContext);

    const [args] = (prisma.conversationBinding.findMany as jest.Mock).mock.calls[0];
    expect(args.include.messages).toBeUndefined();
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(prisma.conversationMessage.findMany).not.toHaveBeenCalled();

    // One LATERAL probe per binding, newest first, limited to one row.
    const sql = (prisma.$queryRaw as jest.Mock).mock.calls[0][0];
    const text = sql.strings.join('?');
    expect(text).toMatch(/CROSS JOIN LATERAL/);
    expect(text).toMatch(/ORDER BY "createdAt" DESC\s+LIMIT 1/);
    expect(sql.values[0]).toEqual(['b1', 'b2']);
  });

  it('keeps the portal’s shape: lastMessage per conversation, null when it has none', async () => {
    const message = {
      bindingId: 'b1',
      text: 'hello',
      direction: 'INBOUND',
      createdAt: new Date('2026-10-05T01:00:00Z'),
      sentByUserId: null,
    };
    const { service } = build([binding('b1'), binding('b2')], [message]);

    const rows = await service.list(tenantContext);

    expect(rows[0].lastMessage).toEqual({
      text: 'hello',
      direction: 'INBOUND',
      createdAt: message.createdAt,
      sentByUserId: null,
    });
    expect(rows[1].lastMessage).toBeNull();
    expect(rows[0].awaitingAgent).toBe(2);
  });

  it('does not query messages at all for an empty inbox', async () => {
    const { service, prisma } = build([], []);

    await expect(service.list(tenantContext)).resolves.toEqual([]);
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });
});
