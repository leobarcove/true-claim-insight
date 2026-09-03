import { useEffect, useState } from 'react';

import { agentSignOut, type AgentUser } from '@/hooks/use-agent-intake';

import { cn } from '@/lib/utils';

import { AlertIcon, CheckIcon } from '../form/icons';
import { asTime } from './when';

/**
 * The strip across every assisted screen, and across no claimant screen.
 *
 * Amber rather than the site's green on purpose. It is not decoration and not a
 * status badge: it is a standing reminder that **the person typing is not the
 * person the data is about**. An agent moves between claims all day, and the
 * mistake it exists to prevent is entering one claimant's details into
 * another's claim — which nothing downstream would catch, because every field
 * would be perfectly valid.
 *
 * It also carries the consent state, because that is the one thing an agent
 * must not lose track of. Before the declaration it says so plainly: no claim
 * details can be entered yet. Afterwards it names the notice version and the
 * time, so the attestation is visible on the screen where the data is being
 * typed rather than filed away on a page nobody revisits.
 */
export function AgentBand({
  agent,
  claimant,
  consent,
}: {
  agent: AgentUser | null;
  /**
   * Who the claim is for — by name and number only.
   *
   * Deliberately not `ResolvedClaimant`: the band is drawn on the declaration
   * screen, where no record exists yet and there is therefore no id. What it
   * needs is the two things that stop an agent typing into the wrong claim, and
   * both are known from the moment they were typed.
   */
  claimant?: { fullName: string | null; phoneNumber: string } | null;
  /** Null until the declaration is made. */
  consent?: { attestedAt: string; noticeVersion: number } | null;
}) {
  const signOut = () => {
    agentSignOut();
    window.location.reload();
  };

  /*
    The initials open a panel; they do not sign anybody out.

    They used to do it on the tap, which is a trap on the screen where it sits:
    a 44px circle beside the claimant's name, ending the session and throwing
    away a half-entered claim with no warning and nothing on it saying so. An
    agent reaching for it to check whose account they are in lost the claim
    instead. An avatar opens an account panel everywhere else in software, and
    that is what this one does — the destructive action is behind a button that
    says what it is.
  */
  const [accountOpen, setAccountOpen] = useState(false);

  useEffect(() => {
    if (!accountOpen) return;
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setAccountOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [accountOpen]);

  const consentLine = consent
    ? `Verbal consent attested by you at ${asTime(consent.attestedAt)} · notice v${consent.noticeVersion}`
    : 'Consent not yet recorded — no claim details can be entered';

  return (
    <div className="flex flex-col gap-1.5 border-b border-amber-300 bg-amber-50 px-4 py-2 text-amber-900 sm:flex-row sm:items-center sm:gap-4 sm:px-16 sm:py-3 dark:border-amber-700/60 dark:bg-amber-950/40 dark:text-amber-200">
      {/*
        One row at 1440, two on a phone, and the split is not cosmetic.

        Wrapped to 390px the desktop row becomes four lines, and the line that
        wraps off the bottom is the consent state — the one thing an agent must
        not lose track of, pushed under the fold by the agent's own name. So on a
        phone the claimant goes on top, consent gets a tinted row of its own
        where it cannot be skimmed past, and the agent's own identity comes down
        to the initials button that holds Sign out. From `sm` the desktop shape
        returns: consent as the second line of the name column, agent on the
        right.

        `consentLine` is written once and mounted twice rather than duplicated
        as copy — two strings saying the same thing is how one of them ends up
        stale.
      */}
      {/*
        `sm:flex-1` is load-bearing: from `sm` the outer element is the row, and
        without it this wrapper takes only its content width — the spacer below
        then has nothing to push against and the agent's name sits against the
        claimant's instead of at the right edge.
      */}
      <div className="flex items-center gap-2 sm:flex-1 sm:gap-4">
        <AlertIcon className="h-4 w-4 shrink-0" />

        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="text-[13px] font-bold leading-tight">
            {claimant ? <>Entering for {claimant.fullName ?? 'this claimant'}</> : 'Assisted claim'}
          </span>
          {claimant && <span className="text-xs leading-tight">{claimant.phoneNumber}</span>}
          <span className="hidden text-xs leading-tight sm:inline">{consentLine}</span>
        </div>

        <span className="flex-1" />

        {agent && (
          <>
            {/*
              The agent, as initials on a phone and by name from `sm` up. Their
              own name is the least useful thing on this strip — they know who
              they are — but Sign out has to live somewhere, and 44px is the
              size a thumb needs.
            */}
            <button
              type="button"
              aria-label={`Signed in as ${agent.fullName} — account`}
              aria-expanded={accountOpen}
              aria-haspopup="dialog"
              onClick={() => setAccountOpen(open => !open)}
              className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-amber-300 bg-background text-xs font-bold after:absolute after:-inset-1.5 after:content-[''] sm:hidden dark:border-amber-700/60"
            >
              {initialsOf(agent.fullName)}
            </button>

            <span className="hidden whitespace-nowrap text-xs sm:inline">
              {agent.fullName}
              {agent.tenantName && ` · ${agent.tenantName}`} ·{' '}
              <button type="button" className="underline" onClick={signOut}>
                Sign out
              </button>
            </span>
          </>
        )}
      </div>

      {/*
        The account panel the initials open. Phone only — from `sm` the name and
        Sign out are already on the strip, so there is nothing to reveal.
      */}
      {agent && accountOpen && (
        <div
          role="dialog"
          aria-label="Account"
          className="flex flex-col gap-2 rounded-lg border border-amber-300 bg-background p-3 sm:hidden dark:border-amber-700/60"
        >
          <div className="flex min-w-0 flex-col">
            <span className="text-[13px] font-semibold text-foreground">{agent.fullName}</span>
            {agent.tenantName && (
              <span className="text-xs text-muted-foreground">{agent.tenantName}</span>
            )}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={signOut}
              className="min-h-[38px] flex-1 rounded-full border border-input px-4 text-sm font-medium text-foreground"
            >
              Sign out
            </button>
            <button
              type="button"
              onClick={() => setAccountOpen(false)}
              className="min-h-[38px] rounded-full px-4 text-sm text-muted-foreground"
            >
              Close
            </button>
          </div>
          {/*
            Said because it is the thing an agent would not think to ask before
            tapping, and cannot undo afterwards.
          */}
          <span className="text-xs text-muted-foreground">
            Signing out ends this claim entry. Anything not yet submitted is lost.
          </span>
        </div>
      )}

      {/* Phone only: the same sentence, given a row and a tint of its own. */}
      <span
        className={cn(
          'flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] leading-snug sm:hidden',
          consent ? 'bg-background/70 dark:bg-amber-950/40' : 'bg-amber-100 dark:bg-amber-900/40'
        )}
      >
        {consent ? (
          <CheckIcon className="h-3 w-3 shrink-0" />
        ) : (
          <AlertIcon className="h-3 w-3 shrink-0" />
        )}
        {consentLine}
      </span>
    </div>
  );
}

/** Two letters for the initials button: the first name and the last. */
function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return ((parts[0][0] ?? '') + (parts.length > 1 ? (parts[parts.length - 1][0] ?? '') : '')).toUpperCase();
}
