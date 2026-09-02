import { CaseChannel, CaseStatus } from '@prisma/client';

import { ClaimantConversationService } from './claimant-conversation.service';

/**
 * `GET /public/conversation/state` — the one thing the form needs that the chat
 * never did.
 *
 * The chat renders from the transcript, because one question at a time means
 * the newest bubble *is* the state. A form shows a whole section at once and
 * has to know which stage it is at, what has been answered and what the flow
 * will ask next. A logged-in claimant already gets that from `GET /cases/:id`
 * and `GET /cases/:id/flow`; a visitor has neither a case id nor a login, so
 * this mirrors the pair for the session.
 *
 * Two things are load-bearing and are what these tests defend: the stage has to
 * be derived from the conversation rather than guessed by the client, and no
 * document id may ever appear in the payload.
 */
describe('public conversation state', () => {
  const buildService = (
    binding: Record<string, unknown>,
    options: {
      lastOutbound?: { text: string | null; stepId: string | null } | null;
      caseDetail?: Record<string, unknown>;
    } = {}
  ) => {
    const prisma = {
      conversationBinding: { upsert: jest.fn().mockResolvedValue(binding) },
      conversationMessage: {
        findFirst: jest.fn().mockResolvedValue(options.lastOutbound ?? null),
      },
    };
    const gateway = {
      synthesiseStep: jest.fn().mockResolvedValue({
        id: '__claim-type',
        choices: [{ value: 'FLIGHT_DELAY', label: 'Flight delay' }],
      }),
    };
    const cases = {
      findOne: jest.fn().mockResolvedValue(
        options.caseDetail ?? { status: CaseStatus.IN_PROGRESS, documents: [] }
      ),
      getFlowForCase: jest.fn().mockResolvedValue({ entryStepId: 'claimant-name', steps: [] }),
    };
    const consent = {
      currentNotice: jest
        .fn()
        .mockResolvedValue({ title: 'How we handle your data', body: 'Full text', version: 3 }),
    };

    const service = new ClaimantConversationService(
      prisma as never,
      gateway as never,
      {} as never,
      cases as never,
      consent as never
    );
    return { service, prisma, gateway, cases, consent };
  };

  const identity = { sessionId: 'wf:abc', webChannel: CaseChannel.WEB_FORM };

  describe('stage', () => {
    it('is phone before a number has been given', async () => {
      const { service } = buildService({ id: 'b1', claimantId: null, pendingPhone: null });

      expect((await service.state(identity)).stage).toBe('phone');
    });

    it('is code once a number is waiting to be verified', async () => {
      const { service } = buildService({
        id: 'b1',
        claimantId: null,
        pendingPhone: '+60123456789',
      });

      expect((await service.state(identity)).stage).toBe('code');
    });

    it('is consent when the notice was the last thing asked', async () => {
      const { service } = buildService(
        { id: 'b1', claimantId: 'c1', activeCaseId: null, locale: 'en' },
        { lastOutbound: { text: 'Please read this', stepId: '__consent' } }
      );

      const state = await service.state(identity);
      expect(state.stage).toBe('consent');
      expect(state.consent).toEqual({
        title: 'How we handle your data',
        body: 'Full text',
        version: 3,
      });
    });

    it('is claim-type once consent is past but no case exists', async () => {
      const { service } = buildService(
        { id: 'b1', claimantId: 'c1', activeCaseId: null, locale: 'en' },
        { lastOutbound: { text: 'What has happened?', stepId: '__claim-type' } }
      );

      const state = await service.state(identity);
      expect(state.stage).toBe('claim-type');
      expect(state.claimTypes).toEqual([{ value: 'FLIGHT_DELAY', label: 'Flight delay' }]);
    });

    it('is flow while the claimant is still filling the case in', async () => {
      const { service } = buildService(
        { id: 'b1', claimantId: 'c1', activeCaseId: 'case-1', tenantId: 't1' },
        { caseDetail: { status: CaseStatus.IN_PROGRESS, documents: [] } }
      );

      expect((await service.state(identity)).stage).toBe('flow');
    });

    it.each([
      CaseStatus.SUBMITTED,
      CaseStatus.UNDER_REVIEW,
      CaseStatus.INFO_REQUESTED,
      CaseStatus.CONVERTED,
      CaseStatus.REJECTED,
    ])('is submitted once the request is in (%s)', async status => {
      const { service } = buildService(
        { id: 'b1', claimantId: 'c1', activeCaseId: 'case-1', tenantId: 't1' },
        { caseDetail: { status, documents: [] } }
      );

      expect((await service.state(identity)).stage).toBe('submitted');
    });

    it('is still flow on a DRAFT — nothing has been submitted', async () => {
      const { service } = buildService(
        { id: 'b1', claimantId: 'c1', activeCaseId: 'case-1', tenantId: 't1' },
        { caseDetail: { status: CaseStatus.DRAFT, documents: [] } }
      );

      expect((await service.state(identity)).stage).toBe('flow');
    });
  });

  describe('what an unverified visitor can learn', () => {
    /**
     * Nothing about any claim is said until a code is proved. The binding
     * carries no claimant before that, so there is nothing to say — but the
     * point is that this endpoint does not go looking either.
     */
    it('reads no case at all before verification', async () => {
      const { service, cases } = buildService({
        id: 'b1',
        claimantId: null,
        pendingPhone: null,
      });

      await service.state(identity);

      expect(cases.findOne).not.toHaveBeenCalled();
      expect(cases.getFlowForCase).not.toHaveBeenCalled();
    });
  });

  describe('documents', () => {
    const withDocument = () =>
      buildService(
        { id: 'b1', claimantId: 'c1', activeCaseId: 'case-1', tenantId: 't1' },
        {
          caseDetail: {
            status: CaseStatus.IN_PROGRESS,
            documents: [
              {
                id: 'doc-secret-id',
                fileName: 'boarding-pass.jpg',
                documentType: 'BOARDING_PASS',
                stepId: 'doc-boarding-pass',
                storagePath: 'cases/case-1/boarding-pass.jpg',
                createdAt: new Date('2026-08-14T10:00:00Z'),
              },
            ],
          },
        }
      );

    it('says a document exists, and what it was called', async () => {
      const { service } = withDocument();

      const state = await service.state(identity);
      expect(state.case!.documents).toEqual([
        {
          fileName: 'boarding-pass.jpg',
          documentType: 'BOARDING_PASS',
          stepId: 'doc-boarding-pass',
          createdAt: new Date('2026-08-14T10:00:00Z'),
        },
      ]);
    });

    /**
     * The id is removed, not merely unused. Every document read is staff-only,
     * so an id here would be a handle to an endpoint the holder cannot call —
     * useless today, and exactly the sort of thing a later change turns into a
     * public route by accident. Asserted against the serialised payload so a
     * nested copy cannot slip through.
     */
    it('never hands out a document id or a storage path', async () => {
      const { service } = withDocument();

      const serialised = JSON.stringify(await service.state(identity));
      expect(serialised).not.toContain('doc-secret-id');
      expect(serialised).not.toContain('storagePath');
      expect(serialised).not.toContain('cases/case-1/');
    });
  });

  describe('lastReply', () => {
    it("carries the bot's last word, which is the form's error text", async () => {
      const { service } = buildService(
        { id: 'b1', claimantId: 'c1', activeCaseId: null, locale: 'en' },
        { lastOutbound: { text: 'That date is before your trip started.', stepId: 'trip-end' } }
      );

      expect((await service.state(identity)).lastReply).toBe(
        'That date is before your trip started.'
      );
    });

    it('is null when the bot has not spoken', async () => {
      const { service } = buildService({ id: 'b1', claimantId: null, pendingPhone: null });

      expect((await service.state(identity)).lastReply).toBeNull();
    });
  });

  describe('locale', () => {
    it('follows the conversation', async () => {
      const { service } = buildService({ id: 'b1', claimantId: null, locale: 'ms' });

      expect((await service.state(identity)).locale).toBe('ms');
    });

    // Notices exist in exactly two languages; anything else reads English
    // rather than returning a stage the form cannot render.
    it('falls back to English for anything else', async () => {
      const { service } = buildService({ id: 'b1', claimantId: null, locale: 'zh' });

      expect((await service.state(identity)).locale).toBe('en');
    });
  });

  describe('reuse', () => {
    /**
     * The payloads must be the *same shapes* the authenticated endpoints
     * return, produced by the same methods — that is what stops the form
     * becoming a second description of a claim. Asserted by checking the
     * service methods are the ones called, with the claimant's own context.
     */
    it('reads through findOne and getFlowForCase as the claimant', async () => {
      const { service, cases } = buildService({
        id: 'b1',
        claimantId: 'claimant-1',
        activeCaseId: 'case-1',
        tenantId: 'tenant-1',
      });

      await service.state(identity);

      const expectedContext = expect.objectContaining({
        userId: 'claimant-1',
        userRole: 'CLAIMANT',
        tenantId: 'tenant-1',
        allowCrossTenant: false,
      });
      expect(cases.findOne).toHaveBeenCalledWith('case-1', expectedContext);
      expect(cases.getFlowForCase).toHaveBeenCalledWith('case-1', expectedContext);
    });
  });
});
