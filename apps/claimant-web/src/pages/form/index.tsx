import { useEffect, useMemo, useRef, useState } from 'react';
import {
  formatDateAnswer,
  TRAVEL_CLAIM_TYPE_LABELS,
  type CaseAnswers,
  type FlowStep,
} from '@tci/shared-types';

import { Button } from '@/components/ui/button';
import { useStrayDropGuard } from '@/hooks/use-stray-drop-guard';
import { isRateLimited } from '@/lib/http-errors';
import { cn } from '@/lib/utils';
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
import { FormShell, PreClaimLayout, SectionLayout, SHOW_CHAT_ALTERNATIVE } from './layout';
import { CodeBoxes, RESEND_SECONDS } from './code-entry';
import { keepDigits } from './digits-only';
import { copyFor } from './form-copy';
import { ReviewStage, type ReviewRow } from './review';
import { rowsFor, sectionsFor, SECTIONS, type ResolvedSection } from './sections';
import { missingRequired, submitSection, type TurnOutcome } from './submit-engine';

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

/**
 * The claim-type question is asked before any flow exists, so it has no step in
 * `flow.steps` — but it is still the form's first section, and its wording
 * belongs beside the other five rather than inline here where the two would
 * drift.
 */
const CLAIM_TYPE_SECTION = SECTIONS.find(section => section.id === 'claim-type')!;

/**
 * Move focus to the field that was refused.
 *
 * A section can be taller than the screen, so an error message rendered below
 * the fold is an error nobody sees: the claimant presses Continue, nothing
 * appears to happen, and they press it again. Focus scrolls it into view and
 * announces it to a screen reader in one act.
 *
 * Deferred a frame because the message is rendered by the same state update
 * that calls this, and focusing an element React has not drawn yet does
 * nothing at all.
 */
function focusField(stepId: string) {
  requestAnimationFrame(() => {
    const field = document.getElementById(stepId);
    if (field instanceof HTMLElement) {
      field.focus({ preventScroll: false });
      field.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  });
}

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
/**
 * How the conversation marks a question: `(4 of 16) And when does your trip…`.
 *
 * Only questions are numbered, which makes this the way to tell a re-ask from
 * the reason for it — see `deps.send`, where a refusal has to be reported under
 * the field that caused it.
 */
const NUMBERED_QUESTION = /^\(\d+ of \d+\)/;

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
  const [attempted, setAttempted] = useState(false);
  const { busy, submit } = useSimpleTurn();
  const t = copyFor(state.locale);

  // E.164 for the server, "+60" shown as a prefix for the claimant — nobody
  // types a country code into a form on their own phone.
  const send = () => {
    const digits = phone.replace(/\D/g, '').replace(/^0+/, '');
    if (!digits) return;
    setAttempted(true);
    void submit({ text: `+60${digits}` });
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
              {t('mobileNumber')}
            </label>
            <div className="flex max-w-[540px] items-center gap-2 rounded-lg border border-input bg-background px-3.5">
              <span className="font-medium text-muted-foreground">+60</span>
              <input
                id="phone"
                type="tel"
                inputMode="tel"
                placeholder="12 345 6789"
                value={phone}
                /*
                  Digits only. A mobile number has no letters in it, and the
                  server strips everything else before sending anyway — so a
                  claimant who typed one could press Send, wait, and be told
                  nothing was wrong with a number they can see is wrong.
                  Spaces and dashes go the same way, because people type them:
                  "012-345 6789" is how the number is written down.
                */
                onChange={event => setPhone(keepDigits(event.target.value))}
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
            {/*
              `lastReply` is only an error once the claimant has tried
              something. On a conversation that has just opened it is the bot's
              *greeting* — "Hello, we handle insurance claims…" — and rendering
              that in red as a `role="alert"` told everyone arriving at the form
              that something had already gone wrong, before they had touched it.
              A message is a failure only if it is a reply to an attempt.
            */}
            {attempted && state.lastReply && (
              <p role="alert" className="text-xs text-destructive">
                {state.lastReply}
              </p>
            )}
          </div>

          <div className="flex flex-col items-stretch gap-4 sm:flex-row sm:flex-wrap sm:items-center">
            {/*
              Full width on a phone, as everywhere else in the form: it is the
              only action on the screen, and a pill hugging two words is a small
              target sitting in a lot of empty space.
            */}
            <Button
              size="lg"
              className="w-full sm:w-auto"
              disabled={busy || !phone.trim()}
              onClick={send}
            >
              {busy ? t('sending') : t('sendCode')}
            </Button>
            {/*
              Hidden with the sidebar card, and for the same reason: both links
              go to "#". Offering two other ways in and landing the claimant
              back on this page is worse than offering none — and this one sits
              beside the button they are meant to press.
            */}
            {SHOW_CHAT_ALTERNATIVE && (
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
            )}
          </div>
        </main>

        {/*
          Beside the form on a wide screen, below it on a phone. Static text,
          and the thing that stops people abandoning at Evidence: somebody who
          reaches the uploads without their boarding pass to hand leaves.
        */}
        <aside className="flex h-fit flex-col gap-2.5 rounded-xl border bg-background p-5">
          <h2 className="text-sm font-semibold">{t('haveTheseReady')}</h2>
          {READY.map(item => (
            <div key={item} className="flex items-start gap-2.5 text-sm">
              {/*
                A filled circle rather than a bare tick, as the design has it.
                A row of loose ✓ marks reads as five things already done; a
                marker reads as a list to check against, which is what this is.
              */}
              <span
                className="mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] text-primary"
                aria-hidden="true"
              >
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
  const [changingNumber, setChangingNumber] = useState(false);
  const [newNumber, setNewNumber] = useState('');
  const [remaining, setRemaining] = useState(RESEND_SECONDS);
  const [attempted, setAttempted] = useState(false);
  const { busy, submit } = useSimpleTurn();
  const t = copyFor(state.locale);

  // Counts down once, from when this screen appeared. Not persisted: a reload
  // is a fair reason to be allowed another code, and the server's own per-number
  // limit is what actually protects the sending cost.
  useEffect(() => {
    if (remaining <= 0) return;
    const timer = setTimeout(() => setRemaining(seconds => seconds - 1), 1000);
    return () => clearTimeout(timer);
  }, [remaining]);

  /**
   * Send the code, and be honest about a refusal.
   *
   * The screen said nothing when a code was wrong: the digits stayed in the
   * boxes, the button un-pressed itself, and that was all. Somebody who
   * mistyped one digit could not tell whether they had got it wrong, the
   * message had not arrived, or the site was broken — and the boxes were still
   * full, so trying again meant clearing six digits by hand first.
   *
   * The server's own words are shown rather than a message written here,
   * because it distinguishes a case this screen cannot see: the fifth wrong
   * code drops the pending number entirely, and the claimant has to send their
   * number again rather than keep guessing at a code that no longer exists.
   */
  const confirm = async () => {
    if (code.length !== 6) return;
    await submit({ text: code });
    setAttempted(true);
    setCode('');
  };

  /**
   * A different number, sent as an ordinary answer.
   *
   * The gateway already accepts a new number at this step and replaces the
   * pending one — the chat says so in words ("send a different number instead").
   * The form says it as a link, and neither needs a special endpoint.
   */
  const sendDifferentNumber = () => {
    const digits = newNumber.replace(/\D/g, '').replace(/^0+/, '');
    if (!digits) return;
    setAttempted(false);
    setCode('');
    setChangingNumber(false);
    void submit({ text: `+60${digits}` });
  };

  return (
    <PreClaimLayout
      eyebrow="Before we start"
      title="Check your messages"
      actions={
        <>
          <Button variant="outline" disabled={busy} onClick={() => setChangingNumber(true)}>
            {t('back')}
          </Button>
          <Button disabled={busy || code.length < 6} onClick={confirm}>
            {busy ? t('checking') : 'Confirm'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <label htmlFor="code" className="text-sm font-semibold">
          Enter the 6-digit code
        </label>

        {/*
          No auto-submit on the sixth digit, deliberately, even though it is the
          common pattern. A claimant gets five attempts before the server sends
          them back to the number step, so a mistyped digit that submits itself
          spends one of those before they have had a chance to look. The design
          asks for Confirm and Confirm is also the safer control.
        */}
        <CodeBoxes value={code} onChange={setCode} disabled={busy} />

        <p className="text-sm text-muted-foreground">
          Sent on WhatsApp to <strong className="font-medium text-foreground">{state.pendingPhone ?? 'your number'}</strong>.{' '}
          <button
            type="button"
            className="underline underline-offset-2"
            onClick={() => setChangingNumber(true)}
          >
            Wrong number?
          </button>
        </p>

        <p className="text-sm text-muted-foreground">
          Did not get it?{' '}
          {remaining > 0 ? (
            <>
              <span className="opacity-60">Send again</span> in 0:
              {String(remaining).padStart(2, '0')}.
            </>
          ) : (
            <button
              type="button"
              disabled={busy}
              className="underline underline-offset-2"
              onClick={() => {
                // A new code means the old refusal no longer describes
                // anything. Left standing, it reads as though the code that has
                // just been sent was already rejected.
                setRemaining(RESEND_SECONDS);
                setAttempted(false);
                setCode('');
                if (state.pendingPhone) void submit({ text: state.pendingPhone });
              }}
            >
              Send again
            </button>
          )}
        </p>

        {/*
          Shown only after a code has actually been sent and refused.

          Still being on this screen is the refusal: a code the server accepted
          moves the whole page on, so anything the bot says while we are still
          here is the reason we are. It was previously gated on the boxes being
          *empty*, which they never are straight after a failed attempt — so the
          message existed and nobody ever saw it.

          Not shown before an attempt: the bot's most recent line on arrival is
          "we have sent you a code", and painting that red would greet everybody
          with a failure they have not had.
        */}
        {attempted && !busy && state.lastReply && (
          <p role="alert" className="text-sm text-destructive">
            {state.lastReply}
          </p>
        )}

        {changingNumber && (
          <div className="mt-2 flex flex-col gap-2 rounded-xl border bg-background p-4">
            <label htmlFor="new-number" className="text-sm font-semibold">
              Send the code to a different number
            </label>
            <div className="flex items-center gap-2 rounded-lg border border-input px-3.5">
              <span className="font-medium text-muted-foreground">+60</span>
              <input
                id="new-number"
                type="tel"
                inputMode="tel"
                placeholder="12 345 6789"
                value={newNumber}
                onChange={event => setNewNumber(event.target.value)}
                onKeyDown={event => event.key === 'Enter' && sendDifferentNumber()}
                className="w-full bg-transparent py-2.5 text-base focus:outline-none"
              />
            </div>
            <div className="flex gap-2">
              <Button size="sm" disabled={busy || !newNumber.trim()} onClick={sendDifferentNumber}>
                Send code
              </Button>
              <Button size="sm" variant="outline" onClick={() => setChangingNumber(false)}>
                {t('cancel')}
              </Button>
            </div>
          </div>
        )}
      </div>
    </PreClaimLayout>
  );
}

function ConsentStage({ state }: { state: FormState }) {
  const { busy, submit } = useSimpleTurn();
  const t = copyFor(state.locale);
  const [choice, setChoice] = useState<'agree' | 'decline' | null>(null);

  return (
    <PreClaimLayout
      eyebrow="Before we start"
      title="How your data is used"
      subtitle="Please read this before you tell us about your claim."
      actions={
        <Button
          disabled={busy || choice === null}
          onClick={() =>
            void submit({
              callbackValue: choice === 'agree' ? '__consent:agree' : '__consent:decline',
            })
          }
        >
          {busy ? t('saving') : t('continue')}
        </Button>
      }
    >
      {/*
        The notice, shown exactly as the server returned it, under its own
        approved title. Consent recorded against wording written here rather
        than the approved version is unprovable later — which is the whole
        reason notices are versioned and immutable, and why the page heading
        above is the form's and the heading below is the notice's.
      */}
      <div className="flex flex-col gap-3 rounded-xl border bg-background p-5">
        <h2 className="text-[15px] font-bold">
          {state.consent?.title ?? 'Personal Data Protection Notice'}
        </h2>
        <p className="whitespace-pre-wrap text-sm leading-relaxed">{state.consent?.body}</p>
        {state.consent && (
          <p className="text-xs text-muted-foreground">Version {state.consent.version}</p>
        )}
      </div>

      {/*
        Two options rather than two buttons. A pair of buttons makes declining
        look like a way out of the page; a choice makes it what it is — an
        answer, given deliberately, that the next screen acts on.
      */}
      <div role="radiogroup" aria-label="Do you agree?" className="flex flex-col gap-2">
        {[
          { value: 'agree' as const, label: t('agree') },
          { value: 'decline' as const, label: t('decline') },
        ].map(option => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={choice === option.value}
            disabled={busy}
            onClick={() => setChoice(option.value)}
            className={cn(
              'flex min-h-[52px] items-center gap-3 rounded-xl border px-4 text-left text-[15px]',
              choice === option.value
                ? 'border-primary bg-primary/5 font-semibold text-primary'
                : 'border-input hover:border-primary/40'
            )}
          >
            <span
              className={cn(
                'flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border-2',
                choice === option.value
                  ? 'border-primary bg-primary text-[10px] text-primary-foreground'
                  : 'border-muted-foreground'
              )}
            >
              {choice === option.value ? '✓' : ''}
            </span>
            {option.label}
          </button>
        ))}
      </div>

      <p className="text-xs text-muted-foreground">{t('declineNote')}</p>
    </PreClaimLayout>
  );
}

/**
 * Which kind of claim, and the first screen that shows the section list.
 *
 * Start, Code and Consent have no list: no claim exists, so there is nothing to
 * be part-way through. From here there is — the six sections are a fixed set
 * whose names do not depend on which flow gets chosen, so the list can be shown
 * before the flow is. Seeing the shape of what is ahead is most useful at the
 * point somebody is deciding whether to begin.
 *
 * No case exists yet, so completeness is not read from answers: Claim type is
 * the one in progress and everything after it is untouched.
 */
function ClaimTypeStage({ state }: { state: FormState }) {
  const { busy, submit } = useSimpleTurn();
  const [chosen, setChosen] = useState<string | null>(null);
  const t = copyFor(state.locale);

  const sections: ResolvedSection[] = SECTIONS.map(section => ({
    ...section,
    steps: [],
    complete: false,
    untouched: true,
  }));

  return (
    <SectionLayout
      sections={sections}
      activeId="claim-type"
      title={CLAIM_TYPE_SECTION.heading}
      subtitle={CLAIM_TYPE_SECTION.subtitle}
      locale={state.locale}
      // Nothing has been answered, so the rail has nothing to list. It is still
      // drawn, because a column that appears once the first answer lands would
      // shift the whole page sideways at the worst moment.
      summary={[]}
      /*
        Chosen, then confirmed — rather than advancing on the tap itself.

        This is the one answer that cannot be changed afterwards: it pins the
        flow to the case and decides every question that follows, and there is
        no turn that re-pins it, so a mis-tap costs the whole claim request and
        Start again is the only way back. On a phone, where these are stacked
        and thumb-sized, that is a real risk rather than a theoretical one.
      */
      actions={
        <Button
          disabled={busy || !chosen}
          onClick={() => chosen && void submit({ callbackValue: chosen })}
        >
          {busy ? t('saving') : t('continue')}
        </Button>
      }
    >
      <div className="grid gap-2.5 sm:grid-cols-2">
        {(state.claimTypes ?? []).map(choice => (
          <button
            key={choice.value}
            type="button"
            disabled={busy}
            aria-pressed={chosen === choice.value}
            onClick={() => setChosen(choice.value)}
            className={cn(
              'flex min-h-[56px] items-center gap-3 rounded-xl border px-4 py-3 text-left',
              chosen === choice.value
                ? 'border-primary bg-primary/5'
                : 'border-input bg-background hover:border-primary/40',
              busy && 'opacity-60'
            )}
          >
            {/*
              A filled circle, like the consent screen's. These are five
              options where exactly one is picked and then confirmed, so they
              have to look like a choice being held rather than a button that
              did not fire — which is what a bare tile reads as once the tap no
              longer moves the page.
            */}
            <span
              className={cn(
                'flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border-2',
                chosen === choice.value
                  ? 'border-primary bg-primary text-[10px] text-primary-foreground'
                  : 'border-muted-foreground'
              )}
            >
              {chosen === choice.value ? '✓' : ''}
            </span>
            <span className="flex min-w-0 flex-col gap-0.5">
            <span className="text-sm font-medium">{choice.label}</span>
            {/*
              What the type covers, from the flow rather than written here, so
              the same help appears wherever this question is asked.
            */}
            {choice.description && (
              <span className="text-xs text-muted-foreground">{choice.description}</span>
            )}
            </span>
          </button>
        ))}
      </div>
      {/*
        Not shown. The bot's message here is the question itself — "What has
        happened? Choose the option that fits best" — which the heading above
        already asks. On the chat it is the only place the question can appear;
        on a form it is the same sentence twice.
      */}
    </SectionLayout>
  );
}

/**
 * What happens next, in the order it happens.
 *
 * Three numbered stages rather than three sentences, because the question this
 * page answers is "how long, and what will you do?" — and a list a claimant can
 * count is the difference between waiting and wondering. Each says roughly when
 * and what would interrupt it.
 *
 * Two departures from the approved design, both because the design predates
 * decisions taken since. It said "come back to this site with the same number":
 * progress is per-device now (D1), so that would be a promise the system does
 * not keep. And it offered "Message our team" — the form is submit-only and has
 * no thread for a reply to arrive in, so pointing at one would be a door that
 * opens onto nothing.
 */
function SubmittedStage({ state }: { state: FormState }) {
  const t = copyFor(state.locale);
  const answers = (state.case?.answers ?? {}) as Record<string, unknown>;
  const bank = state.flow?.steps
    .find(step => step.id === 'bank-name')
    ?.choices?.find(choice => choice.value === answers['bank-name'])?.label;

  const stages: Array<[string, string]> = [
    [
      'Documents checked',
      'Usually within one working day. We message you on WhatsApp if anything is unclear.',
    ],
    [
      'Assessment',
      'An adjuster reviews the claim. Some claims need a short video call — we book it with you.',
    ],
    [
      'Decision and payout',
      bank
        ? `Paid to ${bank}. You are told the outcome and the reasons either way.`
        : 'You are told the outcome and the reasons either way.',
    ],
  ];

  return (
    <PreClaimLayout
      title={t('submittedTitle')}
      /*
        A tick above the heading, as the design has it. This is the only page
        in the form that reports an outcome rather than asking for something,
        and after sixteen questions the first thing a claimant wants is to know
        it worked — before reading a word of it.
      */
      icon={
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-2xl text-primary">
          ✓
        </span>
      }
    >
      <p className="text-[15px] leading-relaxed text-muted-foreground">
        Reference{' '}
        <strong className="font-semibold text-foreground">{state.case?.caseNumber}</strong>. Keep
        it — it is how we find your claim request.
      </p>

      <ol className="flex flex-col gap-0 rounded-xl border bg-background">
        {stages.map(([title, detail], index) => (
          <li key={title} className="flex gap-3.5 border-b p-5 last:border-0">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
              {index + 1}
            </span>
            <div className="flex flex-col gap-1">
              <span className="text-sm font-semibold">{title}</span>
              <span className="text-sm leading-relaxed text-muted-foreground">{detail}</span>
            </div>
          </li>
        ))}
      </ol>

      <p className="text-sm leading-relaxed text-muted-foreground">
        Anything to add or change? Our team will contact you on <strong>WhatsApp</strong>, on the
        number you verified — this page will not update.
      </p>

      {/*
        A second claim, which until now there was no way to make.

        This page is where the form ends, and it ended for good: the browser
        holds a session pointing at the submitted claim, so returning to /form
        showed this screen again for ever. Somebody whose luggage was lost on
        the way home from the trip they had just claimed a delay on had nowhere
        to go.

        It is a *fresh start*, not a second claim on this thread — the same rule
        the rest of the form follows. The number is verified again, which is the
        honest cost of it and is said on the button's own line rather than
        discovered afterwards. The submitted claim is untouched: it lives on the
        server under its reference, and only this browser's pointer to it goes.
      */}
      <StartAnother caseNumber={state.case?.caseNumber} />
    </PreClaimLayout>
  );
}

/**
 * Begin a new claim request after one has been submitted.
 *
 * Guarded by the same `isFormChannelSession()` check as `StartAgain`, and for
 * the same reason: inside the Telegram Mini App the session names a messaging
 * binding this page does not own, and clearing it would strand a conversation
 * that lives somewhere else.
 */
function StartAnother({ caseNumber }: { caseNumber?: string | null }) {
  if (isFormChannelSession()) return null;

  return (
    <div className="flex flex-col gap-1.5 border-t pt-5">
      <Button
        variant="outline"
        className="self-start"
        onClick={() => {
          clearFormSession();
          window.location.reload();
        }}
      >
        Make another claim request
      </Button>
      <span className="text-xs text-muted-foreground">
        Starts a new request — we will send a code to your number again.
        {caseNumber ? ` Claim ${caseNumber} is not affected.` : ''}
      </span>
    </div>
  );
}

/** The six sections. Everything from here is driven by the flow. */
function FlowStage({ state }: { state: FormState }) {
  useStrayDropGuard();
  const send = useSendFormTurn();
  const refresh = useRefreshFormState();

  const t = copyFor(state.locale);
  const answers = (state.case?.answers ?? {}) as CaseAnswers;
  const claimTypeLabel = state.flow ? TRAVEL_CLAIM_TYPE_LABELS[state.flow.travelClaimType] : null;
  const view = useMemo(
    () => (state.flow ? sectionsFor(state.flow, answers) : null),
    [state.flow, answers]
  );

  const [activeId, setActiveId] = useState<string | null>(null);

  /**
   * The transport the engine sends through. One object, shared by Continue,
   * Change and Submit, so all three pace identically and read a refusal the
   * same way — three copies would drift, and the drift would show up as one
   * button handling a rate limit and another blaming a field.
   */
  const deps = {
    send: async (turn: Parameters<typeof send.mutateAsync>[0]) => {
      const conversation = (await send.mutateAsync(turn)) as {
        currentStep?: { id: string } | null;
        messages?: Array<{ direction: string; text: string | null }>;
      };
      const outbound = (conversation.messages ?? []).filter(m => m.direction === 'OUTBOUND');
      const outcome: TurnOutcome = {
        currentStepId: conversation.currentStep?.id ?? null,
        lastReply: outbound.length ? (outbound[outbound.length - 1].text ?? null) : null,
        /*
          A refusal arrives as two messages: the reason, then the question
          again. The form already shows the question — so what belongs under
          the field is the other one.

          A turn returns the *whole* transcript rather than only what it
          produced, so "the first message" is the greeting from ten minutes
          ago. The re-ask is recognisable instead: the conversation numbers its
          questions, `(4 of 16)`, and nothing else it says is numbered. So the
          reason is the most recent thing said that is not a question being put
          again.
        */
        reason:
          [...outbound]
            .reverse()
            .map(message => message.text ?? '')
            .find(text => text && !NUMBERED_QUESTION.test(text)) ?? null,
      };
      return outcome;
    },
    newId: newTurnId,
    wait: (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms)),
    // The edge throttle answers 429 and axios throws it. Recognised here rather
    // than in the engine, which has no business knowing about HTTP.
    isRateLimitError: isRateLimited,
  };
  const [values, setValues] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  // Where a returning claimant lands: the first section that is not finished,
  // or Review once nothing is outstanding.
  //
  // `firstIncomplete` deliberately never names Review — it is finished by
  // submitting, not by answering — so without the last fallback a claimant who
  // completed every section would meet a blank page instead of the thing they
  // came to do.
  const active: ResolvedSection | null =
    view?.sections.find(section => section.id === activeId) ??
    view?.firstIncomplete ??
    view?.sections.find(section => section.id === 'review') ??
    null;

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

  /** One answer, moved to and sent — the Change link's whole job. */
  const changeOne = async (step: FlowStep, value: string) => {
    setBusy(true);
    setErrors({});
    try {
      const result = await submitSection(
        {
          currentStepId: state.case!.currentStepId,
          values: { [step.id]: value },
          answers,
          steps: [step],
        },
        deps
      );
      if (!result.ok && result.error) {
        setErrors({ [result.error.stepId]: result.error.message });
        return;
      }
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  /**
   * Submit. The review step is a `confirm`, and 'true' is what the server
   * reads as "yes, send it" — the same value the chat sends when a claimant
   * taps the button at the end of the thread.
   */
  const onSubmit = async () => {
    const reviewStep = view.sections.find(section => section.id === 'review')?.steps[0];
    if (!reviewStep) return;

    setBusy(true);
    setErrors({});
    try {
      // Sent directly rather than through `submitSection`, because the engine's
      // test for "was that accepted?" is "did the cursor move off this step" —
      // and there is nowhere for it to move to. This is the last question. The
      // honest test is the stage the server reports afterwards, so the reply is
      // read for a refusal and the rest is left to `/state`.
      const outcome = await deps.send({
        clientMessageId: newTurnId(),
        callbackValue: 'true',
        callbackStepId: reviewStep.id,
        locale: browserLocale(),
      });

      await refresh();

      // Still on the review step with something to say means it was refused —
      // a missing required document, most often.
      if (outcome.currentStepId === reviewStep.id && outcome.lastReply) {
        setErrors({ __submit: outcome.lastReply });
      }
    } finally {
      setBusy(false);
    }
  };

  /**
   * How each answer reads on the review page.
   *
   * Documents show their filename rather than "provided": at the point of
   * submitting, "did I attach the right one?" is the question being asked, and
   * "provided" does not answer it.
   */
  const reviewRowsFor = (section: ResolvedSection): ReviewRow[] => {
    // The claim type is a real answer with no step in `flow.steps` — the server
    // asked it before a flow existed. Without this the review page opens on
    // "You & your trip" and never shows the one choice that decided everything
    // below it, which is exactly the answer somebody is most likely to want to
    // change.
    if (section.id === 'claim-type') {
      return claimTypeLabel
        ? [
            {
              step: { id: '__claim-type', label: 'Type of claim', answerType: 'text' } as FlowStep,
              label: 'Type of claim',
              value: claimTypeLabel,
              /*
                Shown, but not editable — the one place this page departs from
                the design. The claim type chose the flow, and the flow is
                pinned to the case: changing it would invalidate every answer
                below, and the server has no turn that does it. A Change link
                that cannot change anything is worse than none, so somebody who
                picked the wrong type takes Start again, which is honest about
                what it costs.
              */
              editable: false,
            },
          ]
        : [];
    }

    return section.steps
      .filter(step => step.answerType !== 'confirm')
      .filter(step => answers[step.id] !== undefined)
      .map(step => ({
        step,
        label: step.label,
        value:
          step.answerType === 'document'
            ? (state.case!.documents.find(document => document.stepId === step.id)?.fileName ??
              'Provided')
            : displayAnswer(step, answers[step.id]),
      }));
  };

  const onContinue = async () => {
    setBusy(true);
    setErrors({});
    try {
      const context = {
        currentStepId: state.case!.currentStepId,
        values,
        answers,
        steps: active.steps.filter(step => step.answerType !== 'confirm'),
        documents: state.case!.documents,
      };

      /*
        Say what is missing before sending anything.

        An empty required field produces no turn — it is not a changed answer
        and only optional questions are skipped — so the server never sees it
        and never objects. Pressing Continue on an untouched section therefore
        did nothing whatsoever: no movement, no message, nothing to act on.

        Checked here rather than left to the server because the server can only
        ever object to one question at a time, and a claimant who has filled in
        none of six would be walked through them one refusal at a time.
      */
      const missing = missingRequired(context);
      if (missing.length > 0) {
        setErrors(
          Object.fromEntries(
            missing.map(step => [
              step.id,
              step.answerType === 'document'
                ? 'Please add this document before continuing.'
                : 'Please fill this in before continuing.',
            ])
          )
        );
        focusField(missing[0].id);
        return;
      }

      const result = await submitSection(context, deps);

      if (!result.ok && result.error) {
        setErrors({ [result.error.stepId]: result.error.message });
        focusField(result.error.stepId);
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
      title={
        active.id === 'evidence'
          ? `Evidence for a ${claimTypeLabel?.toLowerCase() ?? 'claim'}`
          : active.heading
      }
      /*
        The claim type as a chip beside the line rather than as the subtitle,
        matching the design: it labels what follows instead of describing it,
        and five screens in it answers "which claim is this again?" without
        being read as an instruction.
      */
      subtitle={
        active.id === 'what-happened' ? (
          <span className="flex flex-wrap items-center gap-2">
            {claimTypeLabel && (
              <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
                {claimTypeLabel}
              </span>
            )}
            <span>{active.subtitle}</span>
          </span>
        ) : (
          active.subtitle
        )
      }
      summary={summary}
      locale={state.locale}
      actions={
        active.id === 'review' ? null : (
          <>
            {/*
              Back moves between *sections* of the form, not through the
              server's cursor. Everything answered is already saved, so this is
              navigation rather than an undo — nothing to warn about.
            */}
            {previous && (
              <Button variant="outline" disabled={busy} onClick={() => setActiveId(previous.id)}>
                {t('back')}
              </Button>
            )}
            <Button disabled={busy} onClick={() => void onContinue()}>
              {busy ? t('saving') : t('continue')}
            </Button>
          </>
        )
      }
    >
      {active.id === 'review' ? (
        <ReviewStage
          sections={view.sections}
          answers={answers}
          documents={state.case.documents}
          rowsFor={reviewRowsFor}
          busy={busy}
          error={Object.values(errors)[0] ?? null}
          onChange={changeOne}
          onSubmit={onSubmit}
          onBack={() => previous && setActiveId(previous.id)}
          locale={state.locale}
        />
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
                  A pair of *dates* stays a pair on a phone: trip start and trip
                  end are one question asked twice, they are narrow, and putting
                  a scroll between them is where a return date gets typed into
                  the start box.

                  Text fields do not. Side by side at 390px the account number
                  and the account holder are half a screen wide each, and their
                  hints wrap to four lines apiece — which is how the design has
                  it too: dates paired, everything else stacked.
                */
                className={
                  row.length === 2
                    ? row.every(step => step.answerType === 'date' || step.answerType === 'datetime')
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
                  state.case!.documents.find(document => document.stepId === step.id) ?? null
                }
                onUpload={async file => {
                  const stored = await uploadFormDocument(
                    file,
                    step.documentType ?? 'OTHER_DOCUMENT',
                    step.id
                  );
                  setValues(current => ({ ...current, [step.id]: stored.id }));
                  /*
                    The row reads "Uploaded — filename" from the *case*, not
                    from this component's state, because that is the copy that
                    survives a reload. So the upload has to be followed by a
                    re-read or the file lands on the server and the screen goes
                    on saying "Required" — which reads as a failed upload and
                    invites the claimant to send it again.
                  */
                  await refresh();
                }}
              />
            ))}
          </div>
        ))}

        {/*
          Said on the screen where documents are actually handed over, not only
          in the footer. MASTER_PLAN §6 is explicit that AI is disclosed rather
          than downplayed, and "an extractor reads this" is a different, more
          concrete claim than "parts of the assessment use AI" — this is the
          moment a claimant can decide whether they are comfortable with it.
        */}
        {active.id === 'evidence' && (
          <>
            {/*
              Two hints, one per device, because they describe two different
              gestures. Telling a phone user to drag a file is an instruction
              they cannot follow, and it is the screen where somebody most
              needs to know what the button is about to open.
            */}
            {/*
              "Onto the row", not "here". A drop is only unambiguous on the row
              it lands on: a file dropped on the card would have to be guessed
              into one of three document types, and a boarding pass filed as an
              airline delay letter is a wrong answer nobody sees until an
              adjuster opens it.
            */}
            <p className="hidden text-xs text-muted-foreground sm:block">
              Or drag a file onto the row it belongs to — JPG, PNG, HEIC or PDF, up to 50 MB.
            </p>
            <p className="text-xs text-muted-foreground sm:hidden">
              On a phone, “Add” opens your camera or photo library.
            </p>
            <p className="rounded-lg bg-muted/60 p-3 text-xs leading-relaxed text-muted-foreground">
              Documents are read by an automated extractor to pre-fill your claim. An adjuster
              checks the result.
            </p>
          </>
        )}

        {/*
          The commonest reason a payout is delayed, said where the account is
          entered rather than discovered weeks later.

          It repeats the flow's own hint on `bank-account-holder`, which I had
          removed for that reason and have put back: it is in the design, and a
          claimant skimming a form reads a boxed warning where they do not read
          a grey line under a field. If the server's wording changes, this is
          the copy that will go stale — it is the only place on this surface
          that restates something the flow already says.
        */}
        {active.id === 'payout' && (
          <p className="rounded-lg border border-amber-300 bg-amber-50 p-3.5 text-xs leading-relaxed text-amber-900">
            If the account is in someone else&rsquo;s name, give their name here — we will ask
            about it later. A name mismatch is the most common reason a payout is delayed.
          </p>
        )}
      </div>
      )}

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
  // "skip" and "later" are how the engine closes a question nobody answered.
  // They are the right thing to send and the wrong thing to show: a summary
  // reading "Policy number — skip" looks like somebody typed the word.
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
