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

      // False, and this assertion is the point rather than a detail. It was
      // true, describing a summary panel beside the chat that was never built
      // — so the gateway withheld the answer summary from the review message
      // and the claimant was asked to confirm a claim submission with no
      // details on screen at all. A capability may only claim what the channel
      // actually renders; flip this the day a panel exists.
      expect(adapter.capabilities.summaryPanel).toBe(false);
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
    let findFirst: jest.Mock;
    let forCase: jest.Mock;
    let service: ClaimantConversationService;

    beforeEach(() => {
      upsert = jest.fn().mockResolvedValue(binding);
      handleTurn = jest.fn().mockResolvedValue(undefined);
      findMany = jest.fn().mockResolvedValue([]);
      count = jest.fn().mockResolvedValue(0);
      findFirst = jest.fn().mockResolvedValue(null);
      forCase = jest.fn().mockResolvedValue({ steps: [] });

      service = new ClaimantConversationService(
        {
          conversationBinding: { upsert },
          conversationMessage: { findMany, count, findFirst },
          case: { findUnique: jest.fn().mockResolvedValue(null) },
        } as never,
        {
          handleTurn,
          synthesiseStep: async (stepId: string) =>
            stepId === '__claim-type' ? { id: '__claim-type', answerType: 'choice' } : null,
        } as never,
        { forCase } as never,
        // CasesService — only the public upload path uses it.
        {} as never
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

    describe('the question the PWA renders a control for', () => {
      it('is resolved from the pinned flow, not the built-in one', async () => {
        const step = { id: 'airline', answerType: 'text', prompt: 'Which airline?' };
        forCase.mockResolvedValue({ steps: [step] });
        service = new ClaimantConversationService(
          {
            conversationBinding: { upsert },
            conversationMessage: { findMany, count, findFirst },
            case: {
              findUnique: jest.fn().mockResolvedValue({
                currentStepId: 'airline',
                travelClaimType: 'FLIGHT_DELAY',
                flowDefinitionId: 'flow-1',
              }),
            },
          } as never,
          { handleTurn } as never,
          { forCase } as never,
          // CasesService — only the public upload path uses it.
          {} as never
        );

        const result = await service.transcript(context);
        expect(result.currentStep).toEqual(step);
        // Showing a newer prompt than the one being answered is how the
        // conversation and the pinned flow drift apart.
        expect(forCase).toHaveBeenCalledWith(
          expect.objectContaining({ flowDefinitionId: 'flow-1' }),
          expect.objectContaining({ channel: CaseChannel.WEB_CHAT })
        );
      });

      it('is the claim-type menu before a case exists', async () => {
        upsert.mockResolvedValue({ ...binding, activeCaseId: null });
        findFirst.mockResolvedValue({ stepId: '__claim-type' });
        const result = await service.transcript(context);
        expect(result.currentStep).toEqual(
          expect.objectContaining({ id: '__claim-type', answerType: 'choice' })
        );
      });

      it('asks the gateway to rebuild any pre-flow step, not just the menu', async () => {
        // Consent is the other one, and it is the question with no alternative
        // route: a claimant who cannot render "I agree" cannot claim at all.
        const synthesiseStep = jest.fn().mockResolvedValue({
          id: '__consent',
          answerType: 'choice',
          choices: [{ value: 'ok', label: 'I agree' }],
        });
        upsert.mockResolvedValue({ ...binding, activeCaseId: null, locale: 'ms' });
        findFirst.mockResolvedValue({ stepId: '__consent' });
        service = new ClaimantConversationService(
          {
            conversationBinding: { upsert },
            conversationMessage: { findMany, count, findFirst },
            case: { findUnique: jest.fn() },
          } as never,
          { handleTurn, synthesiseStep } as never,
          { forCase } as never,
          // CasesService — only the public upload path uses it.
          {} as never
        );

        const result = await service.transcript(context);
        expect(result.currentStep).toEqual(expect.objectContaining({ id: '__consent' }));
        // In the claimant's own language, like every other channel.
        expect(synthesiseStep).toHaveBeenCalledWith('__consent', 'ms');
      });

      it('is nothing while a person has the conversation', async () => {
        upsert.mockResolvedValue({ ...binding, mode: 'HANDOVER' });
        const result = await service.transcript(context);
        // A date picker under an agent's message promises the bot will act on
        // it, and the bot has stood down.
        expect(result.currentStep).toBeNull();
      });
    });
  });
});
