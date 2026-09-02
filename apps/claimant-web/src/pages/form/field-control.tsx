import { useRef, useState } from 'react';
import type { FlowStep } from '@tci/shared-types';

import { cn } from '@/lib/utils';
import { CameraIcon, CheckIcon, UploadIcon } from './icons';
import { acceptsDigitsOnly, keepDigits } from './digits-only';

/**
 * One field of the form.
 *
 * The chat's `AnswerControl` renders the same `answerType`s, but chat-shaped:
 * it sends on Enter, because in a conversation answering *is* sending. A form
 * field holds its value until the section is submitted, shows its own label and
 * hint, and carries its own error underneath. Same rules, different verb.
 *
 * Keyed off `answerType` alone, so a step added to a flow renders here with no
 * form code written — which is the whole reason the form is cheap to build.
 */

/** Above this, a list is a search problem rather than a choice. */
const RADIO_MAX = 6;

/** Chips shown at once. Beyond two rows they stop being a shortlist. */
const CHIP_MAX = 8;

/**
 * Whether a choice step renders as chips rather than a radio group.
 *
 * One rule, used by both the control and the label above it, so the two cannot
 * disagree about who draws the hint.
 */
const usesChips = (step: FlowStep): boolean =>
  (step.choices?.length ?? 0) > RADIO_MAX || Boolean(step.allowOther);

interface FieldProps {
  step: FlowStep;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  disabled?: boolean;
  /** Documents are stored before they are named on a turn. */
  onUpload?: (file: File) => Promise<void>;
  /** A file already attached to this step, if any. */
  attached?: { fileName: string } | null;
}

const labelFor = (step: FlowStep) =>
  step.optional ? (
    <>
      {step.label} <span className="font-normal text-muted-foreground">(optional)</span>
    </>
  ) : (
    step.label
  );

export function FieldControl({
  step,
  value,
  onChange,
  error,
  disabled,
  onUpload,
  attached,
}: FieldProps) {
  const describedBy = error ? `${step.id}-error` : step.hint ? `${step.id}-hint` : undefined;

  /**
   * A chip list renders its own hint, between the box and the chips.
   *
   * Placement is not decoration here: the hint is "tap one below, or type it if
   * it is not listed", and underneath the chips it is an instruction arriving
   * after the thing it instructs. So that control takes the hint, and this one
   * stops drawing it — otherwise it would appear twice.
   */
  /*
    Whether something else on the page is already saying this step's hint.

    Chips say theirs above the list. The payout warning repeats the account
    holder hint word for word — it is in the design as a boxed warning, and a
    claimant skimming reads a box where they do not read a grey line, but two
    copies of one sentence on one screen reads as a mistake.
  */
  const ownsHint =
    (step.answerType === 'choice' && usesChips(step)) || step.id === 'bank-account-holder';

  /**
   * A document row carries its own name and status, so the label above it would
   * be the same words twice — which is how "Boarding pass / Boarding pass /
   * Required" ends up on screen.
   */
  const ownsLabel = step.answerType === 'document';

  return (
    <div className="flex flex-col gap-1.5">
      {!ownsLabel && (
        <label htmlFor={step.id} className="text-sm font-semibold">
          {labelFor(step)}
        </label>
      )}

      <FieldInput
        step={step}
        value={value}
        onChange={onChange}
        invalid={Boolean(error)}
        describedBy={describedBy}
        disabled={disabled}
        onUpload={onUpload}
        attached={attached}
      />

      {/*
        The error replaces the hint rather than joining it. Both at once is two
        things to read at the moment the claimant is least willing to read, and
        the hint is advice they have visibly already tried to follow.
      */}
      {error ? (
        <p id={`${step.id}-error`} role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : step.hint && !ownsHint ? (
        <p id={`${step.id}-hint`} className="text-xs leading-snug text-muted-foreground">
          {step.hint}
        </p>
      ) : null}
    </div>
  );
}

function FieldInput({
  step,
  value,
  onChange,
  invalid,
  describedBy,
  disabled,
  onUpload,
  attached,
}: {
  step: FlowStep;
  value: string;
  onChange: (value: string) => void;
  invalid: boolean;
  describedBy?: string;
  disabled?: boolean;
  onUpload?: (file: File) => Promise<void>;
  attached?: { fileName: string } | null;
}) {
  const base = cn(
    'w-full rounded-lg border bg-background px-3 py-2.5 text-base',
    'focus:outline-none focus:ring-2 focus:ring-primary/40',
    invalid ? 'border-destructive' : 'border-input'
  );

  if (step.answerType === 'document') {
    return (
      <DocumentField
        step={step}
        invalid={invalid}
        describedBy={describedBy}
        disabled={disabled}
        onUpload={onUpload}
        attached={attached}
        onSkip={() => onChange('skip')}
      />
    );
  }

  if (step.answerType === 'choice') {
    const choices = step.choices ?? [];

    // A closed list of a few options is a radio group: every option is a value
    // the step will accept, so hiding one would be a dead end with nothing to
    // type instead.
    if (!usesChips(step)) {
      return (
        <div role="radiogroup" aria-describedby={describedBy} className="flex flex-col gap-2">
          {choices.map(choice => (
            <button
              key={choice.value}
              type="button"
              role="radio"
              aria-checked={value === choice.value}
              disabled={disabled}
              onClick={() => onChange(choice.value)}
              className={cn(
                'flex min-h-[44px] items-center gap-3 rounded-lg border px-3 py-2 text-left text-sm',
                value === choice.value
                  ? 'border-primary bg-primary/5 font-medium text-primary'
                  : 'border-input hover:border-primary/40'
              )}
            >
              <span
                className={cn(
                  'h-4 w-4 shrink-0 rounded-full border-2',
                  value === choice.value ? 'border-primary bg-primary' : 'border-muted-foreground'
                )}
              />
              <span>
                {choice.label}
                {choice.description && (
                  <span className="block text-xs text-muted-foreground">{choice.description}</span>
                )}
              </span>
            </button>
          ))}
        </div>
      );
    }

    return (
      <ChoiceWithChips
        step={step}
        value={value}
        onChange={onChange}
        invalid={invalid}
        describedBy={describedBy}
        disabled={disabled}
      />
    );
  }

  if (step.answerType === 'confirm') {
    return (
      <p aria-describedby={describedBy} className="text-sm leading-relaxed text-muted-foreground">
        {step.prompt}
      </p>
    );
  }

  if (step.answerType === 'number') {
    return (
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">RM</span>
        <input
          id={step.id}
          type="number"
          inputMode="decimal"
          className={base}
          value={value}
          disabled={disabled}
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          onChange={event => onChange(event.target.value)}
        />
      </div>
    );
  }

  /*
    A field whose rule is "digits, nothing else" refuses everything else as it
    is typed, and strips a paste down to its digits rather than rejecting it —
    an account number copied off a statement arrives full of spaces, and making
    somebody retype it by hand is how a digit gets transposed.

    Kept out of `type="number"`, which brings a spinner, scroll-wheel edits and
    exponent notation to a field that is not a quantity, and drops leading
    zeros — of which Malaysian account numbers have plenty.
  */
  const digitsOnly = acceptsDigitsOnly(step);

  return (
    <input
      id={step.id}
      type={
        step.answerType === 'date'
          ? 'date'
          : step.answerType === 'datetime'
            ? 'datetime-local'
            : step.answerType === 'phone'
              ? 'tel'
              : 'text'
      }
      inputMode={step.answerType === 'phone' ? 'tel' : digitsOnly ? 'numeric' : undefined}
      className={base}
      value={value}
      disabled={disabled}
      aria-describedby={describedBy}
      aria-invalid={invalid || undefined}
      onChange={event => onChange(digitsOnly ? keepDigits(event.target.value) : event.target.value)}
    />
  );
}

/**
 * A drop zone on a desktop, the camera on a phone.
 *
 * `capture` is deliberately absent: it forces the camera and hides the gallery,
 * and the commonest evidence a claimant has is a screenshot or a photo they
 * took an hour ago. `accept` narrows the picker to what the server accepts —
 * a convenience, not a control, since the server checks the bytes themselves.
 */
function DocumentField({
  step,
  invalid,
  describedBy,
  disabled,
  onUpload,
  attached,
  onSkip,
}: {
  step: FlowStep;
  invalid: boolean;
  describedBy?: string;
  disabled?: boolean;
  onUpload?: (file: File) => Promise<void>;
  attached?: { fileName: string } | null;
  onSkip: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);

  const handle = async (file: File | undefined) => {
    if (!file || !onUpload) return;
    setBusy(true);
    try {
      await onUpload(file);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      onDragOver={event => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={event => {
        event.preventDefault();
        setDragging(false);
        void handle(event.dataTransfer.files?.[0]);
      }}
      className={cn(
        'flex flex-wrap items-center gap-3 rounded-xl border p-3.5',
        dragging ? 'border-primary bg-primary/5' : invalid ? 'border-destructive' : 'border-input'
      )}
    >
      {/*
        A tile that says at a glance whether this one has arrived: a tick where
        it has, the upload mark where it has not. On a phone the three rows are
        otherwise near-identical blocks of text, and the claimant is scanning
        for what is left rather than reading them.
      */}
      <span
        className={cn(
          'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sm',
          attached ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
        )}
        aria-hidden="true"
      >
        {attached ? <CheckIcon className="h-4 w-4" /> : <UploadIcon className="h-4 w-4" />}
      </span>

      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-sm font-semibold">{step.label}</span>
        {/*
          Required or optional, said on the row itself. A claimant deciding what
          to go and find needs to know which of these they can leave — and
          "(optional)" tucked into a label is the first thing the eye skips.
        */}
        {/*
          An arrived file is green with a tick; everything still outstanding
          stays grey. The same signal the section list uses for a finished step,
          so "done" looks the same wherever a claimant meets it — and on a page
          of near-identical rows, colour is what carries the difference at a
          glance, before any of the words are read.
        */}
        <span
          className={cn(
            'flex items-center gap-1 text-xs',
            attached ? 'font-medium text-primary' : 'text-muted-foreground'
          )}
        >
          {attached ? (
            <>
              <CheckIcon className="h-3.5 w-3.5" />
              <span className="min-w-0 truncate">Uploaded — {attached.fileName}</span>
            </>
          ) : step.optional ? (
            'Optional'
          ) : (
            'Required'
          )}
        </span>
      </div>

      <button
        type="button"
        disabled={disabled || busy}
        onClick={() => inputRef.current?.click()}
        aria-describedby={describedBy}
        className={cn(
          'flex min-h-[38px] shrink-0 items-center gap-1.5 rounded-full border px-4 text-sm font-medium disabled:opacity-60',
          attached
            ? 'border-input hover:border-primary/40'
            : 'border-primary text-primary hover:bg-primary/5'
        )}
      >
        {/*
          A camera on the button that adds, as the design has it, and nothing
          on the one that replaces. It says what tapping does before the sheet
          opens — on a phone this is the camera or the photo library, and that
          is the moment a claimant decides whether they have the document to
          hand or are about to go and photograph it.
        */}
        {!busy && !attached && <CameraIcon className="h-4 w-4" />}
        {busy ? 'Uploading…' : attached ? 'Replace' : 'Add'}
      </button>

      {step.optional && !attached && (
        <button
          type="button"
          disabled={disabled}
          onClick={onSkip}
          className="shrink-0 text-xs text-muted-foreground underline"
        >
          I do not have this
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        className="hidden"
        accept="image/jpeg,image/png,image/webp,image/heic,application/pdf"
        onChange={event => void handle(event.target.files?.[0])}
      />
    </div>
  );
}

/**
 * A long or open list: type to narrow, or tap one of the common answers.
 *
 * A dropdown would be shorter to write and worse to use here. `allowOther`
 * lists are the *common* answers rather than the legal ones, so the box is not
 * a fallback but the point — a claimant flying an airline that is not on the
 * list can see the question is wrong for them and needs somewhere to say so.
 * And thirty destination options in a `<select>` is a search problem with the
 * search taken away.
 *
 * The chips are the shortlist, filtered as they type. The typed text is the
 * answer when it matches no chip, which is exactly what `allowOther` means on
 * the server: a value not in `choices` is stored verbatim.
 */
function ChoiceWithChips({
  step,
  value,
  onChange,
  invalid,
  describedBy,
  disabled,
}: {
  step: FlowStep;
  value: string;
  onChange: (value: string) => void;
  invalid: boolean;
  describedBy?: string;
  disabled?: boolean;
}) {
  const choices = step.choices ?? [];
  const selected = choices.find(choice => choice.value === value);
  const [query, setQuery] = useState(selected?.label ?? '');

  const matching = query.trim()
    ? choices.filter(choice => choice.label.toLowerCase().includes(query.trim().toLowerCase()))
    : choices;

  // Enough to scan, few enough to fit two rows. Beyond that the chips stop
  // being a shortlist and become the list they were meant to replace.
  const shown = matching.slice(0, CHIP_MAX);

  return (
    <div className="flex flex-col gap-2">
      <div
        className={cn(
          'flex items-center gap-2 rounded-lg border bg-background px-3',
          invalid ? 'border-destructive' : 'border-input'
        )}
      >
        <input
          id={step.id}
          type="text"
          className="w-full bg-transparent py-2.5 text-base focus:outline-none"
          value={query}
          disabled={disabled}
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          onChange={event => {
            setQuery(event.target.value);
            // Typed text is the answer until a chip is tapped. On a closed list
            // it will be refused by the server, which is the honest place for
            // that rule to live — the client does not own what is valid.
            const match = choices.find(
              choice => choice.label.toLowerCase() === event.target.value.trim().toLowerCase()
            );
            onChange(match ? match.value : event.target.value);
          }}
        />
        <SearchIcon />
      </div>

      {step.hint && (
        <p id={`${step.id}-hint`} className="text-xs leading-snug text-muted-foreground">
          {step.hint}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {shown.map(choice => (
          <button
            key={choice.value}
            type="button"
            disabled={disabled}
            aria-pressed={value === choice.value}
            onClick={() => {
              onChange(choice.value);
              setQuery(choice.label);
            }}
            className={cn(
              'min-h-[38px] rounded-full border px-3.5 text-sm',
              value === choice.value
                ? 'border-primary bg-primary/5 font-semibold text-primary'
                : 'border-input hover:border-primary/40'
            )}
          >
            {choice.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function SearchIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      className="shrink-0 text-muted-foreground"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}
