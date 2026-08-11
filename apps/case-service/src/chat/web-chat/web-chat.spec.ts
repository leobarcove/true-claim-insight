import { CaseChannel } from '@prisma/client';

import { ClaimantConversationService } from '../claimant-conversation.service';
import { WebChatAdapter } from './web-chat.adapter';

/**
 * The PWA as a channel behind the same gateway as Telegram.
 *
 * The point of these tests is the seam, not the flow: the flow is already
 * covered once, for every channel, because there is now only one of it. What
 * has to hold here is that a browser session maps to exactly one binding, that
 * a retried turn is not answered twice, and that a document id arriving from a
 * claimant's browser is checked rather than trusted.
 */
describe('web chat', () => {
  describe('the adapter', () => {
    const adapter = new WebChatAdapter();

    it('is always configured — the transport is the claimant’s own session', () => {
      expect(adapter.isConfigured()).toBe(true);
    });

    it('declares the capabilities the flow engine reads', () => {
      // Written long before this adapter and consumed by nothing until now.
      expect(adapter.capabilities.summaryPanel).toBe(true);
      expect(adapter.capabilities.dateEntry).toBe('picker');
      expect(adapter.capabilities.choiceStyle).toBe('native');
      // The one real advantage over messaging: nothing is left sitting in a
      // third party's chat history.
      expect(adapter.capabilities.retainsPlaintext).toBe(false);
    });

    it('sends nothing, because the gateway already persisted it', async () => {
      // A push adapter calls out here. A pull channel must not: the row the
      // gateway wrote *is* the delivery, and writing again would double every
      // message in the transcript.
      await expect(adapter.send('claimant-1', { text: 'hello' })).resolves.toBeUndefined();
    });

    it('refuses to fetch media rather than returning an empty file', async () => {
      // Silence here would store a zero-byte document that reaches an adjuster
      // as evidence that will not open.
      await expect(adapter.fetchMedia('anything')).rejects.toThrow(/no media to fetch/i);
    });
  });

  describe('the claimant service', () => {
    const context = { tenantId: 'tenant-1', userId: 'claimant-1', userRole: 'CLAIMANT' } as never;
    const binding = { id: 'binding-1', platformUserId: 'claimant-1', mode: 'BOT', activeCaseId: 'case-1' };

    let upsert: jest.Mock;
    let handleTurn: jest.Mock;
    let findMany: jest.Mock;
    let count: jest.Mock;
    let service: ClaimantConversationService;

    beforeEach(() => {
      upsert = jest.fn().mockResolvedValue(binding);
      handleTurn = jest.fn().mockResolvedValue(undefined);
      findMany = jest.fn().mockResolvedValue([]);
      count = jest.fn().mockResolvedValue(0);

      service = new ClaimantConversationService(
        {
          conversationBinding: { upsert },
          conversationMessage: { findMany, count },
        } as never,
        { handleTurn } as never
      );
    });

    it('binds a browser session to the claimant, not to a device', async () => {
      await service.bindingFor(context);
      const [args] = upsert.mock.calls[0];
      expect(args.where.channel_platformUserId).toEqual({
        channel: CaseChannel.WEB_CHAT,
        platformUserId: 'claimant-1',
      });
    });

    it('treats the login as the identity proof, not a phone share', async () => {
      await service.bindingFor(context);
      const [args] = upsert.mock.calls[0];
      // A messaging claimant proves possession of a number by OTP. This one
      // arrived with a token we issued; repeating the dance would be theatre,
      // and would strand them at "share your number" with nothing to share.
      expect(args.create.verifiedAt).toBeInstanceOf(Date);
      expect(args.create.claimantId).toBe('claimant-1');
    });

    it('upserts rather than checking first, so two tabs make one binding', async () => {
      await Promise.all([service.bindingFor(context), service.bindingFor(context)]);
      expect(upsert).toHaveBeenCalledTimes(2);
      // Both went through the unique constraint; neither read-then-created.
      expect(upsert.mock.calls.every(([args]) => 'channel_platformUserId' in args.where)).toBe(true);
    });

    it('namespaces the dedupe key by binding', async () => {
      await service.handleTurn(context, { clientMessageId: 'abc', text: 'hi' });
      const [payload] = handleTurn.mock.calls[0];
      // Unnamespaced, two claimants whose clients both counted from 1 would
      // collide, and the second answer would be dropped as already seen.
      expect(payload.platformMessageId).toBe('binding-1:abc');
      expect(payload.channel).toBe(CaseChannel.WEB_CHAT);
    });

    it('passes the tapped step through, so a stale tap is still caught', async () => {
      await service.handleTurn(context, {
        clientMessageId: 'abc',
        callbackValue: 'FLIGHT_DELAY',
        callbackStepId: '__claim-type',
      });
      const [payload] = handleTurn.mock.calls[0];
      expect(payload.callbackStepId).toBe('__claim-type');
    });

    it('opens the conversation only once', async () => {
      count.mockResolvedValue(3); // already talking
      await service.start(context);
      expect(handleTurn).not.toHaveBeenCalled();
    });

    it('greets a claimant who has just arrived', async () => {
      await service.start(context);
      expect(handleTurn).toHaveBeenCalledTimes(1);
    });

    it('tells the claimant when a person has taken over', async () => {
      upsert.mockResolvedValue({ ...binding, mode: 'HANDOVER' });
      const result = await service.transcript(context);
      expect(result.withAgent).toBe(true);
    });

    it('marks which replies came from a person', async () => {
      findMany.mockResolvedValue([
        { id: 'm1', direction: 'OUTBOUND', text: 'Bot line', stepId: null, sentByUserId: null, createdAt: new Date() },
        { id: 'm2', direction: 'OUTBOUND', text: 'Agent line', stepId: null, sentByUserId: 'user-9', createdAt: new Date() },
      ]);
      const result = await service.transcript(context);
      expect(result.messages.map(m => m.fromAgent)).toEqual([false, true]);
    });

    it('never returns the handover reason to the claimant', async () => {
      upsert.mockResolvedValue({ ...binding, mode: 'HANDOVER', handoverReason: 'Suspected duplicate claim' });
      const result = await service.transcript(context);
      // An internal note about their own claim. They are told a colleague is
      // looking, and nothing about why.
      expect(JSON.stringify(result)).not.toContain('Suspected duplicate');
    });

    it('hides turns that failed to send', async () => {
      await service.transcript(context);
      const [args] = findMany.mock.calls[0];
      expect(args.where.status).toEqual({ not: 'FAILED' });
    });
  });
});
