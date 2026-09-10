import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CaseStatus, TravelClaimType } from '@prisma/client';
import type { CaseFlow } from '@tci/shared-types';
import { CasesService } from './cases.service';

/**
 * `removeDocument` is the one place a claimant can make a piece of evidence
 * disappear from the live checklist on their own, so it gets its own
 * mutation-level coverage rather than riding along with the upload tests:
 *
 *  - it must refuse outright on any step that is not `allowMultiple`, or a
 *    required document could be removed with nothing to replace it;
 *  - what it does on a step that allows it must be a retire (`supersededAt`
 *    set), never a hard delete — PD 12.8 is what every other document path
 *    in this service already respects, and this one is no exception.
 */
describe('removeDocument — the multi-photo exception, not a general delete', () => {
  const tenantContext = {
    tenantId: 'tenant-1',
    userId: 'claimant-1',
    userRole: 'CLAIMANT',
  } as never;

  const multiPhotoFlow: CaseFlow = {
    entryStepId: 'doc-damage-photo',
    steps: [
      {
        id: 'doc-damage-photo',
        prompt: 'Please upload clear photographs of the damaged luggage.',
        label: 'Damage photographs',
        answerType: 'document',
        documentType: 'DAMAGE_PHOTO',
        allowMultiple: true,
        next: { type: 'end' },
      },
      {
        id: 'doc-baggage-tag',
        prompt: 'Please upload a photo of the baggage tag.',
        label: 'Baggage tag',
        answerType: 'document',
        documentType: 'BAGGAGE_TAG',
        next: { type: 'end' },
      },
    ],
  } as never;

  const caseRow = {
    id: 'case-1',
    tenantId: 'tenant-1',
    claimantId: 'claimant-1',
    status: CaseStatus.DRAFT,
    travelClaimType: TravelClaimType.LUGGAGE_DAMAGE,
    flowDefinitionId: null,
    currentStepId: null,
    policy: null,
  };

  const build = (documents: Array<Record<string, unknown>>) => {
    const prisma = {
      case: {
        findUnique: jest.fn(async () => caseRow),
        findUniqueOrThrow: jest.fn(async () => caseRow),
      },
      caseDocument: {
        findFirst: jest.fn(async ({ where }: any) =>
          documents.find(
            document =>
              document.id === where.id &&
              document.caseId === where.caseId &&
              document.supersededAt === null
          ) ?? null
        ),
        update: jest.fn(async ({ where, data }: any) => {
          const document = documents.find(d => d.id === where.id);
          Object.assign(document!, data);
          return document;
        }),
      },
    };
    const audit = { record: jest.fn(async () => undefined) };
    const flows = { forCase: jest.fn(async () => multiPhotoFlow) };
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
    return { service, prisma, audit };
  };

  it('retires one photo on a multi-photo step, leaving the others alone', async () => {
    const documents = [
      { id: 'doc-1', caseId: 'case-1', stepId: 'doc-damage-photo', supersededAt: null },
      { id: 'doc-2', caseId: 'case-1', stepId: 'doc-damage-photo', supersededAt: null },
    ];
    const { service, prisma, audit } = build(documents);

    await service.removeDocument('case-1', 'doc-1', tenantContext);

    expect(documents[0].supersededAt).not.toBeNull();
    expect(documents[1].supersededAt).toBeNull();
    expect(prisma.caseDocument.update).toHaveBeenCalledTimes(1);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        entityId: 'case-1',
        action: 'CASE_DOCUMENT_REMOVED',
        oldValues: expect.objectContaining({ documentId: 'doc-1' }),
      })
    );
  });

  it('refuses on a step that is not allowMultiple — this is not a general delete door', async () => {
    const documents = [
      { id: 'doc-3', caseId: 'case-1', stepId: 'doc-baggage-tag', supersededAt: null },
    ];
    const { service, prisma } = build(documents);

    await expect(service.removeDocument('case-1', 'doc-3', tenantContext)).rejects.toThrow(
      BadRequestException
    );
    expect(documents[0].supersededAt).toBeNull();
    expect(prisma.caseDocument.update).not.toHaveBeenCalled();
  });

  it('refuses a document id that is not live on this case', async () => {
    const { service } = build([
      { id: 'doc-1', caseId: 'case-1', stepId: 'doc-damage-photo', supersededAt: null },
    ]);

    await expect(
      service.removeDocument('case-1', 'not-a-real-id', tenantContext)
    ).rejects.toThrow(NotFoundException);
  });

  it('refuses a document already superseded — it is not live to take back', async () => {
    const { service } = build([
      {
        id: 'doc-1',
        caseId: 'case-1',
        stepId: 'doc-damage-photo',
        supersededAt: new Date('2026-08-01'),
      },
    ]);

    await expect(service.removeDocument('case-1', 'doc-1', tenantContext)).rejects.toThrow(
      NotFoundException
    );
  });
});
