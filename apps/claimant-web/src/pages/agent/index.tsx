import { useMemo, useState } from 'react';
import {
  formatDateAnswer,
  TRAVEL_CLAIM_TYPE_LABELS,
  type CaseAnswers,
  type FlowStep,
} from '@tci/shared-types';

import { Button } from '@/components/ui/button';
import {
  agentSession,
  agentUser,
  uploadAssistedDocument,
  useAssistedCase,
  useRefreshAssistedCase,
  useSaveAssistedAnswer,
  useSubmitAssistedCase,
  type ResolvedClaimant,
} from '@/hooks/use-agent-intake';
import { useStrayDropGuard } from '@/hooks/use-stray-drop-guard';

import { FieldControl } from '../form/field-control';
import { FormShell, SectionLayout } from '../form/layout';
import { ReviewStage, type ReviewRow } from '../form/review';
import { rowsFor, sectionsFor, type ResolvedSection } from '../form/sections';
import { CheckIcon } from '../form/icons';
import { AgentBand } from './band';
import { asDateAndTime, asTime } from './when';
import { AgentSignInPage } from './sign-in';
import { AgentStartClaim } from './start-claim';

/**
 * The agent-assisted form.
 *
 * The claimant's form, reached from a staff address, with two screens swapped
 * at the front and a band across the top. Everything from *Claim type* through
 * *Review* is the same components rendered from the same section map — a
 * question added to a flow appears on both paths at once, and neither can drift
 * from the other.
 *
 * The one thing that differs underneath is the transport. A claimant's answers
 * go through the public conversation, where the server owns a cursor and the
 * form has to move it before answering. An agent is signed in, so their answers
 * go through `PATCH /cases/:id/answers`, which takes a step and a value — no
 * cursor, no `__edit` turns, no pacing. That is why there is no submit engine
 * here: it would be machinery for a problem this path does not have.
 */

export function AgentFormPage() {
  const [signedIn, setSignedIn] = useState(() => agentSession.read() !== undefined);
  const [claimant, setClaimant] = useState<ResolvedClaimant | null>(null);
  const [caseId, setCaseId] = useState<string | null>(null);
  const [consent, setConsent] = useState<{ attestedAt: string; noticeVersion: number } | null>(
    null
  );

  const agent = agentUser.read();

  if (!signedIn) {
    return (
      <FormShell>
        <AgentSignInPage onSignedIn={() => setSignedIn(true)} />
      </FormShell>
    );
  }

  if (!caseId) {
    return (
      <FormShell>
        <AgentBand agent={agent} claimant={claimant} consent={null} />
        <AgentStartClaim
          claimant={claimant}
          onClaimantResolved={setClaimant}
          onOpened={(id, attestedAt, noticeVersion) => {
            setCaseId(id);
            setConsent({ attestedAt, noticeVersion });
          }}
        />
      </FormShell>
    );
  }

  return (
    <AssistedSections
      caseId={caseId}
      agent={agent}
      claimant={claimant}
      consent={consent}
      onStartAnother={() => {
        setCaseId(null);
        setClaimant(null);
        setConsent(null);
      }}
    />
  );
}

function AssistedSections({
  caseId,
  agent,
  claimant,
  consent,
  onStartAnother,
}: {
  caseId: string;
  agent: ReturnType<typeof agentUser.read>;
  claimant: ResolvedClaimant | null;
  consent: { attestedAt: string; noticeVersion: number } | null;
  onStartAnother: () => void;
}) {
  useStrayDropGuard();
  const { data, isLoading } = useAssistedCase(caseId);
  const saveAnswer = useSaveAssistedAnswer();
  const submit = useSubmitAssistedCase();
  const refresh = useRefreshAssistedCase(caseId);

  const [activeId, setActiveId] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const answers = (data?.case.answers ?? {}) as CaseAnswers;
  const view = useMemo(
    () => (data?.flow ? sectionsFor(data.flow, answers) : null),
    [data?.flow, answers]
  );

  if (isLoading || !data || !view) {
    return (
      <FormShell>
        <AgentBand agent={agent} claimant={claimant} consent={consent} />
        <div className="flex flex-1 items-center justify-center p-10 text-sm text-muted-foreground">
          Loading…
        </div>
      </FormShell>
    );
  }

  if (submitted) {
    return (
      <FormShell reference={data.case.caseNumber}>
        <AgentBand agent={agent} claimant={claimant} consent={consent} />
        <AssistedSubmitted
          caseNumber={data.case.caseNumber}
          claimant={claimant}
          agent={agent}
          consent={consent}
          onStartAnother={onStartAnother}
        />
      </FormShell>
    );
  }

  const active: ResolvedSection =
    view.sections.find(section => section.id === activeId) ??
    view.firstIncomplete ??
    view.sections.find(section => section.id === 'review')!;

  const activeIndex = view.sections.findIndex(section => section.id === active.id);
  const previous = activeIndex > 0 ? view.sections[activeIndex - 1] : null;
  const claimTypeLabel = TRAVEL_CLAIM_TYPE_LABELS[data.flow.travelClaimType];

  /**
   * One answer, straight to the case.
   *
   * The server validates against the pinned flow and answers `accepted: false`
   * with its own reason rather than throwing, so a bad date is an ordinary
   * outcome. The reason is shown under that field, in the flow's words — a
   * second, vaguer description written here would drift from the rule the
   * server actually enforces.
   */
  const saveOne = async (step: FlowStep, value: string): Promise<boolean> => {
    const outcome = await saveAnswer.mutateAsync({ caseId, stepId: step.id, value });
    if (!outcome.accepted) {
      setErrors(current => ({ ...current, [step.id]: outcome.error ?? 'That was not accepted.' }));
      return false;
    }
    return true;
  };

  const onContinue = async () => {
    setBusy(true);
    setErrors({});
    try {
      for (const step of active.steps) {
        if (step.answerType === 'confirm') continue;

        const entered = values[step.id];
        const existing = answers[step.id];

        // Unchanged fields are not re-sent, and an optional one the agent left
        // alone is skipped explicitly — the server does not read *unanswered*
        // as *skipped*, so leaving it silent keeps the question open for ever.
        if (entered === undefined || entered === String(existing ?? '')) {
          const untouched = (entered ?? '') === '';
          const unanswered = existing === undefined || existing === '';

          /*
            A file that arrived without its answer.

            Uploading stores the bytes and hands back an id; a second call
            records that id as the answer. Only the first is durable, so a
            reload between the two leaves a row reading "Uploaded" above a
            Continue button that will never advance — the step is open and the
            id that would close it went with the old page. The case still knows
            what is attached, so it is asked.
          */
          if (step.answerType === 'document' && untouched && unanswered) {
            const attached = data.case.documents.find(document => document.stepId === step.id);
            if (attached) {
              if (!(await saveOne(step, attached.id))) return;
              continue;
            }
          }

          if (step.optional && untouched && unanswered) {
            if (!(await saveOne(step, 'skip'))) return;
          }
          continue;
        }

        if (!(await saveOne(step, entered))) return;
      }

      setValues({});
      setActiveId(null);
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const onSubmit = async () => {
    setBusy(true);
    setErrors({});
    try {
      await submit.mutateAsync(caseId);
      setSubmitted(true);
    } catch (caught: any) {
      setErrors({
        __submit:
          caught?.response?.data?.error?.message ??
          'We could not submit this yet. Check that every required document is attached.',
      });
    } finally {
      setBusy(false);
    }
  };

  const reviewRowsFor = (section: ResolvedSection): ReviewRow[] => {
    if (section.id === 'claim-type') {
      return [
        {
          step: { id: '__claim-type', label: 'Type of claim', answerType: 'text' } as FlowStep,
          label: 'Type of claim',
          value: claimTypeLabel,
          editable: false,
        },
      ];
    }

    return section.steps
      .filter(step => step.answerType !== 'confirm')
      .filter(step => answers[step.id] !== undefined)
      .map(step => ({
        step,
        label: step.label,
        value:
          step.answerType === 'document'
            ? (data.case.documents.find(document => document.stepId === step.id)?.fileName ??
              'Provided')
            : displayAnswer(step, answers[step.id]),
      }));
  };

  const summary: Array<[string, string]> = [
    ['Type of claim', claimTypeLabel],
    ...view.sections
      .flatMap(section => section.steps)
      .filter(step => answers[step.id] !== undefined && step.answerType !== 'confirm')
      .map(step => [step.label, displayAnswer(step, answers[step.id])] as [string, string]),
  ];

  return (
    <FormShell reference={data.case.caseNumber}>
      <AgentBand agent={agent} claimant={claimant} consent={consent} />

      <SectionLayout
        sections={view.sections}
        activeId={active.id}
        title={active.heading}
        /*
          The agent's own instruction, in place of the section's.

          Every subtitle in the flow is addressed to the claimant — "photos are
          fine", "come back on this device" — and an agent reading those is
          being told things about somebody else's situation. This says what to
          do with the screen in front of them, which is the same thing the
          claimant's subtitle does for the claimant.
        */
        subtitle="Ask them each of these. Anything you are unsure of can be left and corrected at the review."
        summary={summary}
        assisted
        actions={
          active.id === 'review' ? null : (
            <>
              {previous && (
                <Button variant="outline" disabled={busy} onClick={() => setActiveId(previous.id)}>
                  Back
                </Button>
              )}
              <Button disabled={busy} onClick={() => void onContinue()}>
                {busy ? 'Saving…' : 'Continue'}
              </Button>
            </>
          )
        }
      >
        {active.id === 'review' ? (
          <>
            <ReviewStage
              sections={view.sections}
              answers={answers}
              documents={data.case.documents}
              rowsFor={reviewRowsFor}
              busy={busy}
              error={Object.values(errors)[0] ?? null}
              onChange={async (step, value) => {
                setBusy(true);
                setErrors({});
                try {
                  if (await saveOne(step, value)) await refresh();
                } finally {
                  setBusy(false);
                }
              }}
              onSubmit={onSubmit}
              onBack={() => previous && setActiveId(previous.id)}
            />

            {/*
              The last thing said before a claim request leaves. It names the
              basis — a recorded verbal agreement — because that is what makes
              this submission lawful, and an agent about to send somebody else's
              claim should be reminded of whose claim it is.
            */}
            <p className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm leading-relaxed text-amber-900 dark:border-amber-700/60 dark:bg-amber-950/40 dark:text-amber-200">
              You are submitting this claim request on behalf of{' '}
              <strong>{claimant?.fullName ?? 'the claimant'}</strong>, on the verbal agreement you
              recorded at {consent ? asTime(consent.attestedAt) : 'the start of this claim'}.
            </p>
          </>
        ) : (
          <div className="flex flex-col gap-5 rounded-xl border bg-background p-5">
            {rowsFor(active.steps).map(row => (
              <div
                key={row.map(step => step.id).join('+')}
                /*
                  A pair stays a pair on a phone. Trip start and trip end are
                  one question asked twice, and a date box is narrow enough for
                  two to fit at 390px — stacking them puts a scroll between two
                  halves that are read together, and that is where a return
                  date gets typed into the start box.
                */
                /*
                  A pair of plain *dates* stays a pair on a phone: trip start
                  and trip end are one question asked twice, they are narrow,
                  and putting a scroll between them is where a return date gets
                  typed into the start box.

                  Nothing else is. A date *and time* needs half again the width
                  — at 390px, side by side, "01-Sep-2026 09:40" was clipped to
                  "01-Sep-2026 0" behind the calendar button, so the departure
                  times could not be read back at all. Text pairs fare no
                  better: the account number and account holder end up half a
                  screen each with their hints wrapping four lines.

                  Which is how the design has it: dates paired, times and text
                  stacked.
                */
                className={
                  row.length === 2
                    ? row.every(step => step.answerType === 'date')
                      ? 'grid grid-cols-2 gap-3 sm:gap-4'
                      : 'grid gap-4 sm:grid-cols-2'
                    : undefined
                }
              >
                {row.map(step => (
                  <FieldControl
                    key={step.id}
                    step={step}
                    disabled={busy}
                    error={errors[step.id]}
                    value={values[step.id] ?? String(answers[step.id] ?? '')}
                    onChange={value => setValues(current => ({ ...current, [step.id]: value }))}
                    attached={
                      data.case.documents.find(document => document.stepId === step.id) ?? null
                    }
                    onUpload={async file => {
                      // Two steps, and the second is easy to forget. Uploading
                      // stores the bytes and attaches them to the case; it does
                      // *not* answer the question. The claimant's path records
                      // the answer on the turn that names the stored id — this
                      // path has to do it explicitly, and without it the
                      // document sits on the case while the step stays open and
                      // the section refuses to advance, with the file plainly
                      // visible on screen.
                      const stored = await uploadAssistedDocument(
                        caseId,
                        file,
                        step.documentType ?? 'OTHER_DOCUMENT',
                        step.id
                      );
                      setValues(current => ({ ...current, [step.id]: stored.id }));
                      await refresh();
                    }}
                  />
                ))}
              </div>
            ))}
          </div>
        )}
      </SectionLayout>
    </FormShell>
  );
}

/**
 * Handed over, and the agent cannot follow it.
 *
 * The claim is routed to the handling adjusting firm at creation, so an
 * insurer's agent loses sight of it the moment it is submitted. Saying so here
 * is not an apology — it is the difference between a colleague understanding
 * the handover and one filing a bug about a claim that disappeared.
 */
function AssistedSubmitted({
  caseNumber,
  claimant,
  agent,
  consent,
  onStartAnother,
}: {
  caseNumber: string;
  claimant: ResolvedClaimant | null;
  agent: ReturnType<typeof agentUser.read>;
  consent: { attestedAt: string; noticeVersion: number } | null;
  onStartAnother: () => void;
}) {
  return (
    <div className="flex flex-1 justify-center px-4 py-12 sm:px-16">
      <main className="flex w-full max-w-[620px] flex-col items-center gap-4 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-2xl text-primary">
          <CheckIcon className="h-7 w-7" />
        </span>
        <h1 className="text-2xl font-bold tracking-tight sm:text-[28px]">
          Claim request {caseNumber} submitted
        </h1>
        <p className="text-[15px] leading-relaxed text-muted-foreground">
          Submitted on behalf of {claimant?.fullName ?? 'the claimant'}, on their recorded verbal
          agreement.
        </p>

        <dl className="m-0 w-full rounded-xl border bg-background p-5 text-left">
          {[
            /*
              The design also names the firm the request went to. It is not
              shown, because this surface is never told which one that is —
              routing happens on the server, and printing a firm name the client
              guessed at would be a claim about where somebody's claim went.
            */
            [
              'Entered by',
              `${agent?.fullName ?? 'you'}${agent?.tenantName ? ` · ${agent.tenantName}` : ''}` +
                (consent ? ` · ${asDateAndTime(consent.attestedAt)}` : ''),
            ],
            ['Consent', `Agent attested verbal${consent ? ` · notice v${consent.noticeVersion}` : ''}`],
          ].map(([label, value]) => (
            <div key={label} className="flex justify-between gap-4 border-b py-2.5 last:border-0">
              <dt className="text-sm text-muted-foreground">{label}</dt>
              <dd className="m-0 text-sm font-semibold">{value}</dd>
            </div>
          ))}
        </dl>

        <p className="rounded-xl border bg-background p-4 text-left text-sm leading-relaxed text-muted-foreground">
          This request now belongs to the handling adjusting firm, so you will not be able to open
          it from here. They will contact {claimant?.fullName ?? 'the claimant'} on WhatsApp if
          anything is missing. Give them the reference above.
        </p>

        <Button onClick={onStartAnother}>Start another assisted claim</Button>
      </main>
    </div>
  );
}

function displayAnswer(step: FlowStep, value: unknown): string {
  // Same reasoning as the claimant form: "skip" is how a question is closed,
  // not something to read back.
  const raw = String(value ?? '').trim().toLowerCase();
  if (raw === 'skip') return 'Not provided';
  if (raw === 'later') return 'To follow';

  if (step.answerType === 'document') return 'provided';
  if (step.answerType === 'choice') {
    return step.choices?.find(choice => choice.value === value)?.label ?? String(value);
  }
  if (step.answerType === 'date' || step.answerType === 'datetime') {
    return formatDateAnswer(String(value), step.answerType) ?? String(value);
  }
  return String(value);
}
