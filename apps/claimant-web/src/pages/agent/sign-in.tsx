import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { useAgentSendCode, useAgentVerifyCode } from '@/hooks/use-agent-intake';
import { PreClaimLayout } from '../form/layout';

/**
 * Staff sign-in: their own mobile, a WhatsApp code, no password.
 *
 * The same thing a claimant proves, about a different handset. There is no
 * password anywhere on this site, and adding one for staff would have created
 * the only one in the whole claimant-facing product — a secret to leak, reset
 * and quietly share between colleagues. Access is granted and revoked by which
 * numbers the firm has on its accounts.
 *
 * The number asked for is the **agent's**, and the screen says so, because the
 * very next screen asks for the claimant's. Getting those two the wrong way
 * round is the obvious mistake and the copy is where it is prevented.
 */
export function AgentSignInPage({ onSignedIn }: { onSignedIn: () => void }) {
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [keepSignedIn, setKeepSignedIn] = useState(true);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const sendCode = useAgentSendCode();
  const verify = useAgentVerifyCode();

  const e164 = () => {
    const digits = phone.replace(/\D/g, '').replace(/^0+/, '');
    return digits ? `+60${digits}` : '';
  };

  const onSend = async () => {
    setError('');
    try {
      await sendCode.mutateAsync(e164());
      setSent(true);
    } catch {
      setError('We could not send a code just now. Please try again.');
    }
  };

  const onVerify = async () => {
    setError('');
    try {
      await verify.mutateAsync({ phoneNumber: e164(), code, keepSignedIn });
      onSignedIn();
    } catch {
      // Deliberately the same message the server gives, which does not
      // distinguish a wrong code from an unknown number — "is this person one
      // of yours?" is exactly what anyone phishing an adjusting firm wants.
      setError('That code did not match. Please try again.');
    }
  };

  if (!sent) {
    return (
      <PreClaimLayout
        eyebrow="Staff access"
        title="Sign in with your mobile"
        subtitle="We send a code on WhatsApp to the number your firm registered for you. There is no password."
        actions={
          <Button disabled={sendCode.isPending || !phone.trim()} onClick={() => void onSend()}>
            {sendCode.isPending ? 'Sending…' : 'Send code'}
          </Button>
        }
      >
        <div className="flex flex-col gap-4 rounded-xl border bg-background p-5">
          <label htmlFor="agent-phone" className="text-sm font-semibold">
            Your mobile number
          </label>
          <div className="flex items-center gap-2 rounded-lg border border-input bg-background px-3.5">
            <span className="font-medium text-muted-foreground">+60</span>
            <input
              id="agent-phone"
              type="tel"
              inputMode="tel"
              placeholder="12 987 6543"
              value={phone}
              onChange={event => setPhone(event.target.value)}
              onKeyDown={event => event.key === 'Enter' && void onSend()}
              className="w-full bg-transparent py-3 text-base focus:outline-none"
            />
          </div>
          <p className="text-xs leading-snug text-muted-foreground">
            Yours, not the claimant&rsquo;s — the next screen asks for theirs.
          </p>
          {error && (
            <p role="alert" className="text-xs text-destructive">
              {error}
            </p>
          )}
        </div>

        <AgentOnlyNote />
      </PreClaimLayout>
    );
  }

  return (
    <PreClaimLayout
      eyebrow="Staff access"
      title="Enter the code"
      subtitle={`Sent on WhatsApp to ${e164()}.`}
      actions={
        <>
          <Button variant="outline" onClick={() => setSent(false)}>
            Back
          </Button>
          <Button disabled={verify.isPending || code.length < 6} onClick={() => void onVerify()}>
            {verify.isPending ? 'Checking…' : 'Continue'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4 rounded-xl border bg-background p-5">
        <label htmlFor="agent-code" className="text-sm font-semibold">
          6-digit code
        </label>
        <input
          id="agent-code"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          value={code}
          onChange={event => setCode(event.target.value.replace(/\D/g, ''))}
          className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-center text-2xl tracking-[0.5em]"
        />

        {/*
          The thing that makes this liveable. An agent taking claims by phone
          all day would otherwise meet two sign-in screens per claim, which is
          the friction that ruled out a password in the first place. It buys a
          longer *refresh* token, not a longer grant — the access token still
          expires in minutes and every renewal re-reads the account.
        */}
        <label className="flex cursor-pointer items-center gap-2.5 rounded-lg bg-primary/5 px-3.5 py-3">
          <input
            type="checkbox"
            checked={keepSignedIn}
            onChange={event => setKeepSignedIn(event.target.checked)}
            className="h-4 w-4 accent-[hsl(var(--primary))]"
          />
          <span className="text-[13px]">Keep me signed in on this device for 30 days</span>
        </label>

        {error && (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        )}
      </div>

      <AgentOnlyNote />
    </PreClaimLayout>
  );
}

function AgentOnlyNote() {
  return (
    <div className="flex items-start gap-2.5 rounded-xl border bg-background p-4 text-xs leading-relaxed text-muted-foreground">
      <span aria-hidden="true">🛡</span>
      <span>
        Staff only. Claimants use the public form, where the code goes to <strong>their own</strong>{' '}
        mobile — these screens cannot be reached without a registered staff number.
      </span>
    </div>
  );
}
