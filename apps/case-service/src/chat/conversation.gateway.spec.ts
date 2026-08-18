import {
  CaseChannel,
  ConversationMessageStatus,
  ConversationMode,
  MessageDirection,
  Prisma,
} from '@prisma/client';
import { CHANNEL_CAPABILITIES } from '@tci/shared-types';
import { ConversationGateway } from './conversation.gateway';
import {
  PAGE_CALLBACK_PREFIX,
  type ChannelAdapter,
  type InboundTurnPayload,
} from './channel-adapter.interface';
import type { ClaimantResolver } from './claimant-resolver.interface';
import type { CasesService } from '../cases/cases.service';
import type { FlowsService } from '../cases/flows.service';
import type { PrismaService } from '../config/prisma.service';

/**
 * CONVERSATION GATEWAY.
 *
 * The properties under test are the ones whose failure is silent or unsafe:
 *
 *  - A retried delivery must not answer the same question twice.
 *  - Nothing about a claim is said to an unverified sender.
 *  - A wrong code is an ordinary turn; a hundred wrong codes is not.
 *  - Answers go through CasesService.patchAnswer, so redaction, promotion and
 *    audit apply to a Telegram turn exactly as to a browser one.
 */
describe('ConversationGateway', () => {
  const uniqueViolation = () =>
    new Prisma.PrismaClientKnownRequestError('dup', {
      code: 'P2002',
      clientVersion: 'test',
    });

  const setup = (
    over: {
      binding?: Record<string, unknown>;
      caseRow?: Record<string, unknown>;
      /** A stored CaseDocument the ownership check will find, or null for none. */
      storedDocument?: Record<string, unknown> | null;
    } = {}
  ) => {
    const binding = {
      id: 'bind-1',
      channel: CaseChannel.TELEGRAM,
      platformUserId: '55501',
      claimantId: null,
      activeCaseId: null,
      tenantId: null,
      pendingPhone: null,
      verifiedAt: null,
      otpAttempts: 0,
      mode: ConversationMode.BOT,
      ...over.binding,
    };

    const prisma = {
      conversationMessage: {
        create: jest.fn(async () => ({ id: 'msg-1' })),
        update: jest.fn(async () => ({})),
        updateMany: jest.fn(async () => ({ count: 1 })),
        // Turns in the last minute, for the rate limit. One by default: the
        // turn currently being handled.
        count: jest.fn(async () => 1),
        // The last thing we said. Null by default — nothing failed to send.
        findFirst: jest.fn(async () => null),
      },
      conversationBinding: {
        upsert: jest.fn(async () => binding),
        // Read on the error path, to check whether an agent has the
        // conversation before the bot apologises over them.
        findUnique: jest.fn(async () => binding),
        // Prisma returns the updated row; returning {} made a freshly-verified
        // binding look like it had no claimant, which is not a state that can
        // occur in production.
        update: jest.fn(async ({ data }: any) => ({ ...binding, ...data })),
        // The eager push resolves the claimant's most recent binding with
        // this. Null by default; the returned-case tests supply their own.
        findFirst: jest.fn(async () => null),
      },
      case: {
        findUnique: jest.fn(async () => over.caseRow ?? null),
        // The lazy returned-case lookup. Null by default: no case is waiting
        // on the claimant, so every older test keeps its original path.
        findFirst: jest.fn(async () => null),
        update: jest.fn(async () => ({})),
      },
      transferRecord: { create: jest.fn(async () => ({ id: 'transfer-1' })) },
      // Web chat sends a document that is already stored. The gateway looks it
      // up scoped to the Case, so an id from another claim finds nothing.
      caseDocument: { findFirst: jest.fn(async () => over.storedDocument ?? null) },
    };

    const sent: Array<{ to: string; text: string; requestPhone?: boolean }> = [];
    const adapter: ChannelAdapter = {
      channel: CaseChannel.TELEGRAM,
      capabilities: CHANNEL_CAPABILITIES[CaseChannel.TELEGRAM],
      isConfigured: () => true,
      send: jest.fn(async (to, prompt) => {
        sent.push({ to, text: prompt.text, requestPhone: prompt.requestPhone });
      }),
      fetchMedia: jest.fn(),
      acknowledgeCallback: jest.fn(async () => undefined),
    };

    const claimants: ClaimantResolver = {
      resolveByVerifiedPhone: jest.fn(async () => ({
        claimantId: 'claimant-1',
        tenantId: 'tenant-1',
      })),
    };

    const cases = {
      patchAnswer: jest.fn(async () => ({
        accepted: true,
        nextStep: null,
        warnings: [],
        case: { answers: {} },
      })),
      submit: jest.fn(async () => ({ id: 'case-1', caseNumber: 'CSE-2026-000015' })),
      create: jest.fn(async () => ({
        id: 'case-9',
        caseNumber: 'CSE-1',
        tenantId: 'tenant-1',
        currentStep: null,
      })),
      uploadDocument: jest.fn(async () => ({ id: 'doc-1' })),
      // The gateway applies the same ownership check the browser does, before
      // reading anything off the Case it loaded by id.
      assertAccess: jest.fn(),
    };

    const flows = {
      forCase: jest.fn(async () => ({
        travelClaimType: 'FLIGHT_DELAY',
        entryStepId: 'airline',
        steps: [
          {
            id: 'airline',
            prompt: 'Which airline?',
            label: 'Airline',
            answerType: 'text',
            next: { type: 'end' },
          },
        ],
      })),
    };

    // Off by default, exactly as in production: the conversation must be
    // provably complete without a model on the path.
    const normaliser = {
      isEnabled: jest.fn(() => false),
      normalise: jest.fn(async () => null),
    };

    // Consent already granted in most tests, so they exercise the path after
    // the gate; the consent tests below flip it.
    const consent = {
      hasConsent: jest.fn(async () => true),
      grant: jest.fn(async () => ({ id: 'consent-1' })),
      currentNotice: jest.fn(async () => ({
        id: 'notice-1',
        version: 1,
        locale: 'en',
        title: 'How we use your information',
        body: 'We process your personal data to handle your claim…',
      })),
    };

    const phones = {
      send: jest.fn(async () => ({ expiresIn: 300 })),
      verify: jest.fn(async () => true),
    };

    const gateway = new ConversationGateway(
      prisma as unknown as PrismaService,
      cases as unknown as CasesService,
      flows as unknown as FlowsService,
      claimants,
      [adapter],
      normaliser,
      // Web chat is the only channel that verifies a number in-conversation;
      // this adapter declares a platform-verified phone, so nothing here calls
      // it. The web-chat onboarding tests supply their own.
      phones,
      consent as never,
      // A handling firm is configured, as it is in every real deployment. The
      // null case has its own test.
      { get: (key: string) => (key === 'HANDLING_FIRM_TENANT_ID' ? 'tenant-handling' : undefined) } as never,
      // The info-request event port. Tests that exercise the returned-case
      // resume call the gateway's handler directly; nothing here emits.
      { on: jest.fn(), emit: jest.fn() } as never
    );

    return {
      gateway,
      prisma,
      adapter,
      claimants,
      cases,
      flows,
      sent,
      binding,
      normaliser,
      consent,
      phones,
    };
  };

  const turn = (over: Partial<InboundTurnPayload> = {}): InboundTurnPayload => ({
    channel: CaseChannel.TELEGRAM,
    platformUserId: '55501',
    platformMessageId: '101',
    ...over,
  });

  describe('sensitive answers in the transcript', () => {
    const verifiedBank = {
      verifiedAt: new Date(),
      claimantId: 'claimant-1',
      tenantId: 'tenant-1',
      activeCaseId: 'case-1',
    };
    const bankCase = {
      id: 'case-1',
      currentStepId: 'bank-account-number',
      answers: {},
      flowDefinitionId: null,
      travelClaimType: 'FLIGHT_DELAY',
    };

    it('never stores a payout account in the transcript', async () => {
      // The Case answer bag masks it and the encrypted column holds the real
      // value — but the claimant *typed* it, so the transcript kept a
      // plaintext copy in a column that is not encrypted, not omitted from
      // query results, not reached by the retention sweep or the
      // anonymisation job, and readable by any adjuster in the tenant.
      const { gateway, prisma, flows } = setup({ binding: verifiedBank, caseRow: bankCase });
      (flows.forCase as jest.Mock).mockResolvedValue({
        travelClaimType: 'FLIGHT_DELAY',
        entryStepId: 'bank-account-number',
        steps: [
          {
            id: 'bank-account-number',
            prompt: 'Account number?',
            label: 'Account number',
            answerType: 'text',
            next: { type: 'end' },
          },
        ],
      });

      await gateway.handleTurn(turn({ text: '157098234567' }));

      const texts = (prisma.conversationMessage.update as jest.Mock).mock.calls
        .map(call => call[0]?.data?.text)
        .filter(Boolean);
      expect(texts).toContain('••••4567');
      expect(texts.join(' ')).not.toContain('157098234567');
    });
  });

  describe('messages the flow cannot read', () => {
    const verifiedMid = {
      verifiedAt: new Date(),
      claimantId: 'claimant-1',
      tenantId: 'tenant-1',
      activeCaseId: 'case-1',
    };
    const midCase = {
      id: 'case-1',
      currentStepId: 'airline',
      answers: {},
      flowDefinitionId: null,
      travelClaimType: 'FLIGHT_DELAY',
    };

    it('answers a voice note instead of ignoring it', async () => {
      // These produced no payload at all, so the turn left no row, no reply
      // and no trace. A claimant filming flood damage, or one who finds
      // typing hard, was met with silence.
      const { gateway, sent, cases } = setup({ binding: verifiedMid, caseRow: midCase });

      await gateway.handleTurn(turn({ unsupportedMedia: 'voice' }));

      expect(cases.patchAnswer).not.toHaveBeenCalled();
      expect(sent[0].text).toMatch(/voice note/i);
    });

    it('does not store /start as the answer to the open question', async () => {
      // The universal Telegram gesture for "restart this bot", and the first
      // thing every user is taught.
      const { gateway, cases, adapter } = setup({ binding: verifiedMid, caseRow: midCase });

      await gateway.handleTurn(turn({ text: '/start' }));

      expect(cases.patchAnswer).not.toHaveBeenCalled();
      const prompts = (adapter.send as jest.Mock).mock.calls.map(c => c[1]);
      expect(prompts.some(p => p.step?.id === 'airline')).toBe(true);
    });

    it('refuses to lose a turn it could not even record', async () => {
      // A database outage leaves no row to mark and nothing to show an
      // operator, so the only safe response is to decline the update and let
      // the platform redeliver it.
      const { gateway, prisma } = setup();
      prisma.conversationMessage.create.mockRejectedValueOnce(new Error('db down'));

      await expect(gateway.handleTurn(turn({ text: 'hello' }))).rejects.toThrow(
        /Could not record turn/
      );
    });

    it('marks turns that were recorded and then abandoned', async () => {
      const { gateway, prisma } = setup();
      (prisma.conversationMessage.updateMany as jest.Mock).mockResolvedValueOnce({ count: 3 });

      const count = await gateway.markStalledTurns(CaseChannel.TELEGRAM, new Date());

      expect(count).toBe(3);
      expect(prisma.conversationMessage.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: ConversationMessageStatus.PENDING }),
          data: expect.objectContaining({ status: ConversationMessageStatus.FAILED }),
        })
      );
    });
  });

  describe('privacy and access', () => {
    const verifiedMid2 = {
      verifiedAt: new Date(),
      claimantId: 'claimant-1',
      tenantId: 'tenant-1',
      activeCaseId: 'case-1',
    };
    const midCase2 = {
      id: 'case-1',
      currentStepId: 'airline',
      answers: {},
      flowDefinitionId: null,
      travelClaimType: 'FLIGHT_DELAY',
      claimantId: 'claimant-1',
      tenantId: 'tenant-1',
    };

    it('never binds a group chat to a claimant', async () => {
      // The platform id in a group identifies the *group*, so one binding
      // would put a claimant's case number, answers and deadline warnings in
      // front of everyone in it.
      const { gateway, prisma, adapter } = setup();

      await gateway.handleTurn(turn({ text: '/start', chatType: 'group' }));

      expect(prisma.conversationBinding.upsert).not.toHaveBeenCalled();
      const said = (adapter.send as jest.Mock).mock.calls.map(c => c[1].text).join(' ');
      expect(said).toMatch(/private chat/i);
    });

    it('checks access before reading anything off the Case', async () => {
      const { gateway, cases } = setup({ binding: verifiedMid2, caseRow: midCase2 });

      await gateway.handleTurn(turn({ text: 'AirAsia' }));

      expect(cases.assertAccess).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'case-1' }),
        expect.objectContaining({ userId: 'claimant-1', userRole: 'CLAIMANT' })
      );
    });

    it('stops collecting once consent is withdrawn', async () => {
      // Consent is a condition of processing, not a box ticked at the start.
      // It was checked when the Case opened and never again, so a withdrawal
      // in the PWA did not stop this channel storing answers.
      const { gateway, cases, consent, sent } = setup({
        binding: verifiedMid2,
        caseRow: midCase2,
      });
      consent.hasConsent.mockResolvedValue(false);

      await gateway.handleTurn(turn({ text: 'AirAsia' }));

      expect(cases.patchAnswer).not.toHaveBeenCalled();
      expect(sent[0].text).toMatch(/withdrawn your consent/i);
    });

    it('asks a long-stale binding to confirm again', async () => {
      // A binding was an indefinite credential: verifiedAt was written once
      // and never read, so an account takeover kept working forever.
      const { gateway, prisma, sent } = setup({
        binding: {
          ...verifiedMid2,
          verifiedAt: new Date(Date.now() - 200 * 24 * 60 * 60 * 1000),
        },
        caseRow: midCase2,
      });

      await gateway.handleTurn(turn({ text: 'AirAsia' }));

      expect(prisma.conversationBinding.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { verifiedAt: null } })
      );
      expect(sent.some(m => /been a while/i.test(m.text))).toBe(true);
    });

    it('stays silent on the error path when an agent has the conversation', async () => {
      // The one place the machine could still speak over a human: the apology
      // in the catch fired unconditionally.
      const { gateway, prisma, adapter } = setup({
        binding: { ...verifiedMid2, mode: ConversationMode.HANDOVER },
      });
      (prisma.conversationMessage.update as jest.Mock).mockRejectedValueOnce(
        new Error('boom')
      );

      await gateway.handleTurn(turn({ text: 'hello' }));

      const said = (adapter.send as jest.Mock).mock.calls.map(c => c[1].text).join(' ');
      expect(said).not.toMatch(/something went wrong/i);
    });
  });

  describe('cross-border transfer register (PDPA s.129)', () => {
    it('records every conversational turn as a transfer', async () => {
      // The turn IS the transfer: the claimant's words reached Telegram's
      // servers abroad before we saw them. The registry entry and its passing
      // test existed for a day while nothing wrote a row — the §3.6 shape
      // inside the control added to close that very gap.
      const { gateway, prisma } = setup();

      await gateway.handleTurn(turn({ text: 'hello' }));

      expect(prisma.transferRecord.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            provider: 'TELEGRAM',
            sourceService: 'case-service',
          }),
        })
      );
    });

    it('records no lawful basis, because none is established', async () => {
      // A register that invents a basis is worse than the gap it papers over:
      // the honest row is what keeps the gap visible enough to close.
      const { gateway, prisma } = setup();

      await gateway.handleTurn(turn({ text: 'hello' }));

      const written = (prisma.transferRecord.create as jest.Mock).mock.calls[0][0].data;
      expect(written.lawfulBasis).toBeNull();
    });

    it('names the country and what was sent, from the shared registry', async () => {
      const { gateway, prisma } = setup();

      await gateway.handleTurn(turn({ text: 'hello' }));

      const written = (prisma.transferRecord.create as jest.Mock).mock.calls[0][0].data;
      expect(written.country).toMatch(/United Arab Emirates/);
      expect(written.dataDescription).toMatch(/conversation content/i);
    });
  });

  describe('idempotency', () => {
    it('ignores a redelivered update instead of answering twice', async () => {
      const { gateway, prisma, adapter } = setup();
      prisma.conversationMessage.create.mockRejectedValueOnce(uniqueViolation());

      await gateway.handleTurn(turn({ text: 'hello' }));

      expect(prisma.conversationBinding.upsert).not.toHaveBeenCalled();
      expect(adapter.send).not.toHaveBeenCalled();
    });

    it('records the turn before interpreting it', async () => {
      const { gateway, prisma } = setup();
      await gateway.handleTurn(turn({ text: 'hello' }));
      expect(prisma.conversationMessage.create).toHaveBeenCalled();
    });
  });

  describe('onboarding', () => {
    it('asks an unknown sender for their number and says nothing about claims', async () => {
      const { gateway, sent } = setup();

      await gateway.handleTurn(turn({ text: 'hello' }));

      expect(sent).toHaveLength(1);
      expect(sent[0].requestPhone).toBe(true);
      expect(sent[0].text).not.toMatch(/claim number|policy|CSE-/i);
    });

    it('refuses a contact that belongs to somebody else', async () => {
      // The impersonation this closes: Telegram lets a user share ANY card
      // from their address book. Reading phone_number without checking whose
      // it is meant sharing a victim's contact bound you as them — the OTP
      // was the only thing in the way, because the code went to the real
      // owner. With no code, this check is the control.
      const { gateway, claimants, sent } = setup();

      await gateway.handleTurn(turn({ sharedForeignContact: true }));

      expect(claimants.resolveByVerifiedPhone).not.toHaveBeenCalled();
      expect(sent[0].text).toMatch(/belongs to someone else/i);
      expect(sent[0].requestPhone).toBe(true);
    });

    it('never binds on a number the claimant merely typed', async () => {
      // Typing is exactly how you would claim to be somebody else, so the
      // typed path is not offered at all.
      const { gateway, claimants, sent } = setup();

      await gateway.handleTurn(turn({ text: '+60123456789' }));

      expect(claimants.resolveByVerifiedPhone).not.toHaveBeenCalled();
      expect(sent[0].requestPhone).toBe(true);
    });

    it('binds the claimant on a contact the platform vouches for', async () => {
      const { gateway, prisma } = setup();

      await gateway.handleTurn(turn({ sharedPhone: '+60123456789' }));

      expect(prisma.conversationBinding.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            claimantId: 'claimant-1',
            verifiedAt: expect.any(Date),
          }),
        })
      );
    });

    it('asks the next question immediately after verifying, not on the next message', async () => {
      const { gateway, adapter } = setup();

      await gateway.handleTurn(turn({ sharedPhone: '+60123456789' }));

      // The regression this guards: the bot said "you are verified, let us
      // begin" and then asked nothing, so the conversation looked finished
      // when it had barely started. Nothing errored, which is what made it
      // invisible — no Case was created, so the binding never got a tenant and
      // never appeared in the operator inbox either.
      const prompts = (adapter.send as jest.Mock).mock.calls.map(c => c[1]);
      const menu = prompts.find(p => p.step?.answerType === 'choice');
      expect(menu).toBeDefined();
      expect(menu.step.choices.map((c: any) => c.value)).toContain('FLIGHT_DELAY');
    });

    it('marks an onboarding turn as such, not as a flow answer', async () => {
      const { gateway, prisma } = setup();
      await gateway.handleTurn(turn({ text: 'hello' }));

      expect(prisma.conversationMessage.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: ConversationMessageStatus.ONBOARDING }),
        })
      );
    });
  });

  describe('answering', () => {
    const verified = {
      verifiedAt: new Date(),
      claimantId: 'claimant-1',
      tenantId: 'tenant-1',
      activeCaseId: 'case-1',
    };

    const caseRow = {
      id: 'case-1',
      currentStepId: 'airline',
      answers: {},
      flowDefinitionId: 'flow-1',
      travelClaimType: 'FLIGHT_DELAY',
    };

    it('ignores a tap meant for a question the conversation has moved past', async () => {
      // The corruption this closes, reproduced: nothing acknowledged a tap, so
      // the button spun for up to thirty seconds and the claimant tapped
      // again. Two taps are two update ids, which the dedupe cannot connect —
      // the first advanced the cursor and the second landed on whatever came
      // next. On the opening menu that stored the claim type as the policy
      // number, because a free-text step accepts anything.
      const { gateway, cases, adapter } = setup({ binding: verified, caseRow });

      await gateway.handleTurn(
        turn({ callbackValue: 'FLIGHT_DELAY', callbackStepId: '__claim-type' })
      );

      expect(cases.patchAnswer).not.toHaveBeenCalled();
      // Re-asked, not apologised for: from the claimant's side they tapped
      // twice and the conversation simply moved on, which is correct.
      const prompts = (adapter.send as jest.Mock).mock.calls.map(c => c[1]);
      expect(prompts.some(p => p.step?.id === 'airline')).toBe(true);
    });

    it('accepts a tap that names the step it is answering', async () => {
      const { gateway, cases } = setup({ binding: verified, caseRow });

      await gateway.handleTurn(turn({ callbackValue: 'AirAsia', callbackStepId: 'airline' }));

      expect(cases.patchAnswer).toHaveBeenCalledWith(
        'case-1',
        { stepId: 'airline', value: 'AirAsia' },
        expect.anything()
      );
    });

    it('acknowledges a tap so the button stops spinning', async () => {
      const { gateway, adapter } = setup({ binding: verified, caseRow });

      await gateway.handleTurn(
        turn({ callbackValue: 'AirAsia', callbackStepId: 'airline', callbackAckId: 'cbq-9' })
      );

      expect(adapter.acknowledgeCallback).toHaveBeenCalledWith('cbq-9');
    });

    it('re-asks rather than reading a reply to a question that never arrived', async () => {
      // patchAnswer advances the cursor before the next question is sent, so a
      // send that throws leaves the claimant looking at the previous question
      // while the Case has moved on. Their next message was then stored as the
      // answer to something they had never been shown.
      const { gateway, cases, adapter, prisma } = setup({ binding: verified, caseRow });
      (prisma.conversationMessage.findFirst as jest.Mock).mockResolvedValueOnce({
        id: 'out-1',
        status: ConversationMessageStatus.FAILED,
        stepId: 'airline',
      });

      await gateway.handleTurn(turn({ text: 'AirAsia' }));

      expect(cases.patchAnswer).not.toHaveBeenCalled();
      const prompts = (adapter.send as jest.Mock).mock.calls.map(c => c[1]);
      expect(prompts.some(p => p.step?.id === 'airline')).toBe(true);
    });

    it('does not strand the claimant behind a single failed send', async () => {
      // The failed outbound is marked handled, so the very next turn is read
      // as an answer rather than triggering the same recovery forever.
      const { gateway, prisma } = setup({ binding: verified, caseRow });
      (prisma.conversationMessage.findFirst as jest.Mock).mockResolvedValueOnce({
        id: 'out-1',
        status: ConversationMessageStatus.FAILED,
        stepId: 'airline',
      });

      await gateway.handleTurn(turn({ text: 'AirAsia' }));

      expect(prisma.conversationMessage.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'out-1' },
          data: expect.objectContaining({ status: ConversationMessageStatus.PROCESSED }),
        })
      );
    });

    it('routes the answer through patchAnswer as the claimant who owns the case', async () => {
      const { gateway, cases } = setup({ binding: verified, caseRow });

      await gateway.handleTurn(turn({ text: 'AirAsia' }));

      expect(cases.patchAnswer).toHaveBeenCalledWith(
        'case-1',
        { stepId: 'airline', value: 'AirAsia' },
        expect.objectContaining({ userRole: 'CLAIMANT', userId: 'claimant-1' })
      );
    });

    it('uses the flow pinned on the case, not the built-in one', async () => {
      const { gateway, flows } = setup({ binding: verified, caseRow });

      await gateway.handleTurn(turn({ text: 'AirAsia' }));

      // Structure from the pinned definition; wording for this channel and
      // this claimant's language. The pin is only worth having if every
      // renderer respects it, and the presentation is only applied because
      // the resolver finally has a caller.
      expect(flows.forCase).toHaveBeenCalledWith(
        expect.objectContaining({ flowDefinitionId: 'flow-1' }),
        { channel: CaseChannel.TELEGRAM, locale: 'en' }
      );
    });

    it('prefers a tapped button over typed text', async () => {
      const { gateway, cases } = setup({ binding: verified, caseRow });

      await gateway.handleTurn(turn({ text: 'Serious illness', callbackValue: 'ILLNESS' }));

      expect(cases.patchAnswer).toHaveBeenCalledWith(
        'case-1',
        { stepId: 'airline', value: 'ILLNESS' },
        expect.anything()
      );
    });

    it('re-asks the same step when an answer is rejected', async () => {
      const { gateway, cases, sent } = setup({ binding: verified, caseRow });
      (cases.patchAnswer as jest.Mock).mockResolvedValueOnce({
        accepted: false,
        error: 'That does not look like an airline.',
      });

      await gateway.handleTurn(turn({ text: '???' }));

      expect(sent[0].text).toBe('That does not look like an airline.');
      expect(sent[1].text).toContain('Which airline?');
    });

    it('passes deadline warnings on rather than swallowing them', async () => {
      const { gateway, cases, sent } = setup({ binding: verified, caseRow });
      (cases.patchAnswer as jest.Mock).mockResolvedValueOnce({
        accepted: true,
        nextStep: null,
        warnings: ['Incidents should be reported within 24 hours.'],
      });

      await gateway.handleTurn(turn({ text: 'AirAsia' }));

      expect(sent.map(s => s.text)).toContain('Incidents should be reported within 24 hours.');
    });

    it('offers the claim types to a verified sender with no case', async () => {
      const { gateway, cases, adapter } = setup({
        binding: { ...verified, activeCaseId: null },
      });

      await gateway.handleTurn(turn({ text: 'hello' }));

      expect(cases.patchAnswer).not.toHaveBeenCalled();
      const prompt = (adapter.send as jest.Mock).mock.calls[0][1];
      // Shaped as a choice step so the adapter renders it like any other
      // question, rather than through a second keyboard-building path.
      expect(prompt.step.answerType).toBe('choice');
      expect(prompt.step.choices.map((c: any) => c.value)).toContain('FLIGHT_DELAY');
    });

    it('opens a Case on the chosen claim type and asks its first step', async () => {
      const { gateway, cases, prisma, sent } = setup({
        binding: { ...verified, activeCaseId: null },
      });
      (cases.create as jest.Mock).mockResolvedValueOnce({
        id: 'case-9',
        caseNumber: 'CSE-2026-000009',
        tenantId: 'tenant-1',
        currentStep: {
          id: 'policy-number',
          prompt: 'What is your policy number?',
          label: 'Policy number',
          answerType: 'text',
          next: { type: 'end' },
        },
      });

      await gateway.handleTurn(turn({ callbackValue: 'FLIGHT_DELAY' }));

      expect(cases.create).toHaveBeenCalledWith(
        expect.objectContaining({
          travelClaimType: 'FLIGHT_DELAY',
          channel: CaseChannel.TELEGRAM,
        }),
        expect.objectContaining({ userRole: 'CLAIMANT', userId: 'claimant-1' })
      );
      expect(prisma.conversationBinding.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ activeCaseId: 'case-9' }) })
      );
      expect(sent.map(s => s.text).join(' ')).toContain('What is your policy number?');
    });
  });

  describe('LLM normalisation', () => {
    const verified = {
      verifiedAt: new Date(),
      claimantId: 'claimant-1',
      tenantId: 'tenant-1',
      activeCaseId: 'case-1',
    };
    const caseRow = {
      id: 'case-1',
      currentStepId: 'airline',
      answers: {},
      flowDefinitionId: 'flow-1',
      travelClaimType: 'FLIGHT_DELAY',
    };

    it('is not consulted when the deterministic parser already accepts the answer', async () => {
      const { gateway, normaliser } = setup({ binding: verified, caseRow });
      normaliser.isEnabled.mockReturnValue(true);

      await gateway.handleTurn(turn({ text: 'AirAsia' }));

      // Fallback only. A model on every turn is a paid offshore call on the
      // hot path of every claim, which MASTER_PLAN §2.5 rules out.
      expect(normaliser.normalise).not.toHaveBeenCalled();
    });

    it('is skipped entirely when switched off', async () => {
      const { gateway, normaliser, flows } = setup({ binding: verified, caseRow });
      (flows.forCase as jest.Mock).mockResolvedValue({
        travelClaimType: 'FLIGHT_DELAY',
        entryStepId: 'airline',
        steps: [
          {
            id: 'airline',
            prompt: 'Which airline?',
            label: 'Airline',
            answerType: 'number',
            next: { type: 'end' },
          },
        ],
      });

      await gateway.handleTurn(turn({ text: 'not a number' }));

      expect(normaliser.normalise).not.toHaveBeenCalled();
    });

    it('uses the model value only after it passes the same validator', async () => {
      const { gateway, cases, normaliser, flows } = setup({ binding: verified, caseRow });
      normaliser.isEnabled.mockReturnValue(true);
      normaliser.normalise.mockResolvedValue(1200 as never);
      (flows.forCase as jest.Mock).mockResolvedValue({
        travelClaimType: 'FLIGHT_DELAY',
        entryStepId: 'amount',
        steps: [
          {
            id: 'amount',
            prompt: 'How much are you claiming?',
            label: 'Amount',
            answerType: 'number',
            next: { type: 'end' },
          },
        ],
      });
      (caseRow as any).currentStepId = 'amount';

      // Words, not a number in any notation. `RM 1,200` used to sit here and
      // no longer reaches the model at all: `parseAmount` reads it
      // deterministically now, which is the fallback-only design paying off —
      // every parsing improvement shrinks the model's surface, and with it the
      // cost, the latency and the AI-scope exposure (MASTER_PLAN §6.19).
      await gateway.handleTurn(turn({ text: 'about twelve hundred ringgit' }));

      expect(normaliser.normalise).toHaveBeenCalled();
      expect(cases.patchAnswer).toHaveBeenCalledWith(
        'case-1',
        { stepId: 'amount', value: 1200 },
        expect.anything()
      );
      (caseRow as any).currentStepId = 'airline';
    });

    it('ignores a model value the validator still rejects', async () => {
      const { gateway, cases, normaliser, flows } = setup({ binding: verified, caseRow });
      normaliser.isEnabled.mockReturnValue(true);
      // A model can return anything; it must not reach the claim record just
      // because a model said it.
      normaliser.normalise.mockResolvedValue('still not a number' as never);
      (flows.forCase as jest.Mock).mockResolvedValue({
        travelClaimType: 'FLIGHT_DELAY',
        entryStepId: 'amount',
        steps: [
          {
            id: 'amount',
            prompt: 'How much?',
            label: 'Amount',
            answerType: 'number',
            next: { type: 'end' },
          },
        ],
      });
      (caseRow as any).currentStepId = 'amount';

      await gateway.handleTurn(turn({ text: 'lots' }));

      const call = (cases.patchAnswer as jest.Mock).mock.calls[0];
      expect(call[1].value).not.toBe('still not a number');
      (caseRow as any).currentStepId = 'airline';
    });
  });

  describe('consent', () => {
    const verifiedNoCase = {
      verifiedAt: new Date(),
      claimantId: 'claimant-1',
      tenantId: 'tenant-1',
      activeCaseId: null,
    };

    it('shows the approved notice before any claim question', async () => {
      const { gateway, cases, consent, sent } = setup({ binding: verifiedNoCase });
      consent.hasConsent.mockResolvedValue(false);

      await gateway.handleTurn(turn({ text: 'hello' }));

      // No Case, and no claim-type menu, until consent is given.
      expect(cases.create).not.toHaveBeenCalled();
      expect(sent[0].text).toContain('How we use your information');
    });

    it('records consent against the approved notice, then starts the claim', async () => {
      const { gateway, cases, consent } = setup({ binding: verifiedNoCase });
      consent.hasConsent.mockResolvedValue(false);

      await gateway.handleTurn(turn({ callbackValue: '__consent:agree' }));

      expect(consent.grant).toHaveBeenCalledWith(
        expect.objectContaining({
          claimantId: 'claimant-1',
          purpose: 'CLAIM_PROCESSING',
          // Recorded as what it was. A chat thread is not a web form.
          capturedVia: 'MESSAGING',
        })
      );
    });

    it('does not ask again once consent is on record', async () => {
      const { gateway, consent, sent } = setup({ binding: verifiedNoCase });
      consent.hasConsent.mockResolvedValue(true);

      await gateway.handleTurn(turn({ text: 'hello' }));

      expect(consent.grant).not.toHaveBeenCalled();
      expect(sent[0].text).not.toContain('How we use your information');
    });

    it('refuses to start intake when no approved notice exists', async () => {
      const { gateway, cases, consent, sent } = setup({ binding: verifiedNoCase });
      consent.hasConsent.mockResolvedValue(false);
      consent.currentNotice.mockResolvedValue(null as never);

      await gateway.handleTurn(turn({ text: 'hello' }));

      // Taking a claim with no approved wording to record against is the
      // failure this gate exists to prevent — so it stops rather than proceeds.
      expect(cases.create).not.toHaveBeenCalled();
      expect(sent[0].text).toMatch(/cannot start a claim/i);
    });
  });

  describe('completing the claim', () => {
    const verified = {
      verifiedAt: new Date(),
      claimantId: 'claimant-1',
      tenantId: 'tenant-1',
      activeCaseId: 'case-1',
    };
    const reviewFlow = {
      travelClaimType: 'FLIGHT_DELAY',
      entryStepId: 'review',
      steps: [
        {
          id: 'review',
          prompt: 'Please review your details, then confirm.',
          label: 'Review and confirm',
          answerType: 'confirm',
          isReview: true,
          next: { type: 'end' },
        },
      ],
    };
    const reviewCase = {
      id: 'case-1',
      currentStepId: 'review',
      answers: {},
      flowDefinitionId: 'flow-1',
      travelClaimType: 'FLIGHT_DELAY',
      tenantId: 'tenant-1',
    };

    it('does NOT submit on a confirm step that is not the review', async () => {
      // The medical flow carries a mid-flow specialist-review *notice* which
      // is also a confirm step. Reading "confirm" as "the claimant submitted"
      // was safe there only because the notice sits mid-flow; a flow ending on
      // one would have submitted an incomplete case and told the claimant it
      // was with the team. `isReview` is now explicit for exactly that reason.
      const { gateway, cases, flows } = setup({ binding: verified, caseRow: reviewCase });
      (flows.forCase as jest.Mock).mockResolvedValue({
        travelClaimType: 'MEDICAL',
        entryStepId: 'notice',
        steps: [
          {
            id: 'notice',
            prompt: 'Your claim will be reviewed by a specialist.',
            label: 'Specialist review notice',
            answerType: 'confirm',
            next: { type: 'end' },
          },
        ],
      });
      (reviewCase as any).currentStepId = 'notice';

      await gateway.handleTurn(turn({ callbackValue: 'true', callbackStepId: 'notice' }));

      expect(cases.submit).not.toHaveBeenCalled();
      (reviewCase as any).currentStepId = 'review';
    });

    it('submits the case when the claimant confirms', async () => {
      const { gateway, cases, flows, sent } = setup({ binding: verified, caseRow: reviewCase });
      (flows.forCase as jest.Mock).mockResolvedValue(reviewFlow);

      await gateway.handleTurn(turn({ callbackValue: 'true' }));

      // Without this the intake completes and the Case sits in IN_PROGRESS,
      // never reaching the operator vetting queue — a finished claim nobody
      // would ever see.
      expect(cases.submit).toHaveBeenCalledWith('case-1', expect.objectContaining({
        userRole: 'CLAIMANT',
      }));
      expect(sent.map(s => s.text).join(' ')).toContain('CSE-2026-000015');
    });

    it('never tells a messaging claimant to use "the app"', async () => {
      const { gateway, flows, sent } = setup({ binding: verified, caseRow: reviewCase });
      (flows.forCase as jest.Mock).mockResolvedValue(reviewFlow);

      await gateway.handleTurn(turn({ callbackValue: 'true' }));

      // They arrived via Telegram and were never told an app exists.
      expect(sent.map(s => s.text).join(' ')).not.toMatch(/in the app/i);
    });

    it('opens the edit menu when the claimant wants to change something', async () => {
      // This used to hand the conversation to a human — the branch predated
      // the edit flow. Found live: the review says type "edit", the claimant
      // taps the button instead, and the bot stood down mid-conversation.
      const { gateway, cases, prisma, flows, sent } = setup({
        binding: verified,
        caseRow: reviewCase,
      });
      (flows.forCase as jest.Mock).mockResolvedValue(reviewFlow);

      await gateway.handleTurn(turn({ callbackValue: 'false' }));

      expect(cases.submit).not.toHaveBeenCalled();
      // No handover, no bot standing down — the decline is served, not queued.
      expect(prisma.conversationBinding.update).not.toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ mode: ConversationMode.HANDOVER }),
        })
      );
      expect(sent.map(message => message.text).join(' ')).toMatch(/which answer|change/i);
    });
  });

  describe('correcting a mistake', () => {
    const verified = {
      verifiedAt: new Date(),
      claimantId: 'claimant-1',
      tenantId: 'tenant-1',
      activeCaseId: 'case-1',
    };

    // Two ordinary steps plus one that decides the path.
    const editFlow = {
      travelClaimType: 'TRIP_CANCELLATION',
      entryStepId: 'reason',
      steps: [
        {
          id: 'reason',
          prompt: 'Why was the trip cancelled?',
          label: 'Cancellation reason',
          answerType: 'choice',
          choices: [
            { value: 'ILLNESS', label: 'Illness' },
            { value: 'OTHER', label: 'Other' },
          ],
          next: {
            type: 'branch',
            when: [{ stepId: 'reason', op: 'eq', value: 'ILLNESS' }],
            then: 'flight',
            else: 'flight',
          },
        },
        {
          id: 'flight',
          prompt: 'What was your flight number?',
          label: 'Flight number',
          answerType: 'text',
          next: { type: 'step', stepId: 'bank' },
        },
        {
          id: 'bank',
          prompt: 'Which bank?',
          label: 'Bank name',
          answerType: 'text',
          next: { type: 'end' },
        },
      ],
    };

    const atBank = {
      id: 'case-1',
      caseNumber: 'CSE-1',
      currentStepId: 'bank',
      resumeStepId: null,
      answers: { reason: 'OTHER', flight: 'MH360' },
      flowDefinitionId: 'flow-1',
      travelClaimType: 'TRIP_CANCELLATION',
      tenantId: 'tenant-1',
    };

    it('"back" reopens the previous question', async () => {
      const { gateway, prisma, flows, cases, sent } = setup({ binding: verified, caseRow: atBank });
      (flows.forCase as jest.Mock).mockResolvedValue(editFlow);

      await gateway.handleTurn(turn({ text: 'back' }));

      // Not stored as the answer to "which bank".
      expect(cases.patchAnswer).not.toHaveBeenCalled();
      expect(prisma.case.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ currentStepId: 'flight' }),
        })
      );
      expect(sent.map(s => s.text).join(' ')).toContain('Flight number');
    });

    it('"edit" lists answers with their current values', async () => {
      const { gateway, flows, adapter } = setup({ binding: verified, caseRow: atBank });
      (flows.forCase as jest.Mock).mockResolvedValue(editFlow);

      await gateway.handleTurn(turn({ text: 'edit' }));

      const prompt = (adapter.send as jest.Mock).mock.calls[0][1];
      const labels = prompt.step.choices.map((c: any) => c.label);
      // The value has to be on the button: "Flight number" alone does not tell
      // a claimant which one holds their typo.
      expect(labels).toContain('Flight number — MH360');
    });

    it('remembers where to resume, so a fix does not cost later answers', async () => {
      const { gateway, prisma, flows } = setup({ binding: verified, caseRow: atBank });
      (flows.forCase as jest.Mock).mockResolvedValue(editFlow);

      await gateway.handleTurn(turn({ callbackValue: '__edit:flight' }));

      expect(prisma.case.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ currentStepId: 'flight', resumeStepId: 'bank' }),
        })
      );
    });

    it('does not resume when the edited answer decides the path', async () => {
      const { gateway, prisma, flows, sent } = setup({ binding: verified, caseRow: atBank });
      (flows.forCase as jest.Mock).mockResolvedValue(editFlow);

      await gateway.handleTurn(turn({ callbackValue: '__edit:reason' }));

      // Changing it may make a later question necessary that was never asked,
      // so the flow walks forward normally instead of jumping back.
      expect(prisma.case.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ currentStepId: 'reason', resumeStepId: null }),
        })
      );
      expect(sent.map(s => s.text).join(' ')).toMatch(/may affect what we need to ask/i);
    });

    it('says so rather than failing when there is nothing before the first question', async () => {
      const { gateway, flows, sent } = setup({
        binding: verified,
        caseRow: { ...atBank, currentStepId: 'reason' },
      });
      (flows.forCase as jest.Mock).mockResolvedValue(editFlow);

      await gateway.handleTurn(turn({ text: 'back' }));

      expect(sent[0].text).toMatch(/first question/i);
    });
  });

  describe('when the claimant is not on the happy path', () => {
    const verified = {
      verifiedAt: new Date(),
      claimantId: 'claimant-1',
      tenantId: 'tenant-1',
      activeCaseId: 'case-1',
    };
    const textFlow = {
      travelClaimType: 'LUGGAGE_DAMAGE',
      entryStepId: 'damage-description',
      steps: [
        {
          id: 'damage-description',
          prompt: 'Please describe the damage to your luggage.',
          label: 'Damage description',
          answerType: 'text',
          validation: { minLength: 20 },
          next: { type: 'end' },
        },
      ],
    };
    const caseRow = {
      id: 'case-1',
      caseNumber: 'CSE-1',
      currentStepId: 'damage-description',
      resumeStepId: null,
      answers: {},
      flowDefinitionId: 'flow-1',
      travelClaimType: 'LUGGAGE_DAMAGE',
      tenantId: 'tenant-1',
    };

    it('treats a question as a question, not as the answer', async () => {
      const { gateway, cases, flows, sent } = setup({ binding: verified, caseRow });
      (flows.forCase as jest.Mock).mockResolvedValue(textFlow);

      await gateway.handleTurn(turn({ text: 'what is a PIR?' }));

      // Otherwise an adjuster later reads a document reference that is a
      // question, and the claimant got no help.
      expect(cases.patchAnswer).not.toHaveBeenCalled();
      expect(sent[0].text).toMatch(/looks like a question/i);
    });

    it('does not mistake a long description containing a question mark', async () => {
      const { gateway, cases, flows } = setup({ binding: verified, caseRow });
      (flows.forCase as jest.Mock).mockResolvedValue(textFlow);

      await gateway.handleTurn(
        turn({
          text: 'The wheel snapped off and the zip is torn — is that covered? It happened on arrival.',
        })
      );

      // Refusing a real answer is worse than storing an odd one.
      expect(cases.patchAnswer).toHaveBeenCalled();
    });

    it('hands over when the claimant asks for a person', async () => {
      const { gateway, prisma, cases, flows, sent } = setup({ binding: verified, caseRow });
      (flows.forCase as jest.Mock).mockResolvedValue(textFlow);

      await gateway.handleTurn(turn({ text: 'human' }));

      expect(cases.patchAnswer).not.toHaveBeenCalled();
      expect(prisma.conversationBinding.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ mode: ConversationMode.HANDOVER }),
        })
      );
      expect(sent[0].text).toMatch(/one of our team/i);
    });
  });

  describe('a second claim', () => {
    it('releases the binding and offers a new claim when the active one is done', async () => {
      const finished = {
        verifiedAt: new Date(),
        claimantId: 'claimant-1',
        tenantId: 'tenant-1',
        activeCaseId: 'case-1',
      };
      const { gateway, prisma, adapter } = setup({
        binding: finished,
        caseRow: {
          id: 'case-1',
          caseNumber: 'CSE-2026-000015',
          // No cursor: the flow ran out of questions.
          currentStepId: null,
          answers: {},
          flowDefinitionId: 'flow-1',
          travelClaimType: 'FLIGHT_DELAY',
          tenantId: 'tenant-1',
        },
      });

      await gateway.handleTurn(turn({ text: 'hello again' }));

      // Without releasing it, a claimant could file exactly one claim ever —
      // every later message hitting a permanent dead end.
      expect(prisma.conversationBinding.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { activeCaseId: null } })
      );
      const prompts = (adapter.send as jest.Mock).mock.calls.map(c => c[1]);
      expect(prompts.some(p => p.step?.answerType === 'choice')).toBe(true);
    });
  });

  describe('long choice lists', () => {
    const verifiedWithCase = {
      verifiedAt: new Date(),
      claimantId: 'claimant-1',
      tenantId: 'tenant-1',
      activeCaseId: 'case-1',
    };
    const caseRow = {
      id: 'case-1',
      currentStepId: 'airline',
      answers: {},
      flowDefinitionId: 'flow-1',
      travelClaimType: 'FLIGHT_DELAY',
    };

    it('treats "More options" as navigation, never as an answer', async () => {
      const { gateway, cases, adapter } = setup({ binding: verifiedWithCase, caseRow });

      await gateway.handleTurn(turn({ callbackValue: `${PAGE_CALLBACK_PREFIX}2` }));

      // The danger this guards: answering the question with the string "__page:2".
      expect(cases.patchAnswer).not.toHaveBeenCalled();
      expect((adapter.send as jest.Mock).mock.calls[0][1].choicePage).toBe(2);
    });
  });

  describe('documents', () => {
    const verifiedWithCase = {
      verifiedAt: new Date(),
      claimantId: 'claimant-1',
      tenantId: 'tenant-1',
      activeCaseId: 'case-1',
    };
    const docCaseRow = {
      id: 'case-1',
      currentStepId: 'doc-boarding-pass',
      answers: {},
      flowDefinitionId: 'flow-1',
      travelClaimType: 'FLIGHT_DELAY',
    };
    const docFlow = {
      travelClaimType: 'FLIGHT_DELAY',
      entryStepId: 'doc-boarding-pass',
      steps: [
        {
          id: 'doc-boarding-pass',
          prompt: 'Please upload your boarding pass.',
          label: 'Boarding pass',
          answerType: 'document',
          documentType: 'BOARDING_PASS',
          next: { type: 'end' },
        },
      ],
    };

    it('fetches media only when a document step wants it, then answers with the id', async () => {
      const { gateway, cases, flows, adapter } = setup({
        binding: verifiedWithCase,
        caseRow: docCaseRow,
      });
      (flows.forCase as jest.Mock).mockResolvedValue(docFlow);
      (adapter.fetchMedia as jest.Mock).mockResolvedValue({
        buffer: Buffer.from('pdf'),
        filename: 'pass.jpg',
        mimeType: 'image/jpeg',
      });
      (cases.uploadDocument as jest.Mock).mockResolvedValue({ id: 'doc-77' });

      await gateway.handleTurn(turn({ mediaRef: 'tg-file-1' }));

      expect(adapter.fetchMedia).toHaveBeenCalledWith('tg-file-1');
      expect(cases.uploadDocument).toHaveBeenCalledWith(
        'case-1',
        expect.objectContaining({ filename: 'pass.jpg', mimetype: 'image/jpeg' }),
        expect.objectContaining({ userRole: 'CLAIMANT' })
      );
      // The flow answer carries the CaseDocument id, as the PWA's does.
      expect(cases.patchAnswer).toHaveBeenCalledWith(
        'case-1',
        { stepId: 'doc-boarding-pass', value: 'doc-77' },
        expect.anything()
      );
    });

    it('asks again rather than downloading when a document step gets text', async () => {
      const { gateway, adapter, cases, flows } = setup({
        binding: verifiedWithCase,
        caseRow: docCaseRow,
      });
      (flows.forCase as jest.Mock).mockResolvedValue(docFlow);

      await gateway.handleTurn(turn({ text: 'I will send it later' }));

      expect(adapter.fetchMedia).not.toHaveBeenCalled();
      expect(cases.patchAnswer).not.toHaveBeenCalled();
    });
  });

  describe('transcript', () => {
    it('persists what the firm says, not only what the claimant says', async () => {
      const { gateway, prisma } = setup();

      await gateway.handleTurn(turn({ text: 'hello' }));

      const directions = prisma.conversationMessage.create.mock.calls.map(
        (c: any) => c[0].data.direction
      );
      // Without the outbound row the transcript shows a claimant talking to
      // nobody, and bot performance cannot be reviewed at all.
      expect(directions).toContain(MessageDirection.INBOUND);
      expect(directions).toContain(MessageDirection.OUTBOUND);
    });

    it('attributes a bot message to no user, so an agent reply is distinguishable', async () => {
      const { gateway, prisma } = setup();

      await gateway.handleTurn(turn({ text: 'hello' }));

      const outbound = prisma.conversationMessage.create.mock.calls
        .map((c: any) => c[0].data)
        .find((d: any) => d.direction === MessageDirection.OUTBOUND);
      expect(outbound.sentByUserId).toBeNull();
    });
  });

  describe('handover', () => {
    const inHandover = {
      verifiedAt: new Date(),
      claimantId: 'claimant-1',
      tenantId: 'tenant-1',
      activeCaseId: 'case-1',
      mode: ConversationMode.HANDOVER,
    };
    const caseRow = {
      id: 'case-1',
      currentStepId: 'airline',
      answers: {},
      flowDefinitionId: 'flow-1',
      travelClaimType: 'FLIGHT_DELAY',
    };

    it('stands the bot down entirely while a human has the conversation', async () => {
      const { gateway, cases, adapter } = setup({ binding: inHandover, caseRow });

      await gateway.handleTurn(turn({ text: 'I need to speak to someone' }));

      // The danger: the bot answering over the agent mid-exchange, or
      // overwriting a correction the agent just made.
      expect(cases.patchAnswer).not.toHaveBeenCalled();
      expect(adapter.send).not.toHaveBeenCalled();
    });

    it('still records the message, so the agent sees what was said', async () => {
      const { gateway, prisma } = setup({ binding: inHandover, caseRow });

      await gateway.handleTurn(turn({ text: 'I need to speak to someone' }));

      expect(prisma.conversationMessage.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ direction: MessageDirection.INBOUND }),
        })
      );
      expect(prisma.conversationMessage.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: ConversationMessageStatus.AWAITING_AGENT,
          }),
        })
      );
    });

    it('attributes an operator reply to the user who sent it', async () => {
      const { gateway, prisma, adapter } = setup({ binding: inHandover });

      await gateway.sendAsOperator(
        'bind-1',
        CaseChannel.TELEGRAM,
        '55501',
        'Hello, this is Aisyah from Pacific Adjusters.',
        'user-42'
      );

      expect(adapter.send).toHaveBeenCalled();
      expect(prisma.conversationMessage.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            direction: MessageDirection.OUTBOUND,
            sentByUserId: 'user-42',
          }),
        })
      );
    });
  });

  describe('failure handling', () => {
    it('records the failure and tells the claimant rather than going quiet', async () => {
      const { gateway, prisma, sent } = setup();
      prisma.conversationBinding.upsert.mockRejectedValueOnce(new Error('db down'));

      await gateway.handleTurn(turn({ text: 'hello' }));

      expect(prisma.conversationMessage.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: ConversationMessageStatus.FAILED }),
        })
      );
      expect(sent[0].text).toMatch(/something went wrong/i);
    });

    it('drops a turn for a channel with no adapter instead of throwing', async () => {
      const { gateway, prisma } = setup();
      await gateway.handleTurn(turn({ channel: CaseChannel.WHATSAPP }));
      expect(prisma.conversationMessage.create).not.toHaveBeenCalled();
    });
  });

  /**
   * Documents that arrive already stored — the web-chat path.
   *
   * A messaging platform hands us a reference we fetch from *their* servers,
   * so the file's provenance is the platform's. A browser posts the bytes to
   * our upload endpoint and then names the resulting id on the turn, which
   * means the id is claimant-supplied input on a route that attaches evidence
   * to a claim. Checked, never trusted.
   */
  describe('a document that arrives already stored', () => {
    const documentFlow = {
      travelClaimType: 'FLIGHT_DELAY',
      entryStepId: 'doc-boarding-pass',
      steps: [
        {
          id: 'doc-boarding-pass',
          prompt: 'Please upload your boarding pass.',
          label: 'Boarding pass',
          answerType: 'document',
          documentType: 'BOARDING_PASS',
          next: { type: 'end' },
        },
      ],
    };

    const ready = (storedDocument: Record<string, unknown> | null) =>
      setup({
        binding: {
          claimantId: 'claimant-1',
          tenantId: 'tenant-1',
          activeCaseId: 'case-1',
          verifiedAt: new Date(),
        },
        caseRow: {
          id: 'case-1',
          caseNumber: 'CSE-1',
          tenantId: 'tenant-1',
          currentStepId: 'doc-boarding-pass',
          answers: {},
          travelClaimType: 'FLIGHT_DELAY',
          status: 'IN_PROGRESS',
        },
        storedDocument,
      });

    it('accepts one that belongs to this case', async () => {
      const { gateway, cases, flows } = ready({ id: 'doc-7', caseId: 'case-1' });
      flows.forCase.mockResolvedValue(documentFlow as never);

      await gateway.handleTurn(
        turn({ channel: CaseChannel.TELEGRAM, storedDocumentId: 'doc-7' })
      );

      expect(cases.patchAnswer).toHaveBeenCalledWith(
        'case-1',
        expect.objectContaining({ stepId: 'doc-boarding-pass', value: 'doc-7' }),
        expect.anything()
      );
    });

    it('refuses one that does not, and never records it as an answer', async () => {
      // The scoped lookup finds nothing: the id is real but belongs to another
      // claim. Accepting it would attach a stranger's document as evidence.
      const { gateway, cases, sent, flows } = ready(null);
      flows.forCase.mockResolvedValue(documentFlow as never);

      await gateway.handleTurn(
        turn({ channel: CaseChannel.TELEGRAM, storedDocumentId: 'doc-from-another-claim' })
      );

      expect(cases.patchAnswer).not.toHaveBeenCalled();
      expect(sent.at(-1)?.text).toMatch(/could not attach/i);
    });

    it('scopes the lookup by case rather than filtering afterwards', async () => {
      const { gateway, prisma, flows } = ready({ id: 'doc-7', caseId: 'case-1' });
      flows.forCase.mockResolvedValue(documentFlow as never);

      await gateway.handleTurn(turn({ storedDocumentId: 'doc-7' }));

      // A findUnique followed by an `if` is the same check until someone
      // deletes the `if`. The constraint belongs in the query.
      expect(prisma.caseDocument.findFirst).toHaveBeenCalledWith({
        where: { id: 'doc-7', caseId: 'case-1' },
      });
    });

    it('never fetches media when the document is already stored', async () => {
      const { gateway, adapter, flows } = ready({ id: 'doc-7', caseId: 'case-1' });
      flows.forCase.mockResolvedValue(documentFlow as never);

      await gateway.handleTurn(turn({ storedDocumentId: 'doc-7' }));

      expect(adapter.fetchMedia).not.toHaveBeenCalled();
    });
  });


  /**
   * "Would you like to start another claim?"
   *
   * It used to be rhetorical — the bot asked, then started the claim in the
   * same breath, so the claim-type menu landed underneath the question and the
   * answer was never wanted. A claimant messaging to ask after the claim they
   * had just filed was pushed into filing a second one.
   */
  describe('offering another claim after one is finished', () => {
    const finished = () =>
      setup({
        binding: {
          claimantId: 'claimant-1',
          tenantId: 'tenant-1',
          activeCaseId: 'case-1',
          verifiedAt: new Date(),
        },
        caseRow: {
          id: 'case-1',
          caseNumber: 'CSE-2026-000024',
          tenantId: 'tenant-1',
          currentStepId: null,
          answers: {},
          travelClaimType: 'FLIGHT_DELAY',
          status: 'SUBMITTED',
        },
      });

    it('asks, and waits — no claim-type menu underneath it', async () => {
      const { gateway, sent } = finished();

      await gateway.handleTurn(turn({ text: 'Hi' }));

      expect(sent.at(-1)?.text).toMatch(/would you like to start another claim/i);
      // The bug: the menu arrived in the same turn, so the question was fake.
      expect(sent.map(message => message.text).join(' ')).not.toMatch(/what has happened/i);
    });

    it('releases the finished case so a second claim is possible at all', async () => {
      const { gateway, prisma } = finished();

      await gateway.handleTurn(turn({ text: 'Hi' }));

      expect(prisma.conversationBinding.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ activeCaseId: null }) })
      );
    });

    it('starts one when the claimant says yes', async () => {
      // The previous turn released the case, so the follow-up tap arrives on a
      // binding with nothing active — which is the state this answer is for.
      const { gateway, consent, sent } = setup({
        binding: {
          claimantId: 'claimant-1',
          tenantId: 'tenant-1',
          activeCaseId: null,
          verifiedAt: new Date(),
        },
      });

      await gateway.handleTurn(turn({ callbackValue: '__another:yes' }));

      // Into the consent gate, which is where a new claim begins.
      expect(consent.hasConsent).toHaveBeenCalled();
      expect(sent.length).toBeGreaterThan(0);
    });

    it('stops when the claimant says no, without starting anything', async () => {
      const { gateway, sent, cases } = setup({
        binding: {
          claimantId: 'claimant-1',
          tenantId: 'tenant-1',
          activeCaseId: null,
          verifiedAt: new Date(),
        },
      });

      await gateway.handleTurn(turn({ callbackValue: '__another:no' }));

      expect(sent.at(-1)?.text).toMatch(/no problem/i);
      expect(cases.create).not.toHaveBeenCalled();
    });

    it('can be rebuilt for a pull channel, like the other pre-flow steps', async () => {
      // The PWA renders from the transcript, which stores text and not choices.
      // A synthetic step the gateway cannot rebuild arrives there as a question
      // with no controls — a dead end.
      const { gateway } = setup();
      const step = await gateway.synthesiseStep('__another-claim', 'en');

      expect(step?.answerType).toBe('choice');
      expect(step?.choices?.map(choice => choice.value)).toEqual([
        '__another:yes',
        '__another:no',
      ]);
    });
  });


  /**
   * A conversation nobody can see is a claimant nobody can help.
   *
   * The operator queue filters by tenant, and a first-time claimant has none:
   * the resolver derives it from an existing claim and there is not one yet.
   * The binding is backfilled when a Case is created — but the window before
   * that covers consent and claim-type selection, which is exactly when a
   * confused person types "human".
   */
  describe('the tenant on a brand-new binding', () => {
    const unknownClaimant = () => {
      const harness = setup();
      (harness.claimants.resolveByVerifiedPhone as jest.Mock).mockResolvedValue({
        claimantId: 'claimant-new',
        // No claim yet, so no tenant to derive.
        tenantId: null,
      });
      return harness;
    };

    it('falls back to the handling firm rather than leaving it null', async () => {
      const { gateway, prisma } = unknownClaimant();

      await gateway.handleTurn(turn({ sharedPhone: '+60123456789' }));

      const wrote = (prisma.conversationBinding.update as jest.Mock).mock.calls.find(
        ([args]) => args?.data?.verifiedAt
      );
      expect(wrote?.[0].data.tenantId).toBe('tenant-handling');
    });

    it('keeps the claimant’s real tenant when there is one', async () => {
      // The fallback must not override a claimant who already belongs
      // somewhere — a returning claimant's second conversation.
      const { gateway, prisma } = setup();

      await gateway.handleTurn(turn({ sharedPhone: '+60123456789' }));

      const wrote = (prisma.conversationBinding.update as jest.Mock).mock.calls.find(
        ([args]) => args?.data?.verifiedAt
      );
      expect(wrote?.[0].data.tenantId).toBe('tenant-1');
    });
  });

  describe('a case returned for more information', () => {
    const returnedCase = {
      id: 'case-7',
      caseNumber: 'CSE-2026-000042',
      tenantId: 'tenant-1',
      claimantId: 'claimant-1',
      status: 'INFO_REQUESTED',
      reviewNote: 'Please provide the itemised medical invoice.',
      answers: {},
      travelClaimType: 'FLIGHT_DELAY',
      currentStepId: null,
    };

    const boundIdle = () =>
      setup({
        binding: {
          claimantId: 'claimant-1',
          tenantId: 'tenant-1',
          activeCaseId: null,
          verifiedAt: new Date(),
        },
      });

    it('resumes the returned case instead of offering a new one', async () => {
      const { gateway, prisma, sent, consent } = boundIdle();
      (prisma.case.findFirst as jest.Mock).mockResolvedValue(returnedCase);

      await gateway.handleTurn(turn({ text: 'Hi' }));

      // Reattached, and the cursor points at what is actually missing.
      expect(prisma.conversationBinding.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ activeCaseId: 'case-7' }) })
      );
      expect(prisma.case.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'case-7' },
          data: expect.objectContaining({ currentStepId: 'airline' }),
        })
      );
      // The operator's ask is said in the claimant's own channel, then the
      // missing step is asked — and no fresh-claim consent gate underneath.
      const all = sent.map(message => message.text).join(' ');
      expect(all).toMatch(/needs one more thing on CSE-2026-000042/i);
      expect(all).toMatch(/itemised medical invoice/i);
      expect(all).toMatch(/which airline/i);
      expect(consent.hasConsent).not.toHaveBeenCalled();
    });

    it('pushes the ask the moment the operator returns the case', async () => {
      const { gateway, prisma, sent, binding } = boundIdle();
      (prisma.case.findUnique as jest.Mock).mockResolvedValue(returnedCase);
      (prisma.conversationBinding.findFirst as jest.Mock).mockResolvedValue(binding);

      await (gateway as never as { handleInfoRequested(id: string): Promise<void> })
        .handleInfoRequested('case-7');

      expect(prisma.conversationBinding.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ activeCaseId: 'case-7' }) })
      );
      const all = sent.map(message => message.text).join(' ');
      expect(all).toMatch(/itemised medical invoice/i);
      expect(all).toMatch(/which airline/i);
    });

    it('re-asks a complete case as a correction, not the submission ceremony', async () => {
      // Everything is answered — the operator wants an answer *changed* — so
      // the cursor falls back to the review step. The re-ask must read as a
      // correction: no "(2 of 2)" counter, no "confirm to submit your claim",
      // and the note message must not duplicate the instruction the review
      // carries. Reported from the first live use, where the pinned review
      // prompt arrived verbatim and read as the bot repeating itself.
      const { gateway, prisma, sent, flows } = boundIdle();
      (flows.forCase as jest.Mock).mockResolvedValue({
        travelClaimType: 'FLIGHT_DELAY',
        entryStepId: 'airline',
        steps: [
          {
            id: 'airline',
            prompt: 'Which airline?',
            label: 'Airline',
            answerType: 'text',
            next: { type: 'step', stepId: 'review' },
          },
          {
            id: 'review',
            prompt: '(2 of 2) Thank you. Please review, then confirm to submit.',
            label: 'Review',
            answerType: 'confirm',
            isReview: true,
            next: { type: 'end' },
          },
        ],
      });
      (prisma.case.findFirst as jest.Mock).mockResolvedValue({
        ...returnedCase,
        answers: { airline: 'MAS' },
      });

      await gateway.handleTurn(turn({ text: 'Hi' }));

      const all = sent.map(message => message.text).join('\n');
      expect(all).toMatch(/needs one more thing/i);
      expect(all).toMatch(/type "edit" to change an answer, then confirm to resubmit/i);
      expect(all).not.toMatch(/\(2 of 2\)/);
      expect(all).not.toMatch(/confirm to submit your claim/i);
      // Said once — in the re-asked review, not also in the note message.
      expect(all.match(/confirm to resubmit/gi)).toHaveLength(1);
    });

    it('does not hijack a binding mid-way through another intake', async () => {
      const { gateway, prisma, sent } = setup({
        binding: {
          claimantId: 'claimant-1',
          tenantId: 'tenant-1',
          activeCaseId: 'case-other',
          verifiedAt: new Date(),
        },
      });
      (prisma.case.findUnique as jest.Mock).mockResolvedValue(returnedCase);
      (prisma.conversationBinding.findFirst as jest.Mock).mockResolvedValue({
        id: 'bind-1',
        channel: CaseChannel.TELEGRAM,
        platformUserId: '55501',
        activeCaseId: 'case-other',
        mode: ConversationMode.BOT,
      });

      await (gateway as never as { handleInfoRequested(id: string): Promise<void> })
        .handleInfoRequested('case-7');

      expect(prisma.conversationBinding.update).not.toHaveBeenCalled();
      expect(sent).toHaveLength(0);
    });

    it('reattaches but stays silent when an agent has the conversation', async () => {
      const { gateway, prisma, sent } = boundIdle();
      (prisma.case.findUnique as jest.Mock).mockResolvedValue(returnedCase);
      (prisma.conversationBinding.findFirst as jest.Mock).mockResolvedValue({
        id: 'bind-1',
        channel: CaseChannel.TELEGRAM,
        platformUserId: '55501',
        activeCaseId: null,
        mode: ConversationMode.HANDOVER,
      });

      await (gateway as never as { handleInfoRequested(id: string): Promise<void> })
        .handleInfoRequested('case-7');

      // The case is waiting for them when the conversation is handed back…
      expect(prisma.conversationBinding.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ activeCaseId: 'case-7' }) })
      );
      // …but the bot said nothing over the agent.
      expect(sent).toHaveLength(0);
    });
  });
});
