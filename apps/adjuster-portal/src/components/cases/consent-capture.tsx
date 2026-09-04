import { AlertTriangle, CheckCircle2, Loader2, Phone, ShieldCheck } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import type { InteractionChannel, ResolvedClaimant } from '@/hooks/use-claimant-consent';

/**
 * The consent step the staff capture form never had.
 *
 * `CasesService.create` refuses to open a Case without a live
 * `CLAIM_PROCESSING` consent, and this page recorded none — so capturing a
 * claim for anyone who had not already consented on another channel failed with
 * an opaque 400 on the Create button. The control was correct; the form simply
 * did not participate in it.
 *
 * **The two intake sources are not the same act and must not share a
 * declaration.** A phone call or a walk-in is a conversation: the notice can be
 * read out and agreed to, and an attestation is a truthful record of that. An
 * emailed FNOL is not: nobody spoke to anybody, so attesting to a verbal
 * agreement would be recording something that did not happen — in the one part
 * of the system whose whole purpose is to be evidence later.
 *
 * So the email branch offers no declaration at all. It says what is true: this
 * person has not been given the notice, so a claim cannot be opened for them
 * yet, and here is what to do instead.
 */

const CHANNELS: Array<{ value: InteractionChannel; label: string }> = [
  { value: 'PHONE', label: 'By phone' },
  { value: 'IN_PERSON', label: 'In person' },
  { value: 'VIDEO', label: 'Video call' },
  { value: 'OTHER', label: 'Other' },
];

export interface ConsentCaptureState {
  confirmed: boolean;
  interactionChannel: InteractionChannel;
  interactionReference: string;
}

export function ConsentCapture({
  intakeSource,
  claimant,
  resolving,
  hasConsent,
  state,
  onChange,
  onLookUp,
  canLookUp,
}: {
  intakeSource: 'STAFF' | 'EMAIL';
  claimant: ResolvedClaimant | null;
  resolving: boolean;
  /** Null until we have looked. */
  hasConsent: boolean | null;
  state: ConsentCaptureState;
  onChange: (state: ConsentCaptureState) => void;
  onLookUp: () => void;
  canLookUp: boolean;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-4 py-5">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-base font-semibold">Consent</h2>
        </div>

        {!claimant && (
          <div className="flex flex-wrap items-center gap-3">
            <p className="flex-1 text-sm text-muted-foreground">
              A claim cannot be opened until this claimant has an active consent on file. Look
              them up to see whether they already have one.
            </p>
            <Button size="sm" variant="outline" disabled={!canLookUp || resolving} onClick={onLookUp}>
              {resolving ? (
                <>
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  Checking…
                </>
              ) : (
                'Check consent'
              )}
            </Button>
          </div>
        )}

        {claimant && (
          <div className="flex items-center gap-3 rounded-lg border px-3.5 py-3">
            <Phone className="h-4 w-4 shrink-0 text-muted-foreground" />
            <div className="flex min-w-0 flex-col">
              <span className="text-sm font-medium">
                {claimant.fullName ?? 'Name not on file'}
              </span>
              <span className="text-xs text-muted-foreground">
                {claimant.phoneNumber}
                {claimant.nricLast4 && ` · IC ···· ${claimant.nricLast4}`} ·{' '}
                {claimant.existing ? 'existing claimant' : 'new record'}
              </span>
            </div>
          </div>
        )}

        {claimant && hasConsent === true && (
          <div className="flex items-start gap-2.5 rounded-lg border border-primary/40 bg-primary/5 px-3.5 py-3">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <p className="text-sm leading-relaxed">
              <strong>Consent is already on file</strong> for this claimant. Nothing further is
              needed — you can create the case.
            </p>
          </div>
        )}

        {claimant && hasConsent === false && intakeSource === 'STAFF' && (
          <VerbalDeclaration state={state} onChange={onChange} />
        )}

        {claimant && hasConsent === false && intakeSource === 'EMAIL' && <EmailBlocked />}
      </CardContent>
    </Card>
  );
}

/**
 * Only shown for a phone call or walk-in, where a conversation happened.
 *
 * Not pre-ticked, and it gates the Create button. The platform cannot see
 * whether the conversation took place; what it can do is require a truthful
 * statement from a named person and keep it against the exact notice version.
 * A box already ticked on load is a statement nobody made.
 */
function VerbalDeclaration({
  state,
  onChange,
}: {
  state: ConsentCaptureState;
  onChange: (state: ConsentCaptureState) => void;
}) {
  return (
    <div className="flex flex-col gap-4 rounded-lg border-2 border-amber-500/60 bg-amber-50 p-4 dark:bg-amber-950/20">
      <label className="flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          checked={state.confirmed}
          onChange={event => onChange({ ...state, confirmed: event.target.checked })}
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
              onClick={() => onChange({ ...state, interactionChannel: option.value })}
              className={cn(
                'min-h-[36px] rounded-full border px-3.5 text-sm',
                state.interactionChannel === option.value
                  ? 'border-primary bg-primary/10 font-semibold text-primary'
                  : 'border-border bg-background'
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="interaction-reference">
          Call or appointment reference{' '}
          <span className="font-normal text-muted-foreground">(optional)</span>
        </Label>
        <Input
          id="interaction-reference"
          placeholder="e.g. CALL-2026-08-14-1042"
          value={state.interactionReference}
          onChange={event => onChange({ ...state, interactionReference: event.target.value })}
        />
        <p className="text-xs text-muted-foreground">
          A reference we can trace back. Never the recording itself.
        </p>
      </div>

      <p className="text-xs leading-relaxed text-muted-foreground">
        Recorded as <strong>agent-attested verbal consent</strong> against the approved notice —
        your name, your firm and the time. Never as the claimant having accepted digitally.
      </p>
    </div>
  );
}

/**
 * The honest answer for an emailed FNOL.
 *
 * There is no declaration here on purpose. Nobody spoke to this claimant, so
 * there is no verbal agreement to attest to, and a form that offered the tick
 * anyway would be inviting a staff member to record something untrue in the
 * part of the system that exists to be evidence.
 */
function EmailBlocked() {
  return (
    <div className="flex items-start gap-2.5 rounded-lg border border-destructive/50 bg-destructive/5 px-3.5 py-3">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
      <div className="flex flex-col gap-2 text-sm leading-relaxed">
        <p>
          <strong>This claimant has no consent on file, and an email is not a conversation.</strong>{' '}
          There is nothing to attest to: nobody read them the privacy notice and nobody heard them
          agree.
        </p>
        <p className="text-muted-foreground">
          Call them, then switch this to <strong>Phone call / walk-in</strong> and record the
          verbal consent — or send them the approved notice and log the claim once they have
          agreed. The email itself stays in the FNOL queue meanwhile, so nothing is lost.
        </p>
      </div>
    </div>
  );
}
