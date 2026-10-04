/**
 * Link staff-uploaded evidence to the intake step it satisfies.
 *
 * Until the portal fix, the adjuster portal's Upload button stored a file with
 * a document type and nothing else — no `stepId`, and no answer on the step.
 * The evidence checklist matches on type, so it ticked; the submit guard reads
 * `answers`, so it refused, naming every document the checklist showed as done.
 *
 * For each case still open for editing, this finds document steps on the
 * claimant's path that have no answer, and live uploads with no step whose
 * type is the one that step asks for. Where the match is unambiguous it files
 * the upload against the step and records its id as the answer — exactly what
 * the fixed portal now does in two calls — and writes an audit row saying so.
 *
 * It refuses to guess. A single-file step with more than one candidate, or a
 * document type asked for by more than one open step, is reported and left for
 * an operator to re-upload through the portal, because choosing the wrong file
 * would put evidence in front of an adjuster that the claimant never meant.
 *
 * Dry run unless `--apply` is passed. The cursor is never moved, nothing is
 * superseded, and nothing is deleted.
 *
 *   pnpm --filter @tci/case-service backfill:document-steps            # report
 *   pnpm --filter @tci/case-service backfill:document-steps -- --apply # write
 *
 * Lives in case-service, not in a shared package: it reads and writes only
 * case-service's own tables, and a file under packages/ makes the staging
 * deploy rebuild every image, while one here rebuilds case-service alone.
 *
 * On staging, inside the running container (its WORKDIR is this package):
 *   docker exec tci-staging-case-service-1 \
 *     node -r ts-node/register/transpile-only scripts/backfill-document-step-answers.ts
 */
import { CaseStatus, Prisma, PrismaClient } from '@prisma/client';
import {
  CASE_FLOWS,
  pathSteps,
  type CaseAnswers,
  type CaseFlow,
  type FlowStep,
} from '@tci/shared-types';

const prisma = new PrismaClient();
const apply = process.argv.includes('--apply');

/** The statuses `CasesService.getEditableCase` accepts — the ones submit can still be reached from. */
const EDITABLE: CaseStatus[] = [
  CaseStatus.DRAFT,
  CaseStatus.IN_PROGRESS,
  CaseStatus.INFO_REQUESTED,
];

/** The pinned flow, as the service resolves it; structure only, no wording. */
async function flowFor(caseRow: {
  flowDefinitionId: string | null;
  travelClaimType: string;
}): Promise<CaseFlow | null> {
  if (caseRow.flowDefinitionId) {
    const row = await prisma.flowDefinition.findUnique({
      where: { id: caseRow.flowDefinitionId },
      select: { entryStepId: true, steps: true, travelClaimType: true },
    });
    if (row) {
      return {
        travelClaimType: row.travelClaimType as CaseFlow['travelClaimType'],
        entryStepId: row.entryStepId,
        steps: row.steps as unknown as FlowStep[],
      };
    }
  }
  return CASE_FLOWS[caseRow.travelClaimType as keyof typeof CASE_FLOWS] ?? null;
}

async function main() {
  console.log(apply ? 'Applying.\n' : 'Dry run — pass --apply to write.\n');

  const cases = await prisma.case.findMany({
    where: { status: { in: EDITABLE }, travelClaimType: { not: null } },
    select: {
      id: true,
      caseNumber: true,
      tenantId: true,
      travelClaimType: true,
      flowDefinitionId: true,
      answers: true,
      documents: {
        where: { supersededAt: null },
        select: { id: true, documentType: true, stepId: true, fileName: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
      },
    },
  });

  let linked = 0;
  let unresolved = 0;

  for (const caseRow of cases) {
    const stepless = caseRow.documents.filter(document => document.stepId === null);
    if (stepless.length === 0) continue;

    const flow = await flowFor({
      flowDefinitionId: caseRow.flowDefinitionId,
      travelClaimType: caseRow.travelClaimType!,
    });
    if (!flow) continue;

    const answers = { ...((caseRow.answers ?? {}) as CaseAnswers) };
    const onPath = pathSteps(flow, answers);
    const open = flow.steps.filter(
      step =>
        step.answerType === 'document' && onPath.has(step.id) && answers[step.id] === undefined
    );
    if (open.length === 0) continue;

    // An id an answer already points at is spoken for, whatever its stepId says.
    const referenced = new Set(Object.values(answers).map(value => String(value)));
    const askedFor = new Map<string, number>();
    for (const step of open) {
      askedFor.set(String(step.documentType), (askedFor.get(String(step.documentType)) ?? 0) + 1);
    }

    const links: Array<{ step: FlowStep; documentIds: string[]; answerId: string }> = [];
    const notes: string[] = [];

    for (const step of open) {
      const type = String(step.documentType);
      const candidates = stepless.filter(
        document => document.documentType === type && !referenced.has(document.id)
      );
      if (candidates.length === 0) continue;

      if ((askedFor.get(type) ?? 0) > 1) {
        notes.push(`${step.label}: ${type} is asked for by more than one step — re-upload`);
        continue;
      }
      if (candidates.length > 1 && !step.allowMultiple) {
        notes.push(
          `${step.label}: ${candidates.length} files typed ${type} ` +
            `(${candidates.map(c => c.fileName).join(', ')}) — re-upload the right one`
        );
        continue;
      }

      // A multi-photo step keeps every candidate; the answer names the latest,
      // which is what the conversation records for the same step.
      const latest = candidates[candidates.length - 1];
      links.push({ step, documentIds: candidates.map(c => c.id), answerId: latest.id });
      answers[step.id] = latest.id;
    }

    if (links.length === 0 && notes.length === 0) continue;

    console.log(`${caseRow.caseNumber} (${caseRow.id})`);
    for (const link of links) {
      console.log(`  ✓ ${link.step.label} ← ${link.documentIds.length} file(s), answer ${link.answerId}`);
    }
    for (const note of notes) console.log(`  ✗ ${note}`);
    linked += links.length;
    unresolved += notes.length;

    if (!apply || links.length === 0) continue;

    await prisma.$transaction([
      ...links.map(link =>
        prisma.caseDocument.updateMany({
          where: { id: { in: link.documentIds }, caseId: caseRow.id, stepId: null },
          data: { stepId: link.step.id },
        })
      ),
      prisma.case.update({
        where: { id: caseRow.id },
        data: { answers: answers as Prisma.InputJsonValue },
      }),
      ...links.map(link =>
        prisma.auditTrail.create({
          data: {
            entityType: 'CASE',
            entityId: caseRow.id,
            action: 'CASE_DOCUMENT_STEP_BACKFILLED',
            actorType: 'SYSTEM',
            tenantId: caseRow.tenantId,
            oldValues: { [link.step.id]: null },
            newValues: { [link.step.id]: link.answerId },
            metadata: {
              stepId: link.step.id,
              stepLabel: link.step.label,
              documentIds: link.documentIds,
              reason:
                'Uploaded through the portal before uploads were filed against a step; ' +
                'linked by document type by backfill-document-step-answers.ts',
            },
          },
        })
      ),
    ]);
  }

  console.log(
    `\n${linked} step(s) ${apply ? 'linked' : 'would be linked'}, ${unresolved} left for an operator.`
  );
}

main()
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
