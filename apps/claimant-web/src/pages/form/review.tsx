import { useState } from 'react';
import type { CaseAnswers, FlowStep } from '@tci/shared-types';

import { Button } from '@/components/ui/button';
import { FieldControl } from './field-control';
import { copyFor, type Locale } from './form-copy';
import type { ResolvedSection } from './sections';

/**
 * Everything the claimant has said, before they send it.
 *
 * The last chance to catch a wrong date, and the screen where a claim stops
 * being a draft. Two things it must not do: show a value the server does not
 * hold, and let somebody submit without having read what they are submitting.
 *
 * One row per answered question, rather than the condensed rows the design
 * sketches ("Trip · 12–19 Aug 2026 · Japan"). Condensing reads better and makes
 * **Change** ambiguous — one link over three answers has to pick one to open,
 * and picking wrong sends the claimant to correct a field that was already
 * right. The rows are the questions they were asked, which is also what the
 * server will accept a correction against.
 */

export interface ReviewRow {
  step: FlowStep;
  label: string;
  value: string;
  /**
   * False for the claim type, which belongs to no flow — the server asked it
   * before one was chosen, so there is no step to send an `__edit` for.
   * Changing it would mean abandoning this claim request and starting another,
   * which is a different act from correcting a date and should not hide behind
   * the same word.
   */
  editable?: boolean;
}

export function ReviewStage({
  sections,
  answers,
  documents,
  rowsFor,
  busy,
  error,
  onChange,
  onSubmit,
  onBack,
  locale = 'en',
}: {
  sections: ResolvedSection[];
  answers: CaseAnswers;
  documents: Array<{ fileName: string; stepId: string | null }>;
  /** How each answer reads on screen — dates as dates, choices as labels. */
  rowsFor: (section: ResolvedSection) => ReviewRow[];
  busy: boolean;
  error?: string | null;
  onChange: (step: FlowStep, value: string) => Promise<void>;
  onSubmit: () => Promise<void>;
  onBack: () => void;
  locale?: Locale;
}) {
  const t = copyFor(locale);
  const [editing, setEditing] = useState<FlowStep | null>(null);
  const [draft, setDraft] = useState('');
  const [confirmed, setConfirmed] = useState(false);

  const startEditing = (step: FlowStep) => {
    setEditing(step);
    setDraft(String(answers[step.id] ?? ''));
  };

  const save = async () => {
    if (!editing) return;
    await onChange(editing, draft);
    setEditing(null);
  };

  return (
    <div className="flex flex-col gap-4">
      {sections
        .filter(section => section.id !== 'review')
        .map(section => {
          const rows = rowsFor(section);
          if (rows.length === 0) return null;

          return (
            <section key={section.id} className="rounded-xl border bg-background">
              <h2 className="border-b px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                {section.title}
              </h2>

              <dl className="m-0">
              {rows.map(row => (
                <div key={row.step.id} className="border-b px-5 py-3 last:border-0">
                  {editing?.id === row.step.id ? (
                    <div className="flex flex-col gap-3">
                      <FieldControl
                        step={row.step}
                        value={draft}
                        onChange={setDraft}
                        disabled={busy}
                        error={error ?? undefined}
                        attached={
                          documents.find(document => document.stepId === row.step.id) ?? null
                        }
                      />
                      <div className="flex gap-2">
                        <Button size="sm" disabled={busy} onClick={() => void save()}>
                          {busy ? t('saving') : t('save')}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          onClick={() => setEditing(null)}
                        >
                          {t('cancel')}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start justify-between gap-4">
                      {/*
                        A description list, because that is what this is: each
                        answer is a term and its value. A screen reader then
                        reads "Trip start date, 12 August 2026" as one pair
                        rather than two unrelated lines, which is the whole
                        difference between checking a claim and guessing at it.
                      */}
                      <div className="flex min-w-0 flex-col gap-0.5">
                        <dt className="text-xs text-muted-foreground">{row.label}</dt>
                        <dd className="m-0 break-words text-[15px] font-semibold">{row.value}</dd>
                      </div>
                      {row.editable !== false && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => startEditing(row.step)}
                          className="shrink-0 text-sm font-medium text-primary underline-offset-2 hover:underline"
                        >
                          {t('change')}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))}
              </dl>
            </section>
          );
        })}

      {/*
        Not a formality, and not pre-ticked. The claim is assessed on what is
        said here, and a box already ticked when the page loads is a statement
        nobody made. It gates the submit button rather than merely sitting
        beside it.
      */}
      <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-primary/40 bg-primary/5 p-4">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={event => setConfirmed(event.target.checked)}
          className="mt-0.5 h-5 w-5 shrink-0 accent-[hsl(var(--primary))]"
        />
        <span className="text-sm leading-relaxed">
{t('confirmDeclaration')}
        </span>
      </label>

      {error && !editing && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="flex justify-end gap-2.5 border-t pt-5">
        <Button variant="outline" disabled={busy} onClick={onBack}>
          {t('back')}
        </Button>
        <Button disabled={busy || !confirmed} onClick={() => void onSubmit()}>
          {busy ? t('submitting') : t('submit')}
        </Button>
      </div>
    </div>
  );
}
