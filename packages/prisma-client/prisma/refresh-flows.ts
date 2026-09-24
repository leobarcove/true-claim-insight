/**
 * Republish the built-in travel flows, and nothing else.
 *
 * Intake flows are **data**: `flow_definitions` holds a PUBLISHED row per claim
 * type and `CASE_FLOWS` is the fallback the service uses only when nothing is
 * published. So editing a flow in the package changes what a *fresh* database
 * would get and nothing about a running one — which is a quiet way to be
 * wrong, because the code, the tests and the types all agree while the server
 * serves something else. It cost an afternoon once: placeholders added to every
 * field, asserted by a passing test, and absent from every box on screen.
 *
 * `prisma:seed` already does this, along with users, tenants and demo cases. On
 * a database somebody is testing against, rewriting all of that to change a
 * placeholder is a large blast radius for a small edit — hence this, which
 * touches the five version-1 platform rows and stops.
 *
 * Version 1 is ours to refresh in place, exactly as the seed treats it; an
 * author's edits live on a later version and are never touched here.
 *
 *   pnpm --filter @tci/prisma-client refresh-flows
 */
import { PrismaClient, ClaimCategory, FlowStatus, TravelClaimType } from '@prisma/client';
import { CASE_FLOWS, TRAVEL_CLAIM_TYPE_LABELS, validateFlowDefinition } from '@tci/shared-types';

const prisma = new PrismaClient();

const flowKey = (travelClaimType: string) =>
  `travel-${travelClaimType.toLowerCase().replace(/_/g, '-')}`;

async function main() {
  let refreshed = 0;
  let skipped = 0;

  for (const [travelClaimType, flow] of Object.entries(CASE_FLOWS)) {
    // The same gate the seed applies. A flow that cannot be walked is worse
    // published than absent: the fallback at least works.
    const problems = validateFlowDefinition(flow, flow);
    if (problems.length > 0) {
      throw new Error(
        `Flow ${travelClaimType} failed the publish gate:\n` +
          problems.map(problem => `  - [${problem.kind}] ${problem.detail}`).join('\n')
      );
    }

    const existing = await prisma.flowDefinition.findFirst({
      where: { tenantId: null, key: flowKey(travelClaimType), version: 1 },
    });

    if (!existing) {
      // Nothing published for this type, so the service is already using the
      // built-in. Creating one here would need a publishing user, which is the
      // seed's business rather than this script's.
      console.log(`  – ${travelClaimType}: no platform row to refresh (falls back to CASE_FLOWS)`);
      skipped += 1;
      continue;
    }

    await prisma.flowDefinition.update({
      where: { id: existing.id },
      data: {
        name: TRAVEL_CLAIM_TYPE_LABELS[travelClaimType as keyof typeof TRAVEL_CLAIM_TYPE_LABELS],
        category: ClaimCategory.TRAVEL,
        travelClaimType: travelClaimType as TravelClaimType,
        entryStepId: flow.entryStepId,
        steps: flow.steps as unknown as object,
        status: FlowStatus.PUBLISHED,
        publishedAt: new Date(),
      },
    });
    refreshed += 1;
  }

  console.log(`🧭 Intake flows refreshed from CASE_FLOWS: ${refreshed} updated, ${skipped} skipped.`);
  console.log('   FlowsService caches for 60s — wait a minute, or restart case-service.');
}

main()
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
