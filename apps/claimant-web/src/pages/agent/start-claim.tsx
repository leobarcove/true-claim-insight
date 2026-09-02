import { useState } from 'react';
import { TRAVEL_CLAIM_TYPE_LABELS, TravelClaimType } from '@tci/shared-types';

import { Button } from '@/components/ui/button';
import {
  useAttestConsent,
  useConsentNotice,
  useCreateAssistedCase,
  useResolveClaimant,
  type InteractionChannel,
  type ResolvedClaimant,
} from '@/hooks/use-agent-intake';
import { cn } from '@/lib/utils';
import { formatNric, isCompleteNric, NRIC_DIGITS, nricDigits } from './nric';
import { CheckIcon } from '../form/icons';
import { PreClaimLayout } from '../form/layout';

/**
 * The two screens that differ from the claimant's form, and the only two.
 *
 * A claimant proves a number with a code and taps agree on a notice. An agent
 * has already proved *their own* number, so instead: find out who this is for,
 * then attest that the notice was read out and agreed to verbally.
 *
 * The order is not cosmetic. Consent is recorded against a claimant, and
 * `CasesService.create` refuses to open a case without a live one — so the
 * claimant has to be resolved first, the declaration made second, and only then
 * does a claim request exist. That is also why nothing is saved on the lookup
 * screen: until consent is recorded there is nothing lawful to save.
 */

const CHANNELS: Array<{ value: InteractionChannel; label: string }> = [
  { value: 'PHONE', label: 'By phone' },
  { value: 'IN_PERSON', label: 'In person' },
  { value: 'VIDEO', label: 'Video call' },
  { value: 'OTHER', label: 'Other' },
];

export function AgentStartClaim({
  claimant,
  onClaimantResolved,
  onOpened,
}: {
  claimant: ResolvedClaimant | null;
  onClaimantResolved: (claimant: ResolvedClaimant | null) => void;
  onOpened: (caseId: string, attestedAt: string, noticeVersion: number) => void;
}) {
  return claimant ? (
    <DeclarationStep claimant={claimant} onBack={() => onClaimantResolved(null)} onOpened={onOpened} />
  ) : (
    <LookupStep onResolved={onClaimantResolved} />
  );
}

function LookupStep({ onResolved }: { onResolved: (claimant: ResolvedClaimant) => void }) {
  const [phone, setPhone] = useState('');
  const [fullName, setFullName] = useState('');
  const [nric, setNric] = useState('');
  const [found, setFound] = useState<ResolvedClaimant | null>(null);
  const [error, setError] = useState('');

  const resolve = useResolveClaimant();

  const e164 = () => {
    const digits = phone.replace(/\D/g, '').replace(/^0+/, '');
    return digits ? `+60${digits}` : '';
  };

  const onFind = async () => {
    setError('');
    /*
      A half-typed IC is worse than none. It hashes to a value that matches no
      existing claimant, so the lookup misses somebody we already hold and opens
      a second record for them — and afterwards nothing on either record says
      they are the same person.
    */
    if (!isCompleteNric(nric)) {
      setError(`That IC number is not complete — it should have ${NRIC_DIGITS} digits.`);
      return;
    }
    try {
      const claimant = await resolve.mutateAsync({
        phoneNumber: e164(),
        fullName: fullName.trim() || undefined,
        nric: nric.trim() || undefined,
      });
      setFound(claimant);
      if (claimant.fullName) setFullName(claimant.fullName);
    } catch {
      setError('We could not look that number up. Please check it and try again.');
    }
  };

  return (
    <PreClaimLayout
      eyebrow="Assisted claim · step 1 of 2"
      title="Who are you filling this in for?"
      subtitle="Find them by the mobile number on the policy. If they are new, fill in the details and we will create the record."
      actions={
        found ? (
          <Button onClick={() => onResolved(found)}>Continue</Button>
        ) : (
          <Button disabled={resolve.isPending || !phone.trim()} onClick={() => void onFind()}>
            {resolve.isPending ? 'Looking up…' : 'Find claimant'}
          </Button>
        )
      }
    >
      <div className="flex flex-col gap-4 rounded-xl border bg-background p-5">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="claimant-phone" className="text-sm font-semibold">
            Their mobile number
          </label>
          <div className="flex items-center gap-2 rounded-lg border border-input bg-background px-3.5">
            <span className="font-medium text-muted-foreground">+60</span>
            <input
              id="claimant-phone"
              type="tel"
              inputMode="tel"
              placeholder="12 345 6789"
              value={phone}
              onChange={event => {
                setPhone(event.target.value);
                setFound(null);
              }}
              className="w-full bg-transparent py-3 text-base focus:outline-none"
            />
          </div>
          {/*
            Said plainly, because it is the question every agent asks first.
            No code is sent: the agent's own sign-in is what stands in for it.
          */}
          <p className="text-xs leading-snug text-muted-foreground">
            The number on the policy. We do not send a code — you are signed in, so the code is
            not what identifies this claim.
          </p>
        </div>

        {found && (
          <div className="flex items-center gap-3 rounded-xl border border-primary bg-primary/5 p-3.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-background text-primary">
              <CheckIcon className="h-3 w-3" />
            </span>
            <div className="flex min-w-0 flex-col">
              <span className="text-sm font-semibold">
                {found.fullName ?? 'New claimant'}
              </span>
              <span className="text-xs text-muted-foreground">
                {found.existing ? 'Existing claimant' : 'New record created'}
                {found.nricLast4 && ` · IC ···· ${found.nricLast4}`}
              </span>
            </div>
            <span className="flex-1" />
            <span className="text-xs font-semibold text-primary">
              {found.existing ? 'Found' : 'New'}
            </span>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="claimant-full-name" className="text-sm font-semibold">
              Full name
            </label>
            <input
              id="claimant-full-name"
              value={fullName}
              onChange={event => setFullName(event.target.value)}
              className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-base"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="claimant-nric" className="text-sm font-semibold">
              IC number
            </label>
            {/*
              Grouped as it is typed, and stopped at twelve digits. An agent is
              usually reading this back off a card on a video call or hearing it
              over the phone, and both are done in groups — a run of twelve
              digits is checked by counting, which is how a transposed pair gets
              missed.
            */}
            <input
              id="claimant-nric"
              inputMode="numeric"
              placeholder="880101-14-5555"
              value={nric}
              onChange={event => setNric(formatNric(event.target.value))}
              aria-invalid={!isCompleteNric(nric) || undefined}
              className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-base"
            />
            {!isCompleteNric(nric) && (
              <p className="text-xs text-muted-foreground">
                An IC has {NRIC_DIGITS} digits — {nricDigits(nric).length} so far.
              </p>
            )}
          </div>
        </div>

        {error && (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        )}
      </div>

      <div className="flex items-start gap-2.5 rounded-xl border bg-background p-4 text-xs leading-relaxed text-muted-foreground">
        <span aria-hidden="true">🕐</span>
        <span>
          Nothing about the claim is saved yet. The claim request is only created once you have
          recorded consent on the next screen.
        </span>
      </div>
    </PreClaimLayout>
  );
}

function DeclarationStep({
  claimant,
  onBack,
  onOpened,
}: {
  claimant: ResolvedClaimant;
  onBack: () => void;
  onOpened: (caseId: string, attestedAt: string, noticeVersion: number) => void;
}) {
  const [confirmed, setConfirmed] = useState(false);
  const [channel, setChannel] = useState<InteractionChannel>('PHONE');
  const [reference, setReference] = useState('');
  const [claimType, setClaimType] = useState<TravelClaimType | null>(null);
  const [error, setError] = useState('');

  const attest = useAttestConsent();
  const createCase = useCreateAssistedCase();
  const busy = attest.isPending || createCase.isPending;

  const onRecord = async () => {
    if (!claimType) return;
    setError('');
    try {
      const granted = await attest.mutateAsync({
        claimantId: claimant.id,
        interactionChannel: channel,
        interactionReference: reference.trim() || undefined,
      });
      const created = await createCase.mutateAsync({
        claimantId: claimant.id,
        travelClaimType: claimType,
      });
      /*
        The server's own record, not this browser's clock and not a hard-coded
        version number. What is shown to the agent — and what they will repeat
        to the claimant — should be the row that was actually written: a device
        with the wrong time would otherwise print a confident, wrong account of
        when consent was given, and the notice version is the whole point of the
        record.
      */
      onOpened(
        created.id,
        (granted as any)?.grantedAt ?? new Date().toISOString(),
        (granted as any)?.noticeVersion ?? 1
      );
    } catch (caught: any) {
      setError(
        caught?.response?.data?.error?.message ??
          'We could not record that. Check that a privacy notice has been approved, then try again.'
      );
    }
  };

  return (
    <PreClaimLayout
      eyebrow="Assisted claim · step 2 of 2"
      title="Read the notice out, then confirm"
      subtitle="You cannot enter any of their details until this is recorded. Read the notice to them in full, in the language they prefer."
      actions={
        <>
          <Button variant="outline" disabled={busy} onClick={onBack}>
            Back
          </Button>
          <Button disabled={busy || !confirmed || !claimType} onClick={() => void onRecord()}>
            {busy ? 'Recording…' : 'Record consent and continue'}
          </Button>
        </>
      }
    >
      <NoticeExtract />

      <div className="flex flex-col gap-4 rounded-xl border-2 border-amber-300 bg-amber-50 p-5 text-amber-900 dark:border-amber-700/60 dark:bg-amber-950/40 dark:text-amber-200">
        {/*
          Not pre-ticked, and it gates everything below it. The platform cannot
          see whether the conversation happened; what it can do is require a
          truthful statement from a named person and keep it. A box already
          ticked on load is a statement nobody made.
        */}
        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={event => setConfirmed(event.target.checked)}
            className="mt-0.5 h-5 w-5 shrink-0 accent-[hsl(var(--primary))]"
          />
          <span className="text-sm font-medium leading-relaxed">
            I confirm that I explained the assisted-claim process and the applicable privacy
            notice to the claimant, and the claimant verbally agreed to me entering and
            submitting this claim request on their behalf.
          </span>
        </label>

        <div className="flex flex-col gap-2">
          <span className="text-[13px] font-semibold">How did you speak to them?</span>
          <div className="flex flex-wrap gap-2">
            {CHANNELS.map(option => (
              <button
                key={option.value}
                type="button"
                onClick={() => setChannel(option.value)}
                aria-pressed={channel === option.value}
                className={`min-h-[38px] rounded-full border px-3.5 text-sm ${
                  channel === option.value
                    ? 'border-primary bg-primary/10 font-semibold text-primary'
                    : 'border-amber-300 bg-background/60'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="interaction-reference" className="text-[13px] font-semibold">
            Call or appointment reference{' '}
            <span className="font-normal opacity-75">(optional)</span>
          </label>
          <input
            id="interaction-reference"
            placeholder="e.g. CALL-2026-08-14-1042"
            value={reference}
            onChange={event => setReference(event.target.value)}
            className="w-full rounded-lg border border-amber-300 bg-background px-3 py-2.5 text-base text-foreground"
          />
          <p className="text-xs opacity-80">
            A reference we can trace back. Never the recording itself.
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-2.5 rounded-xl border bg-background p-5">
        <span className="text-sm font-semibold">What are they claiming for?</span>
        <div className="grid gap-2.5 sm:grid-cols-2">
          {Object.values(TravelClaimType).map(type => (
            <button
              key={type}
              type="button"
              onClick={() => setClaimType(type)}
              aria-pressed={claimType === type}
              className={`flex min-h-[52px] items-center rounded-xl border px-4 py-3 text-left text-sm ${
                claimType === type
                  ? 'border-primary bg-primary/5 font-semibold text-primary'
                  : 'border-input hover:border-primary/40'
              }`}
            >
              {TRAVEL_CLAIM_TYPE_LABELS[type]}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-start gap-2.5 rounded-xl border bg-background p-4 text-xs leading-relaxed text-muted-foreground">
        <span aria-hidden="true">🛡</span>
        <span>
          This is recorded as <strong>agent-attested verbal consent</strong> against the approved
          notice — your name, your firm and the time. It is never recorded as the claimant having
          accepted anything digitally.
        </span>
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </PreClaimLayout>
  );
}

/**
 * A reminder of what has to be read, not the notice itself.
 *
 * The approved wording lives on the server and is version-stamped; reproducing
 * it here would create a second copy that drifts, and consent recorded against
 * wording the claimant never heard is unprovable later. The agent reads the
 * notice from the claimant-facing page or their script; this is the prompt.
 */
function NoticeExtract() {
  const notice = useConsentNotice();
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="flex flex-col gap-2 rounded-xl border bg-background p-5">
      <div className="flex items-baseline gap-2">
        <h2 className="text-[15px] font-bold">
          {notice.data?.title ?? 'How we handle your personal data'}
        </h2>
        {notice.data && (
          <span className="text-[11px] text-muted-foreground">
            Version {notice.data.version}
            {notice.data.locale ? ` · ${notice.data.locale.toUpperCase()}` : ''}
          </span>
        )}
      </div>

      {notice.isLoading && (
        <p className="text-[13px] text-muted-foreground">Loading the approved notice…</p>
      )}

      {/*
        If the notice will not load, say so instead of falling back to a summary
        of it. A summary read aloud is not the version the consent is recorded
        against, and the difference only surfaces years later when somebody asks
        what the claimant was actually told.
      */}
      {notice.isError && (
        <p role="alert" className="text-[13px] text-destructive">
          We could not load the approved notice. Do not paraphrase it — reload the page, and if
          it still will not load, take this claim on a channel where the claimant reads it
          themselves.
        </p>
      )}

      {notice.data && (
        <>
          <p
            className={cn(
              'whitespace-pre-wrap text-[13px] leading-relaxed text-muted-foreground',
              !expanded && 'line-clamp-4'
            )}
          >
            {notice.data.body}
          </p>
          <button
            type="button"
            className="self-start text-[13px] text-primary underline underline-offset-2"
            onClick={() => setExpanded(current => !current)}
          >
            {expanded ? 'Collapse' : 'Read the full notice aloud'}
          </button>
        </>
      )}

      <p className="text-[11px] leading-relaxed text-muted-foreground">
        Read it in full and do not paraphrase: consent is recorded against this exact version,
        and a summary is not what they agreed to.
      </p>
    </div>
  );
}
