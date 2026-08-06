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
import type { OtpVerifier } from './otp-verifier.interface';
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

  const setup = (over: { binding?: Record<string, unknown>; caseRow?: Record<string, unknown> } = {}) => {
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
      },
      conversationBinding: {
        upsert: jest.fn(async () => binding),
        // Prisma returns the updated row; returning {} made a freshly-verified
        // binding look like it had no claimant, which is not a state that can
        // occur in production.
        update: jest.fn(async ({ data }: any) => ({ ...binding, ...data })),
      },
      case: {
        findUnique: jest.fn(async () => over.caseRow ?? null),
        update: jest.fn(async () => ({})),
      },
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
    };

    const otp: OtpVerifier = {
      send: jest.fn(async () => undefined),
      verify: jest.fn(async () => ({ valid: true, claimantId: 'claimant-1', tenantId: 'tenant-1' })),
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

    const gateway = new ConversationGateway(
      prisma as unknown as PrismaService,
      cases as unknown as CasesService,
      flows as unknown as FlowsService,
      otp,
      [adapter],
      normaliser,
      consent as never
    );

    return { gateway, prisma, adapter, otp, cases, flows, sent, binding, normaliser, consent };
  };

  const turn = (over: Partial<InboundTurnPayload> = {}): InboundTurnPayload => ({
    channel: CaseChannel.TELEGRAM,
    platformUserId: '55501',
    platformMessageId: '101',
    ...over,
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

    it('sends a code when a phone is shared, despite Telegram vouching for it', async () => {
      const { gateway, otp, sent } = setup();

      await gateway.handleTurn(turn({ sharedPhone: '+60123456789' }));

      expect(otp.send).toHaveBeenCalledWith('+60123456789');
      expect(sent[0].text).toContain('code');
    });

    it('treats a wrong code as an ordinary turn and counts it', async () => {
      const { gateway, otp, prisma, sent } = setup({
        binding: { pendingPhone: '+60123456789' },
      });
      (otp.verify as jest.Mock).mockResolvedValueOnce({ valid: false });

      await gateway.handleTurn(turn({ text: '000000' }));

      expect(prisma.conversationBinding.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { otpAttempts: { increment: 1 } } })
      );
      expect(sent[0].text).toMatch(/not correct|expired/i);
    });

    it('stops accepting codes after too many failures', async () => {
      const { gateway, otp, sent } = setup({
        binding: { pendingPhone: '+60123456789', otpAttempts: 5 },
      });

      await gateway.handleTurn(turn({ text: '000000' }));

      expect(otp.verify).not.toHaveBeenCalled();
      expect(sent[0].text).toMatch(/too many/i);
    });

    it('binds the claimant on a correct code', async () => {
      const { gateway, prisma } = setup({ binding: { pendingPhone: '+60123456789' } });

      await gateway.handleTurn(turn({ text: '123456' }));

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
      const { gateway, adapter } = setup({ binding: { pendingPhone: '+60123456789' } });

      await gateway.handleTurn(turn({ text: '123456' }));

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

      expect(flows.forCase).toHaveBeenCalledWith(expect.objectContaining({ flowDefinitionId: 'flow-1' }));
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

      await gateway.handleTurn(turn({ text: 'RM 1,200' }));

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

    it('asks for a human when the claimant wants to change something', async () => {
      const { gateway, cases, prisma, flows, sent } = setup({
        binding: verified,
        caseRow: reviewCase,
      });
      (flows.forCase as jest.Mock).mockResolvedValue(reviewFlow);

      await gateway.handleTurn(turn({ callbackValue: 'false' }));

      expect(cases.submit).not.toHaveBeenCalled();
      expect(prisma.conversationBinding.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ mode: ConversationMode.HANDOVER }),
        })
      );
      expect(sent[0].text).toMatch(/team will pick this up/i);
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
});
