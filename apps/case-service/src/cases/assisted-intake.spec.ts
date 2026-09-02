import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CaseStatus, ConsentChannel, ConsentPurpose } from '@prisma/client';

import { CasesService } from './cases.service';
import { ConsentService } from '../consent/consent.service';

/**
 * Agent-assisted intake — the three server-side rules that make it work.
 *
 * An agent fills in the claimant's own form from a staff address. Everything
 * from *Claim type* to *Review* is the identical code path a claimant walks;
 * what differs is who is signed in, where the case is routed, and how consent
 * was obtained. These are the tests for that difference.
 */

describe('a staff member may finish the draft they are filling in', () => {
  const service = Object.create(CasesService.prototype) as CasesService;

  const agent = { userId: 'agent-1', tenantId: 'insurer-1', userRole: 'FIRM_ADMIN' } as never;
  const routedElsewhere = {
    tenantId: 'pacific-1',
    claimantId: 'claimant-1',
    createdByUserId: 'agent-1',
  };

  /**
   * The case is routed to the handling firm the moment it is created, so
   * without this rule an insurer's agent is locked out at the *second section*
   * — not after submitting. The feature would not work at all.
   */
  it.each([CaseStatus.DRAFT, CaseStatus.IN_PROGRESS])(
    'lets the creator carry on while the request is %s',
    status => {
      expect(() =>
        service.assertAccess({ ...routedElsewhere, status }, agent)
      ).not.toThrow();
    }
  );

  /**
   * The exception lapses at submit. That is the handover the confirmation
   * screen describes: the request now belongs to the handling firm, and the
   * agent who typed it cannot read back what that firm is working on.
   */
  it.each([
    CaseStatus.SUBMITTED,
    CaseStatus.UNDER_REVIEW,
    CaseStatus.INFO_REQUESTED,
    CaseStatus.CONVERTED,
    CaseStatus.REJECTED,
  ])('closes once the request is %s', status => {
    expect(() => service.assertAccess({ ...routedElsewhere, status }, agent)).toThrow(
      NotFoundException
    );
  });

  it('is personal — a colleague at the same firm gains nothing', () => {
    const colleague = {
      userId: 'agent-2',
      tenantId: 'insurer-1',
      userRole: 'FIRM_ADMIN',
    } as never;

    expect(() =>
      service.assertAccess({ ...routedElsewhere, status: CaseStatus.DRAFT }, colleague)
    ).toThrow(NotFoundException);
  });

  it('does not open a case nobody is recorded as creating', () => {
    expect(() =>
      service.assertAccess(
        { tenantId: 'pacific-1', claimantId: 'c1', createdByUserId: null, status: CaseStatus.DRAFT },
        agent
      )
    ).toThrow(NotFoundException);
  });

  // The rule is an addition, not a loosening. Ordinary cross-tenant reads are
  // still a 404, and this is what proves the new clause did not swallow them.
  it('still refuses another firm’s case the agent had no hand in', () => {
    expect(() =>
      service.assertAccess(
        {
          tenantId: 'pacific-1',
          claimantId: 'c1',
          createdByUserId: 'someone-else',
          status: CaseStatus.DRAFT,
        },
        agent
      )
    ).toThrow(NotFoundException);
  });

  it('leaves same-tenant access exactly as it was', () => {
    expect(() =>
      service.assertAccess(
        { tenantId: 'insurer-1', claimantId: 'c1', status: CaseStatus.CONVERTED },
        agent
      )
    ).not.toThrow();
  });

  it('leaves a claimant reading their own case exactly as it was', () => {
    const claimant = { userId: 'claimant-1', tenantId: 'x', userRole: 'CLAIMANT' } as never;

    expect(() =>
      service.assertAccess({ tenantId: 'pacific-1', claimantId: 'claimant-1' }, claimant)
    ).not.toThrow();
    expect(() =>
      service.assertAccess({ tenantId: 'pacific-1', claimantId: 'someone-else' }, claimant)
    ).toThrow(NotFoundException);
  });
});

describe('an attested verbal consent must name who attested it', () => {
  const buildConsent = () => {
    const create = jest.fn().mockResolvedValue({ id: 'consent-1' });
    const prisma = {
      consentNotice: { findFirst: jest.fn() },
      consent: { findFirst: jest.fn().mockResolvedValue(null), create },
    };
    const service = new ConsentService(prisma as never, { record: jest.fn() } as never);
    // The approved-notice lookup has its own tests; here it only needs to
    // succeed so the write below is the thing under examination.
    (service as unknown as { currentNotice: jest.Mock }).currentNotice = jest
      .fn()
      .mockResolvedValue({ id: 'notice-3', version: 3 });
    return { service, create };
  };

  const base = { claimantId: 'claimant-1', purpose: ConsentPurpose.CLAIM_PROCESSING };

  /**
   * The one thing an attestation must never be is anonymous. Without a
   * capturer the record asserts that consent was obtained while naming nobody
   * who says so — which is not evidence of anything.
   */
  it('refuses an anonymous attestation', async () => {
    const { service } = buildConsent();

    await expect(
      service.grant({ ...base, capturedVia: ConsentChannel.VERBAL_AGENT_ATTESTED })
    ).rejects.toThrow(BadRequestException);
  });

  it('records the attesting user and how they spoke', async () => {
    const { service, create } = buildConsent();

    await service.grant({
      ...base,
      capturedVia: ConsentChannel.VERBAL_AGENT_ATTESTED,
      capturedByUserId: 'agent-1',
      attestation: {
        interactionChannel: 'PHONE',
        interactionReference: 'CALL-2026-08-14-1042',
        attestedByTenantId: 'insurer-1',
      },
    });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          capturedVia: ConsentChannel.VERBAL_AGENT_ATTESTED,
          capturedByUserId: 'agent-1',
          noticeId: 'notice-3',
          metadata: {
            interactionChannel: 'PHONE',
            interactionReference: 'CALL-2026-08-14-1042',
            attestedByTenantId: 'insurer-1',
          },
        }),
      })
    );
  });

  /**
   * `STAFF_CAPTURED` reads equally as "staff typed it while the claimant
   * watched the screen". Only the attested value rests entirely on an agent's
   * word, and the two must stay distinguishable in the data rather than
   * inferred from who captured it.
   */
  it('is a different value from staff capture, and stays that way', async () => {
    const { service, create } = buildConsent();

    await service.grant({
      ...base,
      capturedVia: ConsentChannel.STAFF_CAPTURED,
      capturedByUserId: 'agent-1',
    });

    expect(create.mock.calls[0][0].data.capturedVia).toBe(ConsentChannel.STAFF_CAPTURED);
    expect(create.mock.calls[0][0].data.capturedVia).not.toBe(
      ConsentChannel.VERBAL_AGENT_ATTESTED
    );
  });

  it('leaves a claimant’s own consent unattributed to any capturer', async () => {
    const { service, create } = buildConsent();

    await service.grant({ ...base, capturedVia: ConsentChannel.WEB_FORM });

    expect(create.mock.calls[0][0].data.capturedByUserId).toBeUndefined();
    expect(create.mock.calls[0][0].data.metadata).toBeUndefined();
  });
});
