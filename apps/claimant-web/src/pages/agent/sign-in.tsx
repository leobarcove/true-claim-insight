import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { useAgentSendCode, useAgentVerifyCode } from '@/hooks/use-agent-intake';
import { isRateLimited } from '@/lib/http-errors';
import { CodeBoxes, RESEND_SECONDS } from '../form/code-entry';
import { ShieldIcon } from '../form/icons';
import { PreClaimLayout } from '../form/layout';
import { checkAgentRegistrationNumber } from './registration-number';

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
  const [registrationNumber, setRegistrationNumber] = useState('');
  const [registrationTouched, setRegistrationTouched] = useState(false);
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [keepSignedIn, setKeepSignedIn] = useState(true);
  const [sent, setSent] = useState(false);
  const [numberHelp, setNumberHelp] = useState(false);
  const [remaining, setRemaining] = useState(RESEND_SECONDS);
  const [error, setError] = useState('');

  const sendCode = useAgentSendCode();
  const verify = useAgentVerifyCode();
  const registrationError = checkAgentRegistrationNumber(registrationNumber);

  const e164 = () => {
    const digits = phone.replace(/\D/g, '').replace(/^0+/, '');
    return digits ? `+60${digits}` : '';
  };

  const onSend = async () => {
    setError('');
    setRegistrationTouched(true);
    if (registrationError) return;
    try {
      await sendCode.mutateAsync({
        registrationNumber: registrationNumber.trim(),
        phoneNumber: e164(),
      });
      setRemaining(RESEND_SECONDS);
      setSent(true);
    } catch (caught) {
      /*
        Every valid-looking pair advances, whether or not the backend sent a
        code. Otherwise this public screen reveals which registration and phone
        pairs exist. The backend remains authoritative and dispatches only for
        a matching PIAM record.

        A rate limit is different: no credential decision was made, and retrying
        immediately only extends the wait, so keep that message here.
      */
      if (isRateLimited(caught)) {
        setError('Too many code requests. Please wait five minutes before asking for another.');
        return;
      }
      setRemaining(RESEND_SECONDS);
      setSent(true);
    }
  };

  // Counts down from when the code screen appeared. Not persisted: a reload is
  // a fair reason to be allowed another code, and the server's own per-number
  // limit is what protects the sending cost.
  useEffect(() => {
    if (!sent || remaining <= 0) return;
    const timer = setTimeout(() => setRemaining(seconds => seconds - 1), 1000);
    return () => clearTimeout(timer);
  }, [sent, remaining]);

  const onVerify = async (value = code) => {
    setError('');
    try {
      await verify.mutateAsync({
        registrationNumber: registrationNumber.trim(),
        phoneNumber: e164(),
        code: value,
        keepSignedIn,
      });
      onSignedIn();
    } catch (caught) {
      // Deliberately the same message the server gives, which does not
      // distinguish a wrong code from an unknown number — "is this person one
      // of yours?" is exactly what anyone phishing an adjusting firm wants.
      //
      // Except when there was no attempt to judge: a refused *request* is not a
      // wrong code, and telling somebody their code is wrong when it was never
      // read sends them off to find a code that was fine all along.
      setError(
        isRateLimited(caught)
          ? 'Too many attempts. Please wait five minutes before trying this code again.'
          : 'That code did not match. Please try again.'
      );
    }
  };

  if (!sent) {
    return (
      <PreClaimLayout
        eyebrow="Staff access"
        title="Sign in with your mobile"
        subtitle="We send a code on WhatsApp to the number your firm registered for you. There is no password."
        actions={
          <Button
            disabled={sendCode.isPending || Boolean(registrationError) || !phone.trim()}
            onClick={() => void onSend()}
          >
            {sendCode.isPending ? 'Sending…' : 'Send code'}
          </Button>
        }
      >
        <div className="flex flex-col gap-4 rounded-xl border bg-background p-5">
          <label htmlFor="agent-registration" className="text-sm font-semibold">
            Agent registration number
          </label>
          <input
            id="agent-registration"
            type="text"
            autoCapitalize="characters"
            placeholder="999999-00"
            value={registrationNumber}
            onChange={event => setRegistrationNumber(event.target.value.replace(/\s/g, ''))}
            onBlur={() => setRegistrationTouched(true)}
            aria-invalid={(registrationTouched && Boolean(registrationError)) || undefined}
            aria-describedby={
              registrationTouched && registrationError ? 'agent-registration-error' : undefined
            }
            className={`w-full rounded-lg border bg-background px-3.5 py-3 text-base focus:outline-none focus:ring-2 focus:ring-primary/40 ${
              registrationTouched && registrationError ? 'border-destructive' : 'border-input'
            }`}
          />
          {registrationTouched && registrationError && (
            <p id="agent-registration-error" role="alert" className="text-xs text-destructive">
              {registrationError}
            </p>
          )}
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
            Yours, not the claimant&rsquo;s. The next screen asks for theirs.{' '}
            {/*
              Says who can change it rather than offering to. Access here *is*
              the list of numbers the firm holds, so a self-service change would
              be a way to move access onto a handset nobody vetted.
            */}
            <button
              type="button"
              className="underline underline-offset-2"
              onClick={() => setNumberHelp(true)}
            >
              Number changed?
            </button>
          </p>
          {numberHelp && (
            <p className="rounded-lg bg-muted/60 p-3 text-xs leading-relaxed text-muted-foreground">
              Your firm admin updates the number on your account. Until they do, the code goes to
              the old handset. Signing in is what proves the number is yours, so it cannot be
              changed from here.
            </p>
          )}
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
      /*
        No footer buttons, unlike every other screen here: the design puts one
        full-width Continue inside the card, directly under the thing it acts
        on. Nothing else on this screen competes with it.
      */
    >
      <div className="flex flex-col gap-4 rounded-xl border bg-background p-5">
        <label htmlFor="code" className="text-sm font-semibold">
          6-digit code
        </label>

        {/*
          The same six boxes a claimant gets, from the same component. Two
          implementations of one control is how the paste handling ends up
          working on one surface and not the other.
        */}
        <CodeBoxes value={code} onChange={setCode} disabled={verify.isPending} />

        <p className="text-xs text-muted-foreground">
          Did not get it?{' '}
          {remaining > 0 ? (
            <>
              <span className="opacity-60">Send again</span> in 0:
              {String(remaining).padStart(2, '0')}.
            </>
          ) : (
            <button
              type="button"
              disabled={sendCode.isPending}
              className="underline underline-offset-2"
              onClick={() => void onSend()}
            >
              Send again
            </button>
          )}{' '}
          {/*
            Not in the design, which leaves this screen with no way back. A
            mistyped number would then be a dead end reachable only by
            reloading — and the agent is on a call while it happens.
          */}
          <button
            type="button"
            className="underline underline-offset-2"
            onClick={() => setSent(false)}
          >
            Wrong number?
          </button>
        </p>

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

        <Button
          className="w-full"
          disabled={verify.isPending || code.length < 6}
          onClick={() => void onVerify()}
        >
          {verify.isPending ? 'Checking…' : 'Continue'}
        </Button>
      </div>

      <AgentOnlyNote />
    </PreClaimLayout>
  );
}

function AgentOnlyNote() {
  return (
    <div className="flex items-start gap-2.5 rounded-xl border bg-background p-4 text-xs leading-relaxed text-muted-foreground">
      <ShieldIcon className="mt-0.5 h-4 w-4" />
      <span>
        Staff only. Claimants use the public form, where the code goes to <strong>their own</strong>{' '}
        mobile. These screens cannot be reached without a registered staff number.
      </span>
    </div>
  );
}
