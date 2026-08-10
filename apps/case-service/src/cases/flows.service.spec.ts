import { FlowStatus, TravelClaimType } from '@prisma/client';
import { CASE_FLOWS, getFlow } from '@tci/shared-types';
import { FlowsService } from './flows.service';
import type { PrismaService } from '../config/prisma.service';

/**
 * FLOW SELECTION AND PINNING.
 *
 * Two rules carry the weight, and both fail invisibly if they break:
 *
 *  - Selection happens once. A Case walking a pinned version must keep walking
 *    it after someone publishes an edit, or a claimant mid-conversation is
 *    moved onto questions that were not there when they started.
 *  - Falling back to the built-in flow keeps unpinned Cases — every row created
 *    before flows became data — working exactly as before.
 */
describe('FlowsService', () => {
  const flightDelay = getFlow(TravelClaimType.FLIGHT_DELAY);

  const row = (over: Record<string, unknown> = {}) => ({
    id: 'def-platform',
    tenantId: null,
    key: 'travel-flight-delay',
    version: 1,
    status: FlowStatus.PUBLISHED,
    travelClaimType: TravelClaimType.FLIGHT_DELAY,
    entryStepId: flightDelay.entryStepId,
    steps: flightDelay.steps,
    ...over,
  });

  /** Prisma double that records the queries the service actually issues. */
  const makePrisma = (rows: Array<ReturnType<typeof row>>) => {
    const calls: Array<Record<string, unknown>> = [];
    const prisma = {
      flowDefinition: {
        findFirst: jest.fn(async ({ where, orderBy }: any) => {
          calls.push({ where, orderBy });
          const matches = rows
            .filter(
              r =>
                r.tenantId === (where.tenantId ?? null) &&
                r.travelClaimType === where.travelClaimType &&
                r.status === where.status
            )
            .sort((a, b) => b.version - a.version);
          return matches[0] ?? null;
        }),
        findUnique: jest.fn(async ({ where }: any) => rows.find(r => r.id === where.id) ?? null),
      },
    };
    return { prisma: prisma as unknown as PrismaService, calls, spy: prisma.flowDefinition };
  };

  describe('selectForNewCase', () => {
    it('returns the platform default and the pin to record', async () => {
      const { prisma } = makePrisma([row()]);
      const service = new FlowsService(prisma);

      const selected = await service.selectForNewCase(TravelClaimType.FLIGHT_DELAY, null);

      expect(selected.flowDefinitionId).toBe('def-platform');
      expect(selected.flowVersion).toBe(1);
      expect(selected.flow.entryStepId).toBe(flightDelay.entryStepId);
    });

    it("prefers a tenant's own flow over the platform default", async () => {
      const { prisma } = makePrisma([
        row(),
        row({ id: 'def-tenant', tenantId: 'tenant-a', key: 'travel-flight-delay-msig' }),
      ]);
      const service = new FlowsService(prisma);

      const selected = await service.selectForNewCase(TravelClaimType.FLIGHT_DELAY, 'tenant-a');
      expect(selected.flowDefinitionId).toBe('def-tenant');
    });

    it('falls back to the platform default for a tenant with no flow of its own', async () => {
      const { prisma } = makePrisma([
        row(),
        row({ id: 'def-tenant', tenantId: 'tenant-a' }),
      ]);
      const service = new FlowsService(prisma);

      const selected = await service.selectForNewCase(TravelClaimType.FLIGHT_DELAY, 'tenant-b');
      expect(selected.flowDefinitionId).toBe('def-platform');
    });

    it('picks the highest published version within a scope', async () => {
      const { prisma } = makePrisma([
        row({ id: 'v1', version: 1 }),
        row({ id: 'v3', version: 3 }),
        row({ id: 'v2', version: 2 }),
      ]);
      const service = new FlowsService(prisma);

      const selected = await service.selectForNewCase(TravelClaimType.FLIGHT_DELAY, null);
      expect(selected.flowVersion).toBe(3);
    });

    it('ignores drafts and archived rows', async () => {
      const { prisma } = makePrisma([
        row({ id: 'draft', version: 9, status: FlowStatus.DRAFT }),
        row({ id: 'archived', version: 8, status: FlowStatus.ARCHIVED }),
        row({ id: 'live', version: 2 }),
      ]);
      const service = new FlowsService(prisma);

      const selected = await service.selectForNewCase(TravelClaimType.FLIGHT_DELAY, null);
      expect(selected.flowDefinitionId).toBe('live');
    });

    it('falls back to the built-in flow with a null pin when nothing is published', async () => {
      const { prisma } = makePrisma([]);
      const service = new FlowsService(prisma);

      const selected = await service.selectForNewCase(TravelClaimType.MEDICAL, null);

      expect(selected.flowDefinitionId).toBeNull();
      expect(selected.flowVersion).toBeNull();
      expect(selected.flow).toEqual(CASE_FLOWS[TravelClaimType.MEDICAL]);
    });
  });

  describe('forCase', () => {
    it('honours the pin instead of re-selecting', async () => {
      // A newer version exists. A Case pinned to v1 must not drift onto it.
      const { prisma } = makePrisma([
        row({ id: 'v1', version: 1, entryStepId: 'policy-number' }),
        row({ id: 'v2', version: 2, entryStepId: 'something-else' }),
      ]);
      const service = new FlowsService(prisma);

      const flow = await service.forCase({
        flowDefinitionId: 'v1',
        travelClaimType: TravelClaimType.FLIGHT_DELAY,
      });

      expect(flow.entryStepId).toBe('policy-number');
    });

    it('uses the built-in flow for a Case created before flows became data', async () => {
      const { prisma, spy } = makePrisma([row()]);
      const service = new FlowsService(prisma);

      const flow = await service.forCase({
        flowDefinitionId: null,
        travelClaimType: TravelClaimType.LUGGAGE_LOSS,
      });

      expect(flow).toEqual(CASE_FLOWS[TravelClaimType.LUGGAGE_LOSS]);
      expect(spy.findUnique).not.toHaveBeenCalled();
    });

    it('keeps the claimant moving when a pinned flow has vanished', async () => {
      const { prisma } = makePrisma([]);
      const service = new FlowsService(prisma);
      const error = jest.spyOn(service['logger'], 'error').mockImplementation(() => undefined);

      const flow = await service.forCase({
        flowDefinitionId: 'deleted-somehow',
        travelClaimType: TravelClaimType.FLIGHT_DELAY,
      });

      expect(flow).toEqual(CASE_FLOWS[TravelClaimType.FLIGHT_DELAY]);
      // Falling back silently would hide a real inconsistency.
      expect(error).toHaveBeenCalled();
    });

    it('serves repeat turns from cache rather than re-querying', async () => {
      const { prisma, spy } = makePrisma([row({ id: 'cached' })]);
      const service = new FlowsService(prisma);
      const caseRow = {
        flowDefinitionId: 'cached',
        travelClaimType: TravelClaimType.FLIGHT_DELAY,
      };

      await service.forCase(caseRow);
      await service.forCase(caseRow);
      await service.forCase(caseRow);

      expect(spy.findUnique).toHaveBeenCalledTimes(1);
    });

    it('re-reads after the cache is cleared', async () => {
      const { prisma, spy } = makePrisma([row({ id: 'cached' })]);
      const service = new FlowsService(prisma);
      const caseRow = {
        flowDefinitionId: 'cached',
        travelClaimType: TravelClaimType.FLIGHT_DELAY,
      };

      await service.forCase(caseRow);
      service.clearCache();
      await service.forCase(caseRow);

      expect(spy.findUnique).toHaveBeenCalledTimes(2);
    });

    it('logs a stored flow that fails validation rather than serving it silently', async () => {
      const broken = row({
        id: 'broken',
        steps: [
          {
            id: 'policy-number',
            prompt: 'p',
            label: 'l',
            answerType: 'text',
            next: { type: 'step', stepId: 'ghost' },
          },
        ],
      });
      const { prisma } = makePrisma([broken]);
      const service = new FlowsService(prisma);
      const error = jest.spyOn(service['logger'], 'error').mockImplementation(() => undefined);

      await service.forCase({
        flowDefinitionId: 'broken',
        travelClaimType: TravelClaimType.FLIGHT_DELAY,
      });

      expect(error).toHaveBeenCalledWith(expect.stringContaining('failed validation on load'));
    });
  });
});
