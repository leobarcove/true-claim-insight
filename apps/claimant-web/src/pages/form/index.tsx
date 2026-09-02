import { useEffect, useMemo, useRef, useState } from 'react';
import {
  formatDateAnswer,
  TRAVEL_CLAIM_TYPE_LABELS,
  type CaseAnswers,
  type FlowStep,
} from '@tci/shared-types';

import { Button } from '@/components/ui/button';
import {
  clearFormSession,
  hasFormSession,
  isFormChannelSession,
  uploadFormDocument,
  useFormState,
  useRefreshFormState,
  useSendFormTurn,
  useStartFormConversation,
  type FormState,
} from '@/hooks/use-form-conversation';
import { FieldControl } from './field-control';
import { FormShell, PreClaimLayout, SectionLayout } from './layout';
import { rowsFor, sectionsFor, type ResolvedSection } from './sections';
import { submitSection, type TurnOutcome } from './submit-engine';

/**
 * The claim form — a fourth way to lodge a claim, beside the chat, WhatsApp and
 * Telegram.
 *
 * It is the same conversation engine underneath: the server holds the
 * questions, decides what comes next and stores the answers. What differs is
 * the shape. The chat asks one thing at a time; this shows a section at once
 * and sends it field by field, in the order the server expects.
 *
 * Which screen to draw is the *server's* answer, read from `/state`. Working it
 * out here would mean the form owning a second description of where a claim has
 * got to, and the two would drift the first time a flow changed.
 */

const newTurnId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const browserLocale = (): string | undefined => navigator.language?.split('-')[0];

export function ClaimFormPage() {
  const { data: state, isLoading } = useFormState();
  const start = useStartFormConversation();
  const refresh = useRefreshFormState();
  const send = useSendFormTurn();

  // Changing language is an ordinary turn carrying the new locale, not a
  // client-side toggle: the questions and every reply are the server's, so it
  // is the server that has to be told. §1.3 makes every turn carry it.
  const setLocale = async (locale: 'en' | 'ms') => {
    await send.mutateAsync({ clientMessageId: newTurnId(), locale, text: '' });
    await refresh();
  };

  // Opened once, and gated on the *session* rather than on `state`.
  //
  // `/state` answers `stage: 'phone'` for a browser holding no session at all,
  // which is the right screen to draw but the wrong thing to reason from: a
  // truthy state is not evidence that a conversation exists. Gating on it meant
  // `start` never ran, no session was minted, and every turn went to nobody —
  // the form sat on the first screen with a 201 for each answer.
  const started = useRef(false);
  useEffect(() => {
    if (started.current || hasFormSession()) return;
    started.current = true;
    start.mutate(browserLocale());
  }, [start]);

  useEffect(() => {
    if (start.isSuccess) void refresh();
  }, [start.isSuccess, refresh]);

  if (isLoading || !state) {
    return (
      <FormShell>
        <div className="flex flex-1 items-center justify-center p-10 text-sm text-muted-foreground">
          Loading…
        </div>
      </FormShell>
    );
  }

  return (
    <FormShell reference={state.case?.caseNumber} locale={state.locale} onLocaleChange={setLocale}>
      <StageRouter state={state} />
    </FormShell>
  );
}

function StageRouter({ state }: { state: FormState }) {
  switch (state.stage) {
    case 'phone':
      return <PhoneStage state={state} />;
    case 'code':
      return <CodeStage state={state} />;
    case 'consent':
      return <ConsentStage state={state} />;
    case 'claim-type':
      return <ClaimTypeStage state={state} />;
    case 'submitted':
      return <SubmittedStage state={state} />;
    case 'flow':
    default:
      return <FlowStage state={state} />;
  }
}

/** Send one turn and re-read the state. Used by every pre-claim screen. */
function useSimpleTurn() {
  const send = useSendFormTurn();
  const refresh = useRefreshFormState();

  return {
    busy: send.isPending,
    submit: async (turn: { text?: string; callbackValue?: string }) => {
      await send.mutateAsync({
        clientMessageId: newTurnId(),
        locale: browserLocale(),
        ...turn,
      });
      await refresh();
    },
  };
}

const READY = [
  'Your policy number',
  'Passport or IC',
  'Boarding pass or itinerary',
  'Airline letter, police report or receipts for what happened',
  'Bank account for the payout',
];

function PhoneStage({ state }: { state: FormState }) {
  const [phone, setPhone] = useState('');
  const { busy, submit } = useSimpleTurn();

  // E.164 for the server, "+60" shown as a prefix for the claimant — nobody
  // types a country code into a form on their own phone.
  const send = () => {
    const digits = phone.replace(/\D/g, '').replace(/^0+/, '');
    if (digits) void submit({ text: `+60${digits}` });
  };

  return (
    <div className="flex flex-1 justify-center px-4 py-10 sm:px-16 sm:py-16">
      <div className="grid w-full max-w-[1180px] gap-10 lg:grid-cols-[1fr_380px]">
        <main className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <span className="text-xs font-semibold uppercase tracking-[0.08em] text-primary">
              Travel insurance claims
            </span>
            <h1 className="text-3xl font-bold leading-tight tracking-tight sm:text-[40px]">
              Make your travel claim
              <br className="hidden sm:block" /> online, in about ten minutes.
            </h1>
            <p className="max-w-[540px] text-[15px] leading-relaxed text-muted-foreground">
              Flight delays, lost or damaged luggage, cancelled trips and overseas medical bills.
              Six short steps, saved as you go.
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="phone" className="text-sm font-semibold">
              Mobile number
            </label>
            <div className="flex max-w-[540px] items-center gap-2 rounded-lg border border-input bg-background px-3.5">
              <span className="font-medium text-muted-foreground">+60</span>
              <input
                id="phone"
                type="tel"
                inputMode="tel"
                placeholder="12 345 6789"
                value={phone}
                onChange={event => setPhone(event.target.value)}
                onKeyDown={event => event.key === 'Enter' && send()}
                className="w-full bg-transparent py-3 text-base focus:outline-none"
              />
            </div>
            {/*
              Said plainly, and never as "we text you". There is no SMS anywhere
              in the system, so somebody without WhatsApp cannot use this at all
              — finding that out after typing their number is worse than being
              told before.
            */}
            <p className="max-w-[540px] text-xs leading-snug text-muted-foreground">
              We send a 6-digit code to this number on <strong>WhatsApp</strong>. Started already?
              Enter the same number on this device and we pick up where you left off.
            </p>
            {state.lastReply && (
              <p role="alert" className="text-xs text-destructive">
                {state.lastReply}
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <Button size="lg" disabled={busy || !phone.trim()} onClick={send}>
              {busy ? 'Sending…' : 'Send code'}
            </Button>
            <p className="text-sm text-muted-foreground">
              Or message us on{' '}
              <a href="#" className="text-primary underline">
                WhatsApp
              </a>{' '}
              or{' '}
              <a href="#" className="text-primary underline">
                Telegram
              </a>{' '}
              — same questions, same team.
            </p>
          </div>
        </main>

        {/*
          Beside the form on a wide screen, below it on a phone. Static text,
          and the thing that stops people abandoning at Evidence: somebody who
          reaches the uploads without their boarding pass to hand leaves.
        */}
        <aside className="flex h-fit flex-col gap-2.5 rounded-xl border bg-background p-5">
          <h2 className="text-sm font-semibold">Have these ready</h2>
          {READY.map(item => (
            <div key={item} className="flex items-start gap-2.5 text-sm">
              <span className="mt-0.5 shrink-0 text-primary" aria-hidden="true">
                ✓
              </span>
              {item}
            </div>
          ))}
          <p className="mt-1 text-xs leading-snug text-muted-foreground">
            Missing something? Start anyway — we save as you go, and you can come back on this
            device to add documents.
          </p>
        </aside>
      </div>
    </div>
  );
}

function CodeStage({ state }: { state: FormState }) {
  const [code, setCode] = useState('');
  const { busy, submit } = useSimpleTurn();

  return (
    <PreClaimLayout
      eyebrow="Before we start"
      title="Enter the code"
      subtitle={state.lastReply ?? 'We have sent a six-digit code on WhatsApp.'}
      actions={
        <Button disabled={busy || code.length < 6} onClick={() => void submit({ text: code })}>
          {busy ? 'Checking…' : 'Continue'}
        </Button>
      }
    >
      <div className="rounded-xl border bg-background p-5">
        <label htmlFor="code" className="text-sm font-semibold">
          6-digit code
        </label>
        <input
          id="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          value={code}
          onChange={event => setCode(event.target.value.replace(/\D/g, ''))}
          className="mt-2 w-full rounded-lg border border-input bg-background px-3 py-2.5 text-center text-2xl tracking-[0.5em]"
        />
      </div>
    </PreClaimLayout>
  );
}

function ConsentStage({ state }: { state: FormState }) {
  const { busy, submit } = useSimpleTurn();

  return (
    <PreClaimLayout
      eyebrow="Before we start"
      title={state.consent?.title ?? 'How we handle your personal data'}
      actions={
        <>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => void submit({ callbackValue: '__consent:decline' })}
          >
            I do not agree
          </Button>
          <Button disabled={busy} onClick={() => void submit({ callbackValue: '__consent:agree' })}>
            I agree
          </Button>
        </>
      }
    >
      {/*
        Shown exactly as the server returned it. Consent recorded against
        wording written here rather than the approved notice is unprovable
        later, which is the whole reason notices are versioned and immutable.
      */}
      <div className="whitespace-pre-wrap rounded-xl border bg-background p-5 text-sm leading-relaxed">
        {state.consent?.body}
      </div>
      {state.consent && (
        <p className="text-xs text-muted-foreground">Version {state.consent.version}</p>
      )}
      <p className="text-xs text-muted-foreground">
        If you do not agree, no claim is opened and nothing you entered is kept.
      </p>
    </PreClaimLayout>
  );
}

function ClaimTypeStage({ state }: { state: FormState }) {
  const { busy, submit } = useSimpleTurn();

  return (
    <PreClaimLayout title="What has happened?" subtitle="Choose the option that fits best.">
      <div className="grid gap-2.5 sm:grid-cols-2">
        {(state.claimTypes ?? []).map(choice => (
          <button
            key={choice.value}
            type="button"
            disabled={busy}
            onClick={() => void submit({ callbackValue: choice.value })}
            className="flex min-h-[56px] items-center rounded-xl border border-input bg-background px-4 py-3 text-left text-sm font-medium hover:border-primary/40"
          >
            {choice.label}
          </button>
        ))}
      </div>
      {state.lastReply && <p className="text-xs text-muted-foreground">{state.lastReply}</p>}
    </PreClaimLayout>
  );
}

function SubmittedStage({ state }: { state: FormState }) {
  return (
    <PreClaimLayout
      title="Your claim request is in"
      subtitle={`Reference ${state.case?.caseNumber ?? ''}`}
    >
      <div className="flex flex-col gap-3 rounded-xl border bg-background p-5 text-sm leading-relaxed">
        <p>A member of our team will check what you have sent.</p>
        <p>
          If anything is missing they will contact you on <strong>WhatsApp</strong>, on the number
          you verified.
        </p>
        <p>Keep the reference above — it is how we find your claim request.</p>
      </div>
    </PreClaimLayout>
  );
}

/** The six sections. Everything from here is driven by the flow. */
function FlowStage({ state }: { state: FormState }) {
  const send = useSendFormTurn();
  const refresh = useRefreshFormState();

  const answers = (state.case?.answers ?? {}) as CaseAnswers;
  const claimTypeLabel = state.flow ? TRAVEL_CLAIM_TYPE_LABELS[state.flow.travelClaimType] : null;
  const view = useMemo(
    () => (state.flow ? sectionsFor(state.flow, answers) : null),
    [state.flow, answers]
  );

  const [activeId, setActiveId] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  // Where a returning claimant lands: the first section that is not finished.
  const active: ResolvedSection | null =
    view?.sections.find(section => section.id === activeId) ?? view?.firstIncomplete ?? null;

  if (!view || !active || !state.case) return null;

  const activeIndex = view.sections.findIndex(section => section.id === active.id);
  const previous = activeIndex > 0 ? view.sections[activeIndex - 1] : null;

  // Leads with the two facts that are true before any question is answered —
  // the number they proved and the kind of claim they chose. Without them the
  // rail is empty on the first section a claimant sees, which reads as broken
  // rather than as "nothing yet".
  const summary: Array<[string, string]> = [
    ...(claimTypeLabel ? ([['Type of claim', claimTypeLabel]] as Array<[string, string]>) : []),
    ...view.sections
      .flatMap(section => section.steps)
      .filter(step => answers[step.id] !== undefined && step.answerType !== 'confirm')
      .map(step => [step.label, displayAnswer(step, answers[step.id])] as [string, string]),
  ];

  const onContinue = async () => {
    setBusy(true);
    setErrors({});
    try {
      const result = await submitSection(
        {
          currentStepId: state.case!.currentStepId,
          values,
          answers,
          steps: active.steps.filter(step => step.answerType !== 'confirm'),
        },
        {
          send: async turn => {
            const conversation = (await send.mutateAsync(turn)) as {
              currentStep?: { id: string } | null;
              messages?: Array<{ direction: string; text: string | null }>;
            };
            const outbound = (conversation.messages ?? []).filter(m => m.direction === 'OUTBOUND');
            const outcome: TurnOutcome = {
              currentStepId: conversation.currentStep?.id ?? null,
              lastReply: outbound.length ? (outbound[outbound.length - 1].text ?? null) : null,
            };
            return outcome;
          },
          newId: newTurnId,
          wait: ms => new Promise(resolve => setTimeout(resolve, ms)),
          // The edge throttle answers 429 and axios throws it. Recognised here
          // rather than in the engine, which has no business knowing about HTTP.
          isRateLimitError: error =>
            (error as { response?: { status?: number } })?.response?.status === 429,
        }
      );

      if (!result.ok && result.error) {
        setErrors({ [result.error.stepId]: result.error.message });
        return;
      }

      // Re-read rather than reasoning about what changed. A branch may have
      // opened or closed as a result of what was just answered, and the server
      // already knows which.
      setValues({});
      setActiveId(null);
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <SectionLayout
      sections={view.sections}
      activeId={active.id}
      title={active.heading}
      subtitle={active.subtitle}
      summary={summary}
      actions={
        <>
          {/*
            Back moves between *sections* of the form, not through the server's
            cursor. Everything answered is already saved, so this is navigation
            rather than an undo — and there is nothing to warn about.
          */}
          {previous && (
            <Button variant="outline" disabled={busy} onClick={() => setActiveId(previous.id)}>
              Back
            </Button>
          )}
          <Button disabled={busy} onClick={() => void onContinue()}>
            {busy ? 'Saving…' : 'Continue'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5 rounded-xl border bg-background p-5">
        {rowsFor(active.steps).map(row => (
          <div
            key={row.map(step => step.id).join('+')}
            className={row.length === 2 ? 'grid gap-4 sm:grid-cols-2' : undefined}
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
                  state.case!.documents.find(document => document.stepId === step.id) ?? null
                }
                onUpload={async file => {
                  const stored = await uploadFormDocument(
                    file,
                    step.documentType ?? 'OTHER_DOCUMENT',
                    step.id
                  );
                  setValues(current => ({ ...current, [step.id]: stored.id }));
                }}
              />
            ))}
          </div>
        ))}
      </div>

      <StartAgain />
    </SectionLayout>
  );
}

/**
 * Start over.
 *
 * Its own copy rather than a shared hook, deliberately: the chat's version is
 * guarded by the same `isChannelSession()` check and asserted by a source scan,
 * and sharing one would make that assertion pass for a page that no longer had
 * the guard. Two copies of four lines, each provably guarded, beats one
 * abstraction that has to be trusted.
 *
 * Clears the **form's** key only. The chat's conversation in the same browser
 * is a different channel and is left alone.
 */
function StartAgain() {
  if (isFormChannelSession()) return null;

  return (
    <button
      type="button"
      className="self-start text-xs text-muted-foreground underline"
      onClick={() => {
        if (!window.confirm('This clears the claim request you are filling in on this device. The web chat is not affected.')) return;
        clearFormSession();
        window.location.reload();
      }}
    >
      Start again
    </button>
  );
}

function displayAnswer(step: FlowStep, value: unknown): string {
  if (step.answerType === 'document') return 'provided';
  if (step.answerType === 'choice') {
    return step.choices?.find(choice => choice.value === value)?.label ?? String(value);
  }
  if (step.answerType === 'date' || step.answerType === 'datetime') {
    return formatDateAnswer(String(value), step.answerType) ?? String(value);
  }
  return String(value);
}
