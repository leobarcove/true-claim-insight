import { Injectable, Logger } from '@nestjs/common';
import {
  CASE_FLOWS,
  getFlow,
  validateFlowDefinition,
  type CaseFlow,
  type FlowStep,
  type TravelClaimTypeLike,
} from '@tci/shared-types';
import { FlowStatus, TravelClaimType } from '@prisma/client';
import { PrismaService } from '../config/prisma.service';

/** What a new Case needs: the flow to walk, and the pin to record against it. */
export interface SelectedFlow {
  flow: CaseFlow;
  /** Null when no published row exists and the built-in flow is being used. */
  flowDefinitionId: string | null;
  flowVersion: number | null;
}

interface CacheEntry {
  flow: CaseFlow;
  expiresAt: number;
}

/**
 * Reads intake flows from FlowDefinition rows, falling back to the built-in
 * CASE_FLOWS.
 *
 * Two lookups, deliberately distinct:
 *
 *  - `selectForNewCase` runs once, at creation, and decides which flow this
 *    conversation will walk. The answer is pinned onto the Case.
 *  - `forCase` runs on every subsequent turn and honours that pin. It never
 *    re-selects, because re-selecting is exactly the bug the pin exists to
 *    prevent: publishing an edit would otherwise rewrite a conversation
 *    already in flight, moving the claimant to a step that was not there when
 *    they started.
 *
 * The fallback to CASE_FLOWS is what keeps rows created before flows became
 * data working, and what keeps the service running if the seed has not been
 * applied. It is a compatibility path, not a preference — a null pin on a new
 * Case means no flow was published for that claim type, which is worth seeing
 * in the logs.
 */
@Injectable()
export class FlowsService {
  private readonly logger = new Logger(FlowsService.name);
  private readonly cache = new Map<string, CacheEntry>();

  /**
   * Short rather than indefinite. A PUBLISHED row is meant to be immutable, so
   * caching forever would be sound in theory — but the seed refreshes version 1
   * in place, and a developer who re-seeds and then sees stale wording for the
   * rest of the day loses more time than the query costs.
   */
  private static readonly CACHE_TTL_MS = 60_000;

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Choose the flow a new Case should walk.
   *
   * A tenant's own published flow shadows the platform default for that tenant
   * alone; within either scope the highest version wins. Falls back to the
   * built-in flow when nothing is published.
   */
  async selectForNewCase(
    travelClaimType: TravelClaimTypeLike,
    tenantId: string | null
  ): Promise<SelectedFlow> {
    const type = travelClaimType as TravelClaimType;

    // Tenant-specific first, then the platform default. Two explicit queries
    // rather than one with NULLS-ordering: the precedence is a rule someone
    // will need to read, and an ORDER BY clause hides it.
    const row =
      (tenantId
        ? await this.prisma.flowDefinition.findFirst({
            where: { tenantId, travelClaimType: type, status: FlowStatus.PUBLISHED },
            orderBy: { version: 'desc' },
          })
        : null) ??
      (await this.prisma.flowDefinition.findFirst({
        where: { tenantId: null, travelClaimType: type, status: FlowStatus.PUBLISHED },
        orderBy: { version: 'desc' },
      }));

    if (!row) {
      this.logger.warn(
        `No published flow for ${type}; using the built-in definition. ` +
          'Run the seed to publish the platform defaults.'
      );
      return { flow: getFlow(travelClaimType), flowDefinitionId: null, flowVersion: null };
    }

    return {
      flow: this.hydrate(row.id, row.entryStepId, row.steps, type),
      flowDefinitionId: row.id,
      flowVersion: row.version,
    };
  }

  /**
   * The flow an existing Case is walking — the version pinned at creation, or
   * the built-in flow for a Case created before flows became data.
   */
  async forCase(caseRow: {
    flowDefinitionId: string | null;
    travelClaimType: TravelClaimType | string | null;
  }): Promise<CaseFlow> {
    if (!caseRow.flowDefinitionId) {
      return getFlow(caseRow.travelClaimType as TravelClaimTypeLike);
    }

    const cached = this.cache.get(caseRow.flowDefinitionId);
    if (cached && cached.expiresAt > Date.now()) return cached.flow;

    const row = await this.prisma.flowDefinition.findUnique({
      where: { id: caseRow.flowDefinitionId },
    });

    if (!row) {
      // A pinned row that has gone missing. Falling back keeps the claimant
      // moving, but it is a real inconsistency — the conversation may now
      // diverge from the one they started, so it is logged loudly rather than
      // absorbed.
      this.logger.error(
        `Case pins flow ${caseRow.flowDefinitionId}, which no longer exists. ` +
          'Falling back to the built-in flow; the conversation may not match what was started.'
      );
      return getFlow(caseRow.travelClaimType as TravelClaimTypeLike);
    }

    return this.hydrate(
      row.id,
      row.entryStepId,
      row.steps,
      row.travelClaimType as TravelClaimType
    );
  }

  /** Testing seam — the cache is process-local and survives between requests. */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Turn a stored row into a CaseFlow, checking it on the way in.
   *
   * Validation runs on cache fill rather than per turn, so the cost is once a
   * minute per flow. It is worth paying: a row corrupted by a bad edit or a
   * partial migration otherwise produces a conversation that dead-ends with
   * nothing in the logs, and the first person to notice is a claimant.
   */
  private hydrate(
    id: string,
    entryStepId: string,
    steps: unknown,
    travelClaimType: TravelClaimType
  ): CaseFlow {
    const flow: CaseFlow = {
      travelClaimType: travelClaimType as unknown as CaseFlow['travelClaimType'],
      entryStepId,
      steps: steps as FlowStep[],
    };

    const reference = CASE_FLOWS[travelClaimType as keyof typeof CASE_FLOWS];
    const problems = validateFlowDefinition(flow, reference);
    if (problems.length > 0) {
      this.logger.error(
        `Stored flow ${id} failed validation on load:\n` +
          problems.map(problem => `  - [${problem.kind}] ${problem.detail}`).join('\n')
      );
    }

    this.cache.set(id, { flow, expiresAt: Date.now() + FlowsService.CACHE_TTL_MS });
    return flow;
  }
}
