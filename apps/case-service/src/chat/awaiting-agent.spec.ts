import { ConversationsService } from './conversations.service';

/**
 * The "waiting for a human" badge counts inbound messages left at
 * AWAITING_AGENT. Every route out of a handover has to clear them, and only
 * `reply` did — so an agent who read a conversation, decided no answer was
 * needed and handed it back left a count that never went down. The queue then
 * shows work nobody has to do, which is how people stop trusting the queue.
 *
 * These tests hold the three exits: reply, resolve, unbind.
 */
describe('clearing the waiting-for-a-human count', () => {
  const bindingId = 'binding-1';
  let updateMany: jest.Mock;
  let service: ConversationsService;

  const context = {
    tenantId: 'tenant-1',
    userId: 'user-1',
    userRole: 'FIRM_ADMIN',
  } as never;

  const cleared = () =>
    updateMany.mock.calls.filter(
      ([args]) =>
        args?.where?.bindingId === bindingId && args?.where?.status === 'AWAITING_AGENT'
    );

  beforeEach(() => {
    updateMany = jest.fn().mockResolvedValue({ count: 2 });

    const binding = {
      id: bindingId,
      tenantId: 'tenant-1',
      channel: 'TELEGRAM',
      platformUserId: '123',
      assignedUserId: null,
      mode: 'HANDOVER',
      claimantId: 'claimant-1',
    };

    const prisma = {
      conversationMessage: { updateMany, create: jest.fn().mockResolvedValue({}) },
      conversationBinding: {
        findUnique: jest.fn().mockResolvedValue(binding),
        update: jest.fn().mockResolvedValue({ ...binding, mode: 'BOT' }),
      },
    };

    service = new ConversationsService(
      prisma as never,
      { sendAsOperator: jest.fn().mockResolvedValue(undefined) } as never,
      { record: jest.fn().mockResolvedValue(undefined) } as never
    );
  });

  it('clears when an agent replies', async () => {
    await service.reply(bindingId, 'Sorted, thank you', context);
    expect(cleared()).toHaveLength(1);
  });

  it('clears when the conversation is handed back to the bot', async () => {
    // The case that was broken: reading a thread and handing it back is a
    // complete, correct action, and it left the badge on for ever.
    await service.resolve(bindingId, context);
    expect(cleared()).toHaveLength(1);
  });

  it('clears when the claimant is unbound', async () => {
    await service.unbind(bindingId, 'wrong number', context);
    expect(cleared()).toHaveLength(1);
  });

  it('marks them processed rather than deleting the messages', async () => {
    await service.resolve(bindingId, context);
    const [args] = cleared()[0];
    expect(args.data.status).toBe('PROCESSED');
    // The transcript is evidence; only the waiting state changes.
    expect(args.data.processedAt).toBeInstanceOf(Date);
  });
});
