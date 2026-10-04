import { BadRequestException } from '@nestjs/common';
import { CaseStatus, TravelClaimType } from '@prisma/client';
import { missingSteps, type CaseFlow } from '@tci/shared-types';
import { CasesService } from './cases.service';

/**
 * Staff attaching evidence through the corrections door.
 *
 * The portal's upload used to store a file with a document type and nothing
 * else. The checklist — which matches on type — ticked, while the submit guard
 * — which reads `answers` — still listed every document as missing, so an
 * operator looking at "3/3 mandatory uploaded" was refused with all three named.
 *
 * The portal now uploads against a step and then answers that step with the
 * stored id through `correctAnswer`. These tests pin the server half: the id
 * is accepted only when it names a live upload already filed against that
 * step on that case, the answer is audited, and the claimant's cursor stays put.
 */
describe('correctAnswer — attaching an uploaded document to its step', () => {
  const tenantContext = {
    tenantId: 'tenant-1',
    userId: 'staff-1',
    userRole: 'FIRM_ADMIN',
  } as never;

  const flow: CaseFlow = {
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
  } as never;

  const build = (documents: Array<Record<string, unknown>>) => {
    const caseRow = {
      id: 'case-1',
      tenantId: 'tenant-1',
      claimantId: 'claimant-1',
      status: CaseStatus.IN_PROGRESS,
      travelClaimType: TravelClaimType.FLIGHT_DELAY,
      flowDefinitionId: null,
      currentStepId: 'trip-start-date',
      answers: {} as Record<string, unknown>,
      policy: null,
    };
    const prisma = {
      case: {
        findUnique: jest.fn(async () => caseRow),
        update: jest.fn(async ({ data }: any) => Object.assign(caseRow, data)),
      },
      caseDocument: {
        findFirst: jest.fn(
          async ({ where }: any) =>
            documents.find(
              document =>
                document.id === where.id &&
                document.caseId === where.caseId &&
                document.stepId === where.stepId &&
                document.supersededAt === null
            ) ?? null
        ),
      },
    };
    const audit = { record: jest.fn(async () => undefined) };
    const flows = { forCase: jest.fn(async () => flow) };
    const service = new CasesService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      audit as never,
      {} as never,
      flows as never,
      {} as never,
      {} as never,
      { on: jest.fn(), emit: jest.fn() } as never,
      {} as never
    );
    return { service, prisma, audit, caseRow };
  };

  it('answers the step with the document id, so submit no longer lists it as missing', async () => {
    const { service, caseRow, audit } = build([
      { id: 'doc-1', caseId: 'case-1', stepId: 'doc-boarding-pass', supersededAt: null },
    ]);
    expect(missingSteps(flow, caseRow.answers as never).map(s => s.id)).toEqual([
      'doc-boarding-pass',
    ]);

    const result = await service.correctAnswer(
      'case-1',
      { stepId: 'doc-boarding-pass', value: 'doc-1' } as never,
      tenantContext
    );

    expect(result.accepted).toBe(true);
    expect(caseRow.answers).toEqual({ 'doc-boarding-pass': 'doc-1' });
    expect(missingSteps(flow, caseRow.answers as never)).toEqual([]);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'CASE_ANSWER_CORRECTED', actorId: 'staff-1' })
    );
  });

  it('leaves the claimant’s conversational cursor where it was', async () => {
    const { service, caseRow } = build([
      { id: 'doc-1', caseId: 'case-1', stepId: 'doc-boarding-pass', supersededAt: null },
    ]);

    await service.correctAnswer(
      'case-1',
      { stepId: 'doc-boarding-pass', value: 'doc-1' } as never,
      tenantContext
    );

    expect(caseRow.currentStepId).toBe('trip-start-date');
  });

  it.each([
    ['an id that is not on this case', { id: 'doc-1', caseId: 'case-2', stepId: 'doc-boarding-pass', supersededAt: null }],
    ['a file filed with no step', { id: 'doc-1', caseId: 'case-1', stepId: null, supersededAt: null }],
    ['a superseded upload', { id: 'doc-1', caseId: 'case-1', stepId: 'doc-boarding-pass', supersededAt: new Date() }],
  ])('refuses %s — the step must not read as answered without the evidence', async (_, document) => {
    const { service, prisma, caseRow } = build([document]);

    await expect(
      service.correctAnswer(
        'case-1',
        { stepId: 'doc-boarding-pass', value: 'doc-1' } as never,
        tenantContext
      )
    ).rejects.toThrow(BadRequestException);
    expect(prisma.case.update).not.toHaveBeenCalled();
    expect(caseRow.answers).toEqual({});
  });
});
