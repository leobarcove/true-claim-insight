import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { TenantContext } from '../guards/tenant.guard';
import { TenantScope } from '../decorators/tenant.decorator';
import { ReportsService } from '../../reports/reports.service';
import { QualityReviewService } from '../../reports/quality-review.service';
import { QuantumService } from '../../quantum/quantum.service';
import { AssessmentService } from '../../assessment/assessment.service';
import { AssignmentsService } from '../../assignments/assignments.service';
import { ClaimsService } from '../../claims/claims.service';
import { ComplianceEventsService } from '../../compliance/compliance-events.service';
import { ComplianceEventsController } from '../../compliance/compliance-events.controller';
import { BnmNotificationsService } from '../../compliance/bnm-notifications.service';
import { KeyPersonsService } from '../../compliance/key-persons.service';
import { KeyPersonsController } from '../../compliance/key-persons.controller';
import { ConflictsService } from '../../adjusters/conflicts.service';
import { AdjustersController } from '../../adjusters/adjusters.controller';

/**
 * The access rules `@Roles` cannot express (common/access/access-rules.ts),
 * asserted at the services that apply them:
 *
 *  1. Independence — an insurer reads the adjuster's work, never writes it
 *     (BNM Adjuster PD 1.1, 12.1(c)).
 *  2. The firm's own registers — PD 10, 11.2(d), 13 — are scoped to the firm
 *     and closed to insurers.
 *  3. Separation of duties — nobody acts on themselves.
 *
 * Each rule is checked before any record is read, so the services are built
 * bare (`Object.create`) where the refusal must come first: if the rule were
 * moved after a lookup, the missing dependency would fail the test.
 */

const context = (overrides: Partial<TenantContext>): TenantContext => ({
  tenantId: 'firm-a',
  tenantType: 'ADJUSTING_FIRM',
  userId: 'user-admin',
  userRole: 'FIRM_ADMIN',
  scope: TenantScope.STRICT,
  allowCrossTenant: false,
  ...overrides,
});

const firm = context({});
const insurer = context({ tenantId: 'insurer-x', tenantType: 'INSURER' });
const otherFirm = context({ tenantId: 'firm-b' });

const bare = <T extends object>(ctor: { prototype: T }, fields: Record<string, unknown> = {}): T =>
  Object.assign(Object.create(ctor.prototype), fields);

describe('independence — the insurer reads, the adjusting firm writes', () => {
  it.each([
    ['writing a report', () => bare(ReportsService).create('claim-1', 'FINAL' as never, insurer)],
    ['submitting a report', () => bare(ReportsService).submitForReview('report-1', insurer)],
    ['signing a report', () => bare(ReportsService).sign('report-1', insurer)],
    ['withdrawing a report', () => bare(ReportsService).withdraw('report-1', 'x', insurer)],
    ['preparing quantum', () => bare(QuantumService).create('claim-1', {} as never, insurer)],
    ['deciding the assessment mode', () => bare(AssessmentService).decide('claim-1', insurer)],
    [
      'escalating the assessment mode',
      () => bare(AssessmentService).escalate('claim-1', 'x' as never, insurer),
    ],
    ['declining an appointment', () => bare(AssignmentsService).decline('a-1', 'x', insurer)],
    ['completing an appointment', () => bare(AssignmentsService).complete('a-1', insurer)],
    [
      'quality-reviewing a report',
      () => bare(QualityReviewService).review('report-1', { rating: 'GOOD' as never }, insurer),
    ],
    [
      'setting the loss figure on a claim',
      () => bare(ClaimsService).update('claim-1', { estimatedLossAmount: 1 } as never, insurer),
    ],
  ])('refuses an insurer %s', async (_act, attempt) => {
    await expect(attempt()).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('lets an insurer correct the claim facts it notified', async () => {
    const reached = new Error('passed the independence rule');
    const claims = bare(ClaimsService, {
      findOne: jest.fn(async () => {
        throw reached;
      }),
    });
    await expect(
      claims.update('claim-1', { description: 'corrected' } as never, insurer)
    ).rejects.toBe(reached);
  });

  it('refuses a firm that is not the appointed one, as absence', async () => {
    const assignments = bare(AssignmentsService, {
      load: jest.fn(async () => ({ handlingTenantId: 'firm-a', insurerTenantId: 'insurer-x' })),
    });
    await expect(assignments.decline('a-1', 'x', otherFirm)).rejects.toBeInstanceOf(
      NotFoundException
    );
  });

  it("refuses another firm's quality review of a report, as absence", async () => {
    const quality = new QualityReviewService(
      {
        adjusterReport: {
          findUnique: jest.fn(async () => ({ id: 'report-1', author: { tenantId: 'firm-a' } })),
        },
      } as never,
      { record: jest.fn() } as never
    );
    await expect(
      quality.review('report-1', { rating: 'GOOD' as never }, otherFirm)
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe("the firm's own registers (PD 10, 11.2(d), 13)", () => {
  const events = () => {
    const prisma = {
      complianceEvent: {
        findMany: jest.fn(async (_args: { where: unknown }) => []),
        findFirst: jest.fn(async () => null),
        create: jest.fn(async ({ data }: any) => ({ id: 'event-1', ...data })),
        updateMany: jest.fn(),
      },
    };
    return {
      prisma,
      service: new ComplianceEventsService(prisma as never, { record: jest.fn() } as never),
    };
  };

  it('lists only the caller firm’s events', async () => {
    const { prisma, service } = events();
    await service.list(firm);
    expect(prisma.complianceEvent.findMany.mock.calls[0]![0].where).toEqual({ tenantId: 'firm-a' });
  });

  it("reports only the caller firm's events to its Board", async () => {
    const { prisma, service } = events();
    await service.boardReport(firm);
    expect(prisma.complianceEvent.findMany.mock.calls[0]![0].where).toEqual({
      tenantId: 'firm-a',
      boardReportedAt: null,
    });
  });

  it("answers another firm's event as absent", async () => {
    const { service } = events();
    await expect(service.resolve('event-1', 'dealt with', otherFirm)).rejects.toBeInstanceOf(
      NotFoundException
    );
  });

  it('files every raised event against a firm', async () => {
    const { prisma, service } = events();
    await service.raise({
      tenantId: 'firm-a',
      type: 'POLICY_BREACH' as never,
      severity: 'HIGH' as never,
      title: 't',
      source: 'test',
    });
    expect(prisma.complianceEvent.create.mock.calls[0][0].data.tenantId).toBe('firm-a');
  });

  it("closes the registers to an insurer's compliance officer", () => {
    const officer = context({
      tenantId: 'insurer-x',
      tenantType: 'INSURER',
      userRole: 'COMPLIANCE_OFFICER',
    });
    const eventsController = new ComplianceEventsController({} as never);
    const personsController = new KeyPersonsController({} as never);
    expect(() => eventsController.list(officer)).toThrow(ForbiddenException);
    expect(() => eventsController.boardReport(officer)).toThrow(ForbiddenException);
    expect(() => personsController.list(officer)).toThrow(ForbiddenException);
  });

  it("answers another firm's BNM notification as absent", async () => {
    const service = new BnmNotificationsService(
      { bnmNotification: { findFirst: jest.fn(async () => null) } } as never,
      { record: jest.fn() } as never
    );
    await expect(service.markNotified('n-1', 'REF-1', otherFirm)).rejects.toBeInstanceOf(
      NotFoundException
    );
  });

  it('registers a key person to the firm, and drafts the PD 13.1 notice to the same firm', async () => {
    const prisma = {
      keyPerson: { create: jest.fn(async ({ data }: any) => ({ id: 'kp-1', ...data })) },
    };
    const bnm = { draft: jest.fn() };
    const service = new KeyPersonsService(
      prisma as never,
      { record: jest.fn() } as never,
      {} as never,
      bnm as never
    );
    await service.create(
      { fullName: 'Aminah', type: 'KRP' as never, appointedAt: '2026-09-01' },
      firm
    );
    expect(prisma.keyPerson.create.mock.calls[0][0].data.tenantId).toBe('firm-a');
    expect(bnm.draft.mock.calls[0][1]).toBe('firm-a');
  });
});

describe('separation of duties', () => {
  const declaration = {
    id: 'decl-1',
    declaredByUserId: 'user-declarer',
    resolvedAt: null,
    adjuster: { tenantId: 'firm-a', userId: 'user-adjuster' },
  };
  const conflicts = () =>
    bare(ConflictsService, {
      prisma: {
        conflictDeclaration: {
          findUnique: jest.fn(async () => declaration),
          update: jest.fn(async () => ({})),
        },
      },
      audit: { record: jest.fn() },
    });

  it.each([
    ['who declared it', 'user-declarer'],
    ['whom it concerns', 'user-adjuster'],
  ])('refuses a conflict resolved by the person %s', async (_who, userId) => {
    await expect(
      conflicts().resolve('decl-1', 'divested', context({ userId }))
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('accepts a resolution by someone else in the firm', async () => {
    await expect(conflicts().resolve('decl-1', 'divested', firm)).resolves.toBeDefined();
  });

  it("answers another firm's declaration as absent", async () => {
    await expect(conflicts().resolve('decl-1', 'divested', otherFirm)).rejects.toBeInstanceOf(
      NotFoundException
    );
  });

  it.each([
    [
      'recognise themselves as senior',
      (c: AdjustersController, ctx: TenantContext) =>
        c.recogniseSenior('adj-1', 'TRAVEL' as never, ctx),
    ],
    [
      'verify their own licence',
      (c: AdjustersController, ctx: TenantContext) => c.verifyLicence('adj-1', ctx),
    ],
    [
      'record their own competency',
      (c: AdjustersController, ctx: TenantContext) =>
        c.upsertCompetency('adj-1', 'TRAVEL' as never, { yearsInSubject: 9 }, ctx),
    ],
  ])('refuses an administrator who would %s', async (_act, attempt) => {
    const adjustersService = {
      requireInTenant: jest.fn(async () => ({
        id: 'adj-1',
        userId: 'user-admin',
        tenantId: 'firm-a',
      })),
    };
    const competency = {
      recogniseSenior: jest.fn(),
      verifyLicence: jest.fn(),
      upsert: jest.fn(),
    };
    const controller = new AdjustersController(
      adjustersService as never,
      competency as never,
      {} as never,
      {} as never,
      {} as never
    );
    await expect(attempt(controller, firm)).rejects.toBeInstanceOf(ForbiddenException);
    expect(competency.recogniseSenior).not.toHaveBeenCalled();
    expect(competency.verifyLicence).not.toHaveBeenCalled();
    expect(competency.upsert).not.toHaveBeenCalled();
  });
});
