import { agentSignOut, type AgentUser, type ResolvedClaimant } from '@/hooks/use-agent-intake';

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
  claimant?: ResolvedClaimant | null;
  /** Null until the declaration is made. */
  consent?: { attestedAt: string; noticeVersion: number } | null;
}) {
  return (
    <div className="flex flex-wrap items-center gap-4 border-b border-amber-300 bg-amber-50 px-4 py-3 text-amber-900 sm:px-16 dark:border-amber-700/60 dark:bg-amber-950/40 dark:text-amber-200">
      <span aria-hidden="true" className="text-lg leading-none">
        ⚠
      </span>

      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-[13px] font-bold">
          Assisted claim
          {claimant && (
            <>
              {' '}
              — you are entering this for {claimant.fullName ?? 'this claimant'} ·{' '}
              {claimant.phoneNumber}
            </>
          )}
        </span>
        <span className="text-xs">
          {consent
            ? `Verbal consent attested by you at ${asTime(consent.attestedAt)} · notice v${consent.noticeVersion}`
            : 'Consent not yet recorded — no claim details can be entered'}
        </span>
      </div>

      <span className="flex-1" />

      {agent && (
        <span className="whitespace-nowrap text-xs">
          {agent.fullName}
          {agent.tenantName && ` · ${agent.tenantName}`} ·{' '}
          <button
            type="button"
            className="underline"
            onClick={() => {
              agentSignOut();
              window.location.reload();
            }}
          >
            Sign out
          </button>
        </span>
      )}
    </div>
  );
}
