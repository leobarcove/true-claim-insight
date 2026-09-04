import { ConversationStatus, MessageDirection } from '@prisma/client';

import { ConversationsService } from './conversations.service';
import { ClaimantConversationService } from './claimant-conversation.service';

/**
 * Queue mechanics: who holds a conversation, what it is waiting on, and the
 * notes agents leave each other.
 *
 * The property that matters most here is negative. An internal note lives on
 * the same thread as the conversation — that is the point of it — and one
 * query away from the claimant's own screen.
 */
describe('conversation workflow', () => {
  const admin = { tenantId: 'tenant-1', userId: 'user-1', userRole: 'FIRM_ADMIN' } as never;
  const agent = { tenantId: 'tenant-1', userId: 'user-2', userRole: 'ADJUSTER' } as never;

  const makeService = (binding: Record<string, unknown>) => {
    const update = jest.fn(async ({ data }: any) => ({ ...binding, ...data }));
    const create = jest.fn(async ({ data }: any) => ({ id: 'note-1', ...data }));
    const findFirst: jest.Mock = jest.fn(async () => ({ userId: 'user-3' }));
    const prisma = {
      conversationBinding: {
        findUnique: jest.fn(async () => binding),
        update,
      },
      conversationMessage: { create, updateMany: jest.fn(async () => ({ count: 0 })) },
      userTenant: { findFirst, findMany: jest.fn(async () => []) },
    };
    const service = new ConversationsService(
      prisma as never,
      { sendAsOperator: jest.fn() } as never,
      { record: jest.fn() } as never
    );
    return { service, update, create, findFirst };
  };

  const unheld = {
    id: 'b1',
    tenantId: 'tenant-1',
    channel: 'TELEGRAM',
    mode: 'HANDOVER',
    status: ConversationStatus.OPEN,
    assignedUserId: null,
    firstRespondedAt: null,
  };

  describe('assignment', () => {
    it('hands a conversation to a colleague', async () => {
      const { service, update } = makeService(unheld);
      await service.assign('b1', 'user-3', agent);
      expect(update.mock.calls[0][0].data.assignedUserId).toBe('user-3');
    });

    it('puts it back in the unassigned queue when given no one', async () => {
      // Releasing work you cannot finish is the same act as passing it on, so
      // it is the same button rather than a second one.
      const { service, update } = makeService({ ...unheld, assignedUserId: 'user-2' });
      await service.assign('b1', null, agent);
      expect(update.mock.calls[0][0].data.assignedUserId).toBeNull();
    });

    it('refuses somebody who is not an active member of this firm', async () => {
      const { service, findFirst } = makeService(unheld);
      findFirst.mockResolvedValue(null as never);
      await expect(service.assign('b1', 'stranger', agent)).rejects.toThrow(/cannot take/i);
    });

    it('checks membership, not the deprecated column on the user', async () => {
      const { service, findFirst } = makeService(unheld);
      await service.assign('b1', 'user-3', agent);
      // A user can belong to several firms, and the role that decides this is
      // the one they hold in *this* tenant.
      const args = findFirst.mock.calls[0][0] as { where: Record<string, unknown> };
      expect(args.where.tenantId).toBe('tenant-1');
      expect(args.where.status).toBe('ACTIVE');
    });

    it('will not let an agent take work off another agent', async () => {
      const { service } = makeService({ ...unheld, assignedUserId: 'someone-else' });
      await expect(service.assign('b1', 'user-2', agent)).rejects.toThrow(/another agent/i);
    });

    it('lets an admin move work off an agent who has gone home', async () => {
      // Otherwise a thread is frozen by whoever left with it assigned.
      const { service, update } = makeService({ ...unheld, assignedUserId: 'someone-else' });
      await service.assign('b1', 'user-3', admin);
      expect(update).toHaveBeenCalled();
    });
  });

  describe('status', () => {
    it('marks a conversation as waiting on the claimant', async () => {
      const { service, update } = makeService({ ...unheld, assignedUserId: 'user-2' });
      await service.setStatus('b1', ConversationStatus.PENDING, null, agent);
      expect(update.mock.calls[0][0].data.status).toBe(ConversationStatus.PENDING);
    });

    it('refuses a snooze with no wake time', async () => {
      // The failure mode of every "later" pile.
      const { service } = makeService({ ...unheld, assignedUserId: 'user-2' });
      await expect(
        service.setStatus('b1', ConversationStatus.SNOOZED, null, agent)
      ).rejects.toThrow(/when it should come back/i);
    });

    it('refuses a wake time in the past', async () => {
      const { service } = makeService({ ...unheld, assignedUserId: 'user-2' });
      await expect(
        service.setStatus('b1', ConversationStatus.SNOOZED, new Date(Date.now() - 1000), agent)
      ).rejects.toThrow(/in the future/i);
    });

    it('clears the wake time when the status is no longer snoozed', async () => {
      const { service, update } = makeService({ ...unheld, assignedUserId: 'user-2' });
      await service.setStatus('b1', ConversationStatus.OPEN, null, agent);
      expect(update.mock.calls[0][0].data.snoozedUntil).toBeNull();
    });

    it('will not let RESOLVED be set as a label', async () => {
      // It means "the bot has it back", which is a transition with side
      // effects. Set as a status it would leave the conversation reading as
      // resolved while the bot was still stood down, so the claimant's next
      // message met silence.
      const { service } = makeService({ ...unheld, assignedUserId: 'user-2' });
      await expect(
        service.setStatus('b1', ConversationStatus.RESOLVED, null, agent)
      ).rejects.toThrow(/hand back to the bot/i);
    });
  });

  describe('internal notes', () => {
    it('is stored on the thread, marked internal', async () => {
      const { service, create } = makeService(unheld);
      await service.addNote('b1', 'Policy number looks wrong', agent);
      const [args] = create.mock.calls[0];
      expect(args.data.direction).toBe(MessageDirection.INTERNAL);
      expect(args.data.sentByUserId).toBe('user-2');
    });

    it('is never sent anywhere, so it is complete on write', async () => {
      const { service, create } = makeService(unheld);
      await service.addNote('b1', 'Chase ops', agent);
      // PENDING would leave it looking like an undelivered message for ever.
      expect(create.mock.calls[0][0].data.status).toBe('PROCESSED');
    });

    it('never reaches the claimant’s own transcript', async () => {
      // The guard that matters. The claimant endpoint allow-lists the two
      // directions it may show, rather than excluding INTERNAL by name — an
      // exclusion list starts leaking the day a third internal kind is added.
      const findMany = jest.fn().mockResolvedValue([]);
      const claimantService = new ClaimantConversationService(
        {
          conversationBinding: {
            upsert: jest.fn().mockResolvedValue({
              id: 'b1',
              platformUserId: 'c1',
              mode: 'BOT',
              activeCaseId: null,
              locale: null,
            }),
          },
          conversationMessage: { findMany, findFirst: jest.fn().mockResolvedValue(null) },
          case: { findUnique: jest.fn() },
        } as never,
        { synthesiseStep: jest.fn().mockResolvedValue(null) } as never,
        { forCase: jest.fn() } as never,
        // CasesService — only the public upload path uses it.
        {} as never,
      {} as never
    );

      await claimantService.transcript({ userId: 'c1', tenantId: 't1' } as never);

      const [args] = findMany.mock.calls[0];
      expect(args.where.direction).toEqual({
        in: [MessageDirection.INBOUND, MessageDirection.OUTBOUND],
      });
      expect(args.where.direction.in).not.toContain(MessageDirection.INTERNAL);
    });
  });
});
