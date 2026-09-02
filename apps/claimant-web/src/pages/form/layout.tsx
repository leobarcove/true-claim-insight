import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';
import type { ResolvedSection } from './sections';

/**
 * The frame every form page renders inside.
 *
 * Built once because all nine pages carry it. On a desktop: the section list on
 * the left, the form in the middle, the summary rail on the right. On a phone:
 * the list becomes a "Step 3 of 6" bar, the rail folds away into the Review
 * page, and the actions pin to the bottom.
 *
 * The three pre-claim pages pass no sections at all — no claim exists yet, so
 * the server has not chosen a flow and there is nothing to list or summarise.
 */

export function FormShell({
  reference,
  locale = 'en',
  onLocaleChange,
  children,
}: {
  reference?: string | null;
  locale?: 'en' | 'ms';
  onLocaleChange?: (locale: 'en' | 'ms') => void;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col bg-muted/30">
      <header className="flex h-16 items-center gap-4 border-b bg-background px-4 sm:px-16">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-primary text-[11px] font-bold text-primary-foreground">
            TCI
          </div>
          <div className="flex flex-col leading-tight">
            <span className="text-sm font-semibold">Travel Claims</span>
            <span className="text-[11px] text-muted-foreground">
              assessed by True Claim Insight
            </span>
          </div>
        </div>

        <span className="flex-1" />

        {reference && (
          <span className="hidden text-[13px] text-muted-foreground sm:inline">
            Ref <strong className="font-semibold text-foreground">{reference}</strong>
          </span>
        )}

        {/*
          The switch is real; the Malay wording for the questions is not written
          yet, so today it changes the shell and the server's own replies and
          leaves the flow in English. Shipped visible rather than hidden because
          the language setting is carried on every turn (§1.3) and the plumbing
          is what the translation work will need — a switch added later would be
          the same code with a month of "does it even work?" attached.
        */}
        <button
          type="button"
          onClick={onLocaleChange ? () => onLocaleChange(locale === 'en' ? 'ms' : 'en') : undefined}
          aria-label="Change language"
          className="flex h-[34px] items-center rounded-full border border-input bg-background px-3 text-[13px] text-muted-foreground"
        >
          <span className={locale === 'en' ? 'font-semibold text-foreground' : undefined}>EN</span>
          <span className="px-1.5">·</span>
          <span className={locale === 'ms' ? 'font-semibold text-foreground' : undefined}>BM</span>
        </button>
      </header>

      {children}

      {/*
        Said on every page rather than only at the start. A claimant reaches the
        bank details twenty minutes after any notice they read at the door, and
        that is the screen where knowing a person decides matters most.
      */}
      <footer className="flex flex-col gap-2 border-t bg-background px-4 py-4 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-16">
        <span>
          Personal data is handled under the{' '}
          <a href="#" className="underline">
            PDPA notice
          </a>
          . Parts of the assessment use AI; a person makes the decision.
        </span>
        <span>© {new Date().getFullYear()} True Claim Insight Sdn Bhd</span>
      </footer>
    </div>
  );
}

/** The centred column the three pre-claim pages use. No sections, no rail. */
export function PreClaimLayout({
  eyebrow,
  title,
  subtitle,
  children,
  actions,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-1 justify-center px-4 py-10 sm:px-16 sm:py-16">
      <main className="flex w-full max-w-[640px] flex-col gap-5">
        <div className="flex flex-col gap-1.5">
          {eyebrow && (
            <span className="text-xs font-semibold uppercase tracking-[0.08em] text-primary">
              {eyebrow}
            </span>
          )}
          <h1 className="text-2xl font-bold tracking-tight sm:text-[28px]">{title}</h1>
          {subtitle && <p className="text-[15px] leading-relaxed text-muted-foreground">{subtitle}</p>}
        </div>

        {children}

        {actions && (
          <div className="flex justify-end gap-2.5 border-t pt-5">{actions}</div>
        )}
      </main>
    </div>
  );
}

/**
 * A form section: the list, the fields, the rail.
 *
 * The rail reads straight from the answers rather than keeping state of its
 * own, so it cannot disagree with the form beside it.
 */
export function SectionLayout({
  sections,
  activeId,
  title,
  subtitle,
  children,
  actions,
  summary,
}: {
  sections: ResolvedSection[];
  activeId: string;
  title: string;
  subtitle?: string;
  children: ReactNode;
  actions: ReactNode;
  summary: Array<[string, string]>;
}) {
  const activeIndex = sections.findIndex(section => section.id === activeId);

  return (
    <>
      {/* Phone: the section list will not fit, so it becomes one line and a bar. */}
      <div className="border-b bg-background px-4 pb-3 pt-3.5 lg:hidden">
        <div className="flex justify-between text-xs text-muted-foreground">
          <span className="font-semibold text-primary">
            Step {activeIndex + 1} of {sections.length} · {sections[activeIndex]?.title}
          </span>
          {activeIndex < sections.length - 1 && <span>Next: {sections[activeIndex + 1].title}</span>}
        </div>
        <div className="mt-2 flex gap-1">
          {sections.map((section, index) => (
            <div
              key={section.id}
              className={cn(
                'h-1 flex-1 rounded-full',
                index <= activeIndex ? 'bg-primary' : 'bg-border'
              )}
            />
          ))}
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-8 px-4 py-8 sm:px-16 lg:grid lg:grid-cols-12 lg:gap-10">
        <nav aria-label="Sections" className="hidden lg:col-span-3 lg:block">
          <ol className="flex flex-col gap-0.5">
            {sections.map((section, index) => (
              <li
                key={section.id}
                aria-current={section.id === activeId ? 'step' : undefined}
                className={cn(
                  'flex h-10 items-center gap-2.5 rounded-[10px] px-3',
                  section.id === activeId && 'bg-primary/5'
                )}
              >
                <span
                  className={cn(
                    'flex h-[22px] w-[22px] items-center justify-center rounded-full text-[11px] font-semibold',
                    section.complete
                      ? 'bg-primary text-primary-foreground'
                      : section.id === activeId
                        ? 'border-2 border-primary bg-background text-primary'
                        : 'bg-muted text-muted-foreground'
                  )}
                >
                  {section.complete ? '✓' : index + 1}
                </span>
                <span
                  className={cn(
                    'text-sm',
                    section.id === activeId
                      ? 'font-semibold'
                      : section.complete
                        ? ''
                        : 'text-muted-foreground'
                  )}
                >
                  {section.title}
                </span>
              </li>
            ))}
          </ol>

          {/*
            The same questions, on a channel some people simply prefer. Said
            here rather than only at the start, because the moment somebody
            gives up on a form is halfway down it — and a claimant who leaves
            for WhatsApp starts a fresh request there, which is worth them
            knowing before they go.
          */}
          <div className="mt-4 flex items-start gap-2 rounded-[10px] border border-dashed p-3 text-xs leading-snug text-muted-foreground">
            <span aria-hidden="true">💬</span>
            <span>
              Prefer to chat? The same questions are asked on{' '}
              <a href="#" className="text-primary underline">
                WhatsApp
              </a>
              . Starting there begins a new request.
            </span>
          </div>
        </nav>

        <main className="flex flex-col gap-5 lg:col-span-6">
          <div className="flex flex-col gap-1.5">
            <h1 className="text-2xl font-bold tracking-tight sm:text-[28px]">{title}</h1>
            {subtitle && (
              <p className="text-[15px] leading-relaxed text-muted-foreground">{subtitle}</p>
            )}
          </div>

          {children}

          <div className="flex justify-end gap-2.5 border-t pt-5">{actions}</div>
        </main>

        {/*
          Not shown on a phone: there is no room beside the form, and the Review
          page serves the same purpose there.
        */}
        <aside className="hidden self-start rounded-xl border bg-background p-4 lg:col-span-3 lg:block">
          <h2 className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
            Your claim so far
          </h2>
          {summary.map(([key, value]) => (
            <div key={key} className="flex flex-col gap-0.5 border-b py-2 last:border-0">
              <span className="text-[11px] text-muted-foreground">{key}</span>
              <span className="text-[13px] font-medium">{value}</span>
            </div>
          ))}
          <p className="mt-2.5 text-xs leading-snug text-muted-foreground">
            Saved after each step on this device.
          </p>
        </aside>
      </div>
    </>
  );
}
