import { BadRequestException } from '@nestjs/common';
import { CaseChannel, ConversationMode } from '@prisma/client';

import { ConversationsService } from './conversations.service';

/**
 * The web form is submit-only, and that has to be enforced, not just described.
 *
 * Every other channel is a thread: an operator takes it over, the bot stands
 * down, and the claimant reads the reply where they were already talking. The
 * form has no such place. Taking one over would stop the bot mid-section and
 * leave the claimant on a page that had simply stopped responding, while the
 * operator typed into a window nobody is watching.
 *
 * So there is no handover screen in the form design — and these are the two
 * guards that make that absence safe rather than an oversight.
 */
describe('a web-form conversation cannot be taken over', () => {
  const buildService = (channel: CaseChannel) => {
    const binding = {
      id: 'binding-1',
      channel,
      platformUserId: 'wf:abc',
      mode: ConversationMode.BOT,
      assignedUserId: null,
      tenantId: 'tenant-1',
    };
    const prisma = {
      conversationBinding: {
        findFirst: jest.fn().mockResolvedValue(binding),
        findUnique: jest.fn().mockResolvedValue(binding),
        update: jest.fn().mockResolvedValue({ ...binding, mode: ConversationMode.HANDOVER }),
      },
    };
    const audit = { record: jest.fn().mockResolvedValue(undefined) };
    const service = new ConversationsService(prisma as never, {} as never, audit as never);
    // `getBinding` is the tenant-scoped read every method starts with; the
    // access check it performs is tested where it lives, not here.
    (service as unknown as { getBinding: jest.Mock }).getBinding = jest
      .fn()
      .mockResolvedValue(binding);
    return { service, prisma };
  };

  const tenantContext = {
    tenantId: 'tenant-1',
    userId: 'user-1',
    userRole: 'ADJUSTER',
  } as never;

  it('refuses take-over on the form', async () => {
    const { service } = buildService(CaseChannel.WEB_FORM);

    await expect(service.takeOver('binding-1', 'needs help', tenantContext)).rejects.toThrow(
      BadRequestException
    );
  });

  it('tells the operator what to do instead, rather than only refusing', async () => {
    const { service } = buildService(CaseChannel.WEB_FORM);

    await expect(service.takeOver('binding-1', 'needs help', tenantContext)).rejects.toThrow(
      /WhatsApp/
    );
  });

  it('writes nothing when it refuses', async () => {
    const { service, prisma } = buildService(CaseChannel.WEB_FORM);

    await service.takeOver('binding-1', 'needs help', tenantContext).catch(() => undefined);

    expect(prisma.conversationBinding.update).not.toHaveBeenCalled();
  });

  // The chat, WhatsApp and Telegram are threads and must keep working exactly
  // as they did. This guard is about one channel, not about take-over.
  it.each([CaseChannel.WEB_CHAT, CaseChannel.WHATSAPP, CaseChannel.TELEGRAM])(
    'still allows take-over on %s',
    async channel => {
      const { service, prisma } = buildService(channel);

      await expect(
        service.takeOver('binding-1', 'needs help', tenantContext)
      ).resolves.toBeDefined();
      expect(prisma.conversationBinding.update).toHaveBeenCalled();
    }
  );
});
