import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';
import { ChatIcon, CheckIcon } from './icons';
import { copyFor, type Locale } from './form-copy';
import type { ResolvedSection } from './sections';

/**
 * Whether to offer WhatsApp as an alternative to the form.
 *
 * Off until there is a number to send people to. The card it controls is in the
 * design and its copy is agreed; only the destination is missing.
 */
export const SHOW_CHAT_ALTERNATIVE = false;

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

/**
 * The row Back and Continue sit in.
 *
 * On a desktop it closes the column, right-aligned under the fields. On a phone
 * it pins to the bottom of the viewport and Continue takes the width that is
 * left — because these pages are long enough to scroll, and an action that
 * scrolls away is one a claimant has to go looking for, on the screen where
 * they have just finished answering and want to move on.
 *
 * `-mx-4` cancels the page padding so the bar reaches both edges, and the last
 * button grows: the primary action is always last, and on a phone it is the
 * only one worth making easy to hit.
 */
const ACTION_BAR = cn(
  'flex gap-2.5 border-t bg-background pt-5',
  'sticky bottom-0 -mx-4 px-4 pb-4 sm:static sm:mx-0 sm:px-0 sm:pb-0',
  '[&>button:last-child]:flex-1 sm:[&>button:last-child]:flex-none sm:justify-end'
);

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
  icon,
  title,
  subtitle,
  children,
  actions,
  centred = false,
}: {
  eyebrow?: string;
  /** Shown above the heading. Only the submitted page uses one. */
  icon?: ReactNode;
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
  actions?: ReactNode;
  /**
   * Centre the tick, the heading and the line under it.
   *
   * The submitted page only, as the design has it. Every other page in this
   * layout is asking for something, and a question centred over a left-aligned
   * field it belongs to reads as two separate things. This page asks for
   * nothing: it reports an outcome, and the outcome is the whole screen.
   */
  centred?: boolean;
}) {
  return (
    <div className="flex flex-1 justify-center px-4 pb-10 pt-6 sm:px-16 sm:py-16">
      <main className="flex w-full max-w-[640px] flex-col gap-5">
        <div className={cn('flex flex-col gap-1.5', centred && 'items-center text-center')}>
          {icon}
          {eyebrow && (
            <span className="text-xs font-semibold uppercase tracking-[0.08em] text-primary">
              {eyebrow}
            </span>
          )}
          <h1 className="text-2xl font-bold tracking-tight sm:text-[28px]">{title}</h1>
          {subtitle && <p className="text-[15px] leading-relaxed text-muted-foreground">{subtitle}</p>}
        </div>

        {children}

        {actions && <div className={ACTION_BAR}>{actions}</div>}
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
  locale = 'en',
  assisted = false,
}: {
  sections: ResolvedSection[];
  activeId: string;
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
  actions: ReactNode;
  summary: Array<[string, string]>;
  locale?: Locale;
  /**
   * True on the agent surface. Two pieces of copy here are addressed to the
   * claimant and are wrong — sometimes untrue — when an agent is reading them,
   * and copy that speaks to the wrong person is how a colleague ends up telling
   * a claimant something the system does not do.
   */
  assisted?: boolean;
}) {
  const activeIndex = sections.findIndex(section => section.id === activeId);
  const t = copyFor(locale);

  return (
    <>
      {/* Phone: the section list will not fit, so it becomes one line and a bar. */}
      <div className="border-b bg-background px-4 pb-3 pt-3.5 lg:hidden">
        <div className="flex justify-between text-xs text-muted-foreground">
          <span className="font-semibold text-primary">
            Step {activeIndex + 1} of {sections.length} · {sections[activeIndex]?.title}
          </span>
          {/*
            Where a claimant is going, or that they have arrived. The right-hand
            slot is never empty: a bar that shows "Next: …" for five screens and
            then nothing reads as a step that failed to load.
          */}
          <span>
            {activeIndex < sections.length - 1
              ? `Next: ${sections[activeIndex + 1].title}`
              : 'Last step'}
          </span>
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

      <div className="flex flex-1 flex-col gap-8 px-4 pb-8 pt-5 sm:px-16 sm:pt-8 lg:grid lg:grid-cols-12 lg:gap-10">
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
                  {section.complete ? <CheckIcon className="h-3 w-3" /> : index + 1}
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
            Hidden for now. The link has nowhere to go — there is no WhatsApp
            entry point wired up on this site yet — and an invitation that lands
            on the same page is worse than no invitation, particularly on the
            screen where somebody is deciding whether to keep going.

            Kept rather than deleted because the copy is settled and the
            placement is in the design: flip the flag when the WhatsApp number
            is live, and fill in the href.
          */}
          {SHOW_CHAT_ALTERNATIVE && (
          <div className="mt-4 flex items-start gap-2 rounded-[10px] border border-dashed p-3 text-xs leading-snug text-muted-foreground">
            <ChatIcon className="mt-0.5 h-4 w-4" />
            <span>
              Prefer to chat? The same questions are asked on{' '}
              <a href="#" className="text-primary underline">
                WhatsApp
              </a>
              {assisted ? '.' : '. Starting there begins a new request.'}
            </span>
          </div>
          )}

        </nav>

        <main className="flex flex-col gap-5 lg:col-span-6">
          <div className="flex flex-col gap-1.5">
            <h1 className="text-2xl font-bold tracking-tight sm:text-[28px]">{title}</h1>
            {subtitle && (
              <p className="text-[15px] leading-relaxed text-muted-foreground">{subtitle}</p>
            )}
          </div>

          {children}

          {/*
            No action bar when there is nothing to put in it. The claim-type
            screen advances on the choice itself, and an empty bordered strip
            under it reads as a button that failed to render.
          */}
          {actions && <div className={ACTION_BAR}>{actions}</div>}
        </main>

        {/*
          Not shown on a phone: there is no room beside the form, and the Review
          page serves the same purpose there.
        */}
        <aside className="hidden self-start rounded-xl border bg-background p-4 lg:col-span-3 lg:block">
          <h2 className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
            {t('claimSoFar')}
          </h2>
          {summary.map(([key, value]) => (
            <div key={key} className="flex flex-col gap-0.5 border-b py-2 last:border-0">
              <span className="text-[11px] text-muted-foreground">{key}</span>
              <span className="text-[13px] font-medium">{value}</span>
            </div>
          ))}
          {/*
            Untrue on the agent surface. A claimant's progress is tied to the
            browser session; an agent's claim is a case on the server that any
            of their colleagues could be shown. Saying "on this device" to them
            would be a promise the system does not make.
          */}
          <p className="mt-2.5 text-xs leading-snug text-muted-foreground">
            {assisted ? 'Saved to the claim request after each step.' : t('savedOnDevice')}
          </p>
        </aside>
      </div>
    </>
  );
}
