import { useState } from 'react';
import { TRAVEL_CLAIM_TYPE_LABELS, TravelClaimType } from '@tci/shared-types';

import { Button } from '@/components/ui/button';
import {
  useAttestConsent,
  useConsentNotice,
  useCreateAssistedCase,
  useResolveClaimant,
  type ClaimSubject,
  type InteractionChannel,
} from '@/hooks/use-agent-intake';
import { cn } from '@/lib/utils';
import { CheckIcon, ClockIcon, ShieldIcon } from '../form/icons';
import { PreClaimLayout } from '../form/layout';

/**
 * The two screens that differ from the claimant's form, and the only two.
 *
 * A claimant proves a number with a code and taps agree on a notice. An agent
 * has already proved *their own* number, so instead: find out who this is for,
 * then attest that the notice was read out and agreed to verbally.
 *
 * The order is not cosmetic. Consent is recorded against a claimant, and
 * `CasesService.create` refuses to open a case without a live one — so all
 * three writes happen together, in that order, at the moment the declaration is
 * made: the claimant, the consent, then the case.
 *
 * Nothing is written on the first screen, and nothing is read either. It used
 * to call the find-*or-create* endpoint, so a number typed wrongly left a
 * claimant row carrying a name and an IC — stored before consent, on a screen
 * saying nothing was saved, one screen before another that says no details may
 * be entered until consent is recorded. Then it called a read-only lookup; now
 * it calls nothing at all. The agent types what the claimant tells them and
 * moves on, and the declaration resolves the record in one act with the
 * consent and the case.
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
  claimant: ClaimSubject | null;
  onClaimantResolved: (claimant: ClaimSubject | null) => void;
  onOpened: (caseId: string, attestedAt: string, noticeVersion: number) => void;
}) {
  return claimant ? (
    <DeclarationStep
      subject={claimant}
      onBack={() => onClaimantResolved(null)}
      onResolved={onClaimantResolved}
      onOpened={onOpened}
    />
  ) : (
    <LookupStep onChosen={onClaimantResolved} />
  );
}

function LookupStep({ onChosen }: { onChosen: (subject: ClaimSubject) => void }) {
  const [phone, setPhone] = useState('');
  const [fullName, setFullName] = useState('');
  const [error, setError] = useState('');

  const e164 = () => {
    const digits = phone.replace(/\D/g, '').replace(/^0+/, '');
    return digits ? `+60${digits}` : '';
  };

  /*
    Taken as typed, and looked up by nobody.

    This screen used to call a lookup and draw a card saying whether we already
    held this person. It is gone: the agent is on a call reading details back,
    and a search that has to be run, waited for and read before Continue becomes
    live is a step between them and the claim — for an answer that changes
    nothing they do. Whether the record exists is the *server's* business, and
    it settles it at the declaration, where `resolve` finds an existing claimant
    by IC or number and creates one only if there is none.

    Nothing is written here. That was true before this change and is more
    obviously true now: there is no request on this screen at all.
  */
  const onContinue = () => {
    if (!fullName.trim()) {
      setError('A full name is needed before consent can be recorded.');
      return;
    }
    if (!e164()) {
      setError('A mobile number is needed.');
      return;
    }
    onChosen({
      phoneNumber: e164(),
      fullName: fullName.trim(),
      nric: null,
      // Unknown, and deliberately not asked. The declaration resolves both.
      nricLast4: null,
      id: null,
      existing: false,
    });
  };

  return (
    <PreClaimLayout
      eyebrow="Assisted claim · step 1 of 2"
      title="Who are you filling this in for?"
      subtitle="Their mobile number is how we identify and reach them afterwards. Nothing is created until you record consent on the next screen."
      actions={<Button onClick={onContinue}>Continue</Button>}
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
                setError('');
              }}
              className="w-full bg-transparent py-3 text-base focus:outline-none"
            />
          </div>
          {/*
            Said plainly, because it is the question every agent asks first.
            No code is sent: the agent's own sign-in is what stands in for it.
          */}
          <p className="text-xs leading-snug text-muted-foreground">
            The number on the policy is how we reach them afterwards. No code is sent: you are
            signed in, so a code is not what identifies this claim.
          </p>
        </div>

        {/*
          The IC belongs beside the number, above the answer, because both
          decide it: the lookup matches on the IC first and falls back to the
          phone. Left below the result card it read as an afterthought — and
          typing it there quite correctly cleared the answer sitting above it,
          so an agent working top to bottom watched their result disappear.
        */}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="claimant-full-name" className="text-sm font-semibold">
            Full name
          </label>
          {/*
            The same example the flow gives for its own name field. This box
            is not a flow step — no Case exists yet — so it cannot read one,
            but an agent keying a name for a claimant who is not on file faces
            the identical question about how much of it to type.
          */}
          <input
            id="claimant-full-name"
            placeholder="e.g. Nur Aisyah binti Rahman"
            value={fullName}
            onChange={event => setFullName(event.target.value)}
            /* The name does not change who we matched, so it leaves the
               lookup standing — only the number and the IC decide that. */
            className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-base"
          />
        </div>

        {error && (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        )}
      </div>

      <div className="flex items-start gap-2.5 rounded-xl border bg-background p-4 text-xs leading-relaxed text-muted-foreground">
        <ClockIcon className="mt-0.5 h-4 w-4 text-primary" />
        <span>
          Nothing is saved yet, including the claim and this person. Their record is created
          together with the consent you record on the next screen.
        </span>
      </div>
    </PreClaimLayout>
  );
}

function DeclarationStep({
  subject,
  onBack,
  onResolved,
  onOpened,
}: {
  subject: ClaimSubject;
  onBack: () => void;
  /** The subject, once it has an id — so the band and the receipt can use it. */
  onResolved: (subject: ClaimSubject) => void;
  onOpened: (caseId: string, attestedAt: string, noticeVersion: number) => void;
}) {
  const [confirmed, setConfirmed] = useState(false);
  const [channel, setChannel] = useState<InteractionChannel>('PHONE');
  const [reference, setReference] = useState('');
  const [claimType, setClaimType] = useState<TravelClaimType | null>(null);
  const [error, setError] = useState('');

  const resolve = useResolveClaimant();
  const attest = useAttestConsent();
  const createCase = useCreateAssistedCase();
  const busy = resolve.isPending || attest.isPending || createCase.isPending;

  /**
   * The three writes consent authorises, in the order they depend on.
   *
   * The claimant record is created *here*, not on the lookup screen. That is
   * the whole point of the change: a number typed wrongly and corrected leaves
   * nothing behind, and no name or IC is stored before there is a basis for
   * storing it. `resolve` is find-or-create and idempotent, so a claimant
   * already on file is matched rather than duplicated, and blanks on their
   * record are filled from what the agent typed.
   *
   * Not a transaction — three services, three calls. The order is what makes a
   * partial failure safe: a claimant with no consent and no case is a row that
   * a retry finds and reuses, where a case with no consent would be a claim
   * nobody agreed to.
   */
  const onRecord = async () => {
    if (!claimType) return;
    setError('');
    try {
      const claimant = await resolve.mutateAsync({
        phoneNumber: subject.phoneNumber,
        fullName: subject.fullName ?? undefined,
      });
      onResolved({
        ...subject,
        id: claimant.id,
        fullName: claimant.fullName ?? subject.fullName,
        nricLast4: claimant.nricLast4 ?? subject.nricLast4,
      });

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
            I confirm that I explained the assisted-claim process and the applicable privacy notice
            to the claimant, and the claimant verbally agreed to me entering and submitting this
            claim request on their behalf.
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
            Call or appointment reference <span className="font-normal opacity-75">(optional)</span>
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
        <ShieldIcon className="mt-0.5 h-4 w-4 text-primary" />
        <span>
          This is recorded as <strong>agent-attested verbal consent</strong> against the approved
          notice, including your name, your firm and the time. It is never recorded as the claimant
          having accepted anything digitally.
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
      {/*
        The title alone. The version is still recorded against the consent — it
        is what makes the attestation provable, and the band and the receipt
        both name it — but it is not something the person being read to needs
        printed beside the heading they are hearing.
      */}
      <h2 className="text-[15px] font-bold">
        {notice.data?.title ?? 'How we handle your personal data'}
      </h2>

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
          We could not load the approved notice. Do not paraphrase it. Reload the page, and if it
          still will not load, take this claim on a channel where the claimant reads it themselves.
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
            {/*
              What the control does, not what the agent should do with it —
              pressing this expands four clamped lines, it does not read
              anything out. The instruction to read it aloud is in the line
              below and in the screen's own subtitle, which is where it belongs
              and where it already was, twice.
            */}
            {expanded ? 'Hide the full notice' : 'Show the full notice'}
          </button>
        </>
      )}

      <p className="text-[11px] leading-relaxed text-muted-foreground">
        Read it in full and do not paraphrase: consent is recorded against this exact version, and a
        summary is not what they agreed to.
      </p>
    </div>
  );
}
