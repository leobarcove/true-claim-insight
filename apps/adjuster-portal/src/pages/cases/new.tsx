import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Luggage, Mail, Phone, PlaneTakeoff, Stethoscope, XCircle, PackageX } from 'lucide-react';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import {
  CASE_FLOWS,
  TRAVEL_CLAIM_TYPE_LABELS,
  TravelClaimType,
  validateAnswer,
  type FlowStep,
} from '@tci/shared-types';
import { useCreateCase } from '@/hooks/use-cases';
import {
  hasLiveClaimConsent,
  useAttestVerbalConsent,
  useClaimantConsent,
  useResolveClaimant,
  type ResolvedClaimant,
} from '@/hooks/use-claimant-consent';
import { ConsentCapture, type ConsentCaptureState } from '@/components/cases/consent-capture';
import { cn } from '@/lib/utils';

const TYPE_ICONS: Record<TravelClaimType, any> = {
  [TravelClaimType.FLIGHT_DELAY]: PlaneTakeoff,
  [TravelClaimType.LUGGAGE_DAMAGE]: Luggage,
  [TravelClaimType.LUGGAGE_LOSS]: PackageX,
  [TravelClaimType.TRIP_CANCELLATION]: XCircle,
  [TravelClaimType.MEDICAL]: Stethoscope,
};

/**
 * Staff capture form. Same flow definitions as the claimant chat, rendered as
 * a single page for phone/walk-in captures and manual logging of FNOL emails.
 * Documents are uploaded afterwards on the case detail page.
 */
/**
 * The dropdown row that means "none of these".
 *
 * Prefixed so it cannot collide with a real choice value — the lists carry ISO
 * and IATA codes, and a bare "OTHER" is exactly the sort of thing one of them
 * could legitimately contain.
 */
const OTHER_OPTION = '__other';

export function NewCasePage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const createCase = useCreateCase();

  const [intakeSource, setIntakeSource] = useState<'STAFF' | 'EMAIL'>('STAFF');
  const [claimType, setClaimType] = useState<TravelClaimType | null>(null);
  const [claimantPhone, setClaimantPhone] = useState('');
  const [claimantFullName, setClaimantFullName] = useState('');
  const [claimantNric, setClaimantNric] = useState('');
  const [emailFrom, setEmailFrom] = useState('');
  const [emailSubject, setEmailSubject] = useState('');
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  /**
   * Consent, which this page never captured and without which
   * `CasesService.create` refuses to open a Case at all.
   *
   * The claimant is resolved before the case is created, because consent is
   * recorded against a claimant and the case cannot exist until it is. That
   * ordering is the whole reason this is a separate step rather than another
   * field on the form.
   */
  const [claimant, setClaimant] = useState<ResolvedClaimant | null>(null);
  const [consentState, setConsentState] = useState<ConsentCaptureState>({
    confirmed: false,
    interactionChannel: 'PHONE',
    interactionReference: '',
  });

  const resolveClaimant = useResolveClaimant();
  const attest = useAttestVerbalConsent();
  const { data: consents, isLoading: loadingConsent } = useClaimantConsent(claimant?.id ?? null);
  const hasConsent = claimant ? (loadingConsent ? null : hasLiveClaimConsent(consents)) : null;

  const lookUpClaimant = async () => {
    try {
      const resolved = await resolveClaimant.mutateAsync({
        phoneNumber: claimantPhone.trim(),
        fullName: claimantFullName.trim() || undefined,
        nric: claimantNric.trim() || undefined,
      });
      setClaimant(resolved);
      if (resolved.fullName && !claimantFullName) setClaimantFullName(resolved.fullName);
    } catch (error: any) {
      toast({
        title: 'Could not look that number up',
        description: error?.response?.data?.error?.message || error?.message,
        variant: 'destructive',
      });
    }
  };

  /** Whether the form may open a case yet, and why not when it may not. */
  const consentBlocker = (): string | null => {
    if (!claimant) return 'Check the claimant’s consent before creating the case.';
    if (hasConsent === null) return 'Checking consent…';
    if (hasConsent) return null;
    if (intakeSource === 'EMAIL') {
      return 'This claimant has no consent on file. An emailed claim cannot be attested to — call them first.';
    }
    return consentState.confirmed
      ? null
      : 'Confirm the verbal consent declaration before creating the case.';
  };

  const formSteps = useMemo(() => {
    if (!claimType) return [];
    // Document + confirmation steps are completed on the detail page.
    return CASE_FLOWS[claimType].steps.filter(
      step => step.answerType !== 'document' && step.answerType !== 'confirm'
    );
  }, [claimType]);

  /**
   * Steps the operator has switched to free text.
   *
   * Held rather than derived, because "not on the list" and "nothing entered
   * yet" look identical in the answer itself: the moment they pick *Not listed*
   * the value is empty, and a derived check would immediately snap the control
   * back to the dropdown and discard the choice they just made.
   *
   * No seeding, because this page only ever creates: `answers` starts empty and
   * nothing loads a draft into it. If it ever gains an edit mode, this set has
   * to be initialised from the answers — an off-list value arriving into an
   * empty dropdown would be silently dropped on save.
   */
  const [otherSteps, setOtherSteps] = useState<Set<string>>(new Set());

  const setAnswer = (stepId: string, value: string) => {
    setAnswers(current => ({ ...current, [stepId]: value }));
    setErrors(current => ({ ...current, [stepId]: '' }));
  };

  const handleSave = async () => {
    if (!claimType) return;
    if (!claimantPhone.trim()) {
      toast({ title: 'Claimant phone number is required', variant: 'destructive' });
      return;
    }

    const cleaned: Record<string, string> = {};
    const nextErrors: Record<string, string> = {};
    for (const step of formSteps) {
      const raw = (answers[step.id] ?? '').trim();
      if (!raw) {
        if (!step.optional) nextErrors[step.id] = 'Required';
        continue;
      }
      const result = validateAnswer(step, raw);
      if (!result.valid) {
        nextErrors[step.id] = result.error || 'Invalid value';
        continue;
      }
      cleaned[step.id] = raw;
    }
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      toast({ title: 'Please fix the highlighted fields', variant: 'destructive' });
      return;
    }

    const blocker = consentBlocker();
    if (blocker) {
      toast({ title: blocker, variant: 'destructive' });
      return;
    }

    try {
      // Recorded before the case, not after: `create` refuses without a live
      // consent, so attesting afterwards would be attesting to something that
      // had already been allowed to happen.
      if (hasConsent === false) {
        await attest.mutateAsync({
          claimantId: claimant!.id,
          interactionChannel: consentState.interactionChannel,
          interactionReference: consentState.interactionReference,
        });
      }

      const created = await createCase.mutateAsync({
        claimantId: claimant!.id,
        travelClaimType: claimType,
        channel: intakeSource,
        claimantPhone: claimantPhone.trim(),
        claimantFullName: claimantFullName.trim() || undefined,
        claimantNric: claimantNric.trim() || undefined,
        answers: cleaned,
        sourceMeta:
          intakeSource === 'EMAIL'
            ? { from: emailFrom.trim(), subject: emailSubject.trim(), receivedAt: new Date().toISOString() }
            : undefined,
      });
      toast({
        title: `Case ${created.caseNumber} created`,
        description: 'Upload the supporting documents, then submit it for vetting.',
      });
      navigate(`/cases/${created.id}`);
    } catch (error: any) {
      toast({
        title: 'Failed to create case',
        description: error?.response?.data?.error?.message || error?.message,
        variant: 'destructive',
      });
    }
  };

  const renderField = (step: FlowStep) => {
    const value = answers[step.id] ?? '';
    const error = errors[step.id];
    const common = { id: step.id, value, className: cn(error && 'border-destructive') };

    let control: React.ReactNode;
    switch (step.answerType) {
      case 'choice': {
        // A list that is *common* rather than complete has to accept an answer
        // that is not on it. The claimant's side of this flow does — that is
        // what `allowOther` means — and without the same escape here a staff
        // member capturing a claim for an unlisted airline could not get past
        // a required step at all. Same dead end, one screen over.
        const typing = otherSteps.has(step.id);
        control = (
          <div className="space-y-2">
            <Select
              value={typing ? OTHER_OPTION : value}
              onValueChange={selected => {
                if (selected === OTHER_OPTION) {
                  // Cleared, not carried over: leaving the previously chosen
                  // airline in the box invites saving it back unedited.
                  setOtherSteps(current => new Set(current).add(step.id));
                  setAnswer(step.id, '');
                  return;
                }
                setOtherSteps(current => {
                  const next = new Set(current);
                  next.delete(step.id);
                  return next;
                });
                setAnswer(step.id, selected);
              }}
            >
              <SelectTrigger className={cn(error && 'border-destructive')}>
                <SelectValue placeholder="Select..." />
              </SelectTrigger>
              <SelectContent>
                {step.choices?.map(choice => (
                  <SelectItem key={choice.value} value={choice.value}>
                    {choice.label}
                  </SelectItem>
                ))}
                {step.allowOther && (
                  <SelectItem value={OTHER_OPTION}>Not listed — type it</SelectItem>
                )}
              </SelectContent>
            </Select>
            {typing && (
              <Input
                autoFocus
                value={value}
                placeholder="Type the answer in full"
                aria-label={`${step.label} — not listed`}
                className={cn(error && 'border-destructive')}
                onChange={e => setAnswer(step.id, e.target.value)}
              />
            )}
          </div>
        );
        break;
      }
      case 'date':
        control = (
          <Input {...common} type="date" onChange={e => setAnswer(step.id, e.target.value)} />
        );
        break;
      case 'datetime':
        control = (
          <Input
            {...common}
            type="datetime-local"
            onChange={e => setAnswer(step.id, e.target.value)}
          />
        );
        break;
      case 'number':
        control = (
          <Input {...common} type="number" onChange={e => setAnswer(step.id, e.target.value)} />
        );
        break;
      default:
        control = <Input {...common} onChange={e => setAnswer(step.id, e.target.value)} />;
    }

    return (
      <div key={step.id} className="space-y-1.5">
        <Label htmlFor={step.id}>
          {step.label}
          {!step.optional && <span className="text-destructive ml-0.5">*</span>}
        </Label>
        {control}
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full">
      <Header
        title="New Case"
        description="Capture a travel claim request on behalf of a claimant"
      />
      <div className="flex-1 overflow-auto p-6 space-y-6 max-w-3xl">
        {/* Intake source */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Intake source</CardTitle>
          </CardHeader>
          <CardContent className="flex gap-3">
            {(
              [
                { value: 'STAFF', label: 'Phone call / walk-in', icon: Phone },
                { value: 'EMAIL', label: 'Log an email (FNOL inbox)', icon: Mail },
              ] as const
            ).map(option => (
              <button
                key={option.value}
                type="button"
                onClick={() => setIntakeSource(option.value)}
                className={cn(
                  'flex items-center gap-2 rounded-lg border px-4 py-3 text-sm transition-colors',
                  intakeSource === option.value
                    ? 'border-primary bg-primary/5 text-primary font-medium'
                    : 'border-border text-muted-foreground hover:border-primary/40'
                )}
              >
                <option.icon className="h-4 w-4" />
                {option.label}
              </button>
            ))}
          </CardContent>
        </Card>

        {intakeSource === 'EMAIL' && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Email details</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="email-from">Sender address</Label>
                <Input
                  id="email-from"
                  type="email"
                  placeholder="claimant@example.com"
                  value={emailFrom}
                  onChange={e => setEmailFrom(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="email-subject">Subject</Label>
                <Input
                  id="email-subject"
                  placeholder="Travel claim — flight delay"
                  value={emailSubject}
                  onChange={e => setEmailSubject(e.target.value)}
                />
              </div>
            </CardContent>
          </Card>
        )}

        {/* Claim type */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Claim type</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {Object.values(TravelClaimType).map(type => {
              const Icon = TYPE_ICONS[type];
              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => setClaimType(type)}
                  className={cn(
                    'flex flex-col items-center gap-2 rounded-lg border p-4 text-xs text-center transition-colors',
                    claimType === type
                      ? 'border-primary bg-primary/5 text-primary font-medium'
                      : 'border-border text-muted-foreground hover:border-primary/40'
                  )}
                >
                  <Icon className="h-5 w-5" />
                  {TRAVEL_CLAIM_TYPE_LABELS[type]}
                </button>
              );
            })}
          </CardContent>
        </Card>

        {/* Claimant */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Claimant</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="claimant-phone">
                Phone number<span className="text-destructive ml-0.5">*</span>
              </Label>
              <Input
                id="claimant-phone"
                placeholder="+60123456789"
                value={claimantPhone}
                onChange={e => {
                  setClaimantPhone(e.target.value);
                  // A resolved claimant belongs to the number that resolved
                  // them. Editing the number without clearing it would leave
                  // the consent check — and the attestation about to be
                  // recorded — attached to somebody else.
                  setClaimant(null);
                  setConsentState(current => ({ ...current, confirmed: false }));
                }}
              />
            </div>
            <div className="space-y-1.5">
              {/*
                Not `claimant-name`: every travel flow has a step with exactly
                that id, so this card and the flow-driven fields below rendered
                two elements sharing one id. The label pointed at whichever came
                first, and `getElementById` — which the error-focus helper uses —
                could only ever find one of them.
              */}
              <Label htmlFor="claimant-record-name">Full name</Label>
              <Input
                id="claimant-record-name"
                value={claimantFullName}
                onChange={e => setClaimantFullName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="claimant-nric">NRIC</Label>
              <Input
                id="claimant-nric"
                placeholder="880101-14-5555"
                value={claimantNric}
                onChange={e => setClaimantNric(e.target.value)}
              />
            </div>
          </CardContent>
        </Card>

        {/*
          Between the claimant and the claim details on purpose. Consent is
          recorded against a claimant and has to exist before a case can be
          opened, so it belongs after the person is identified and before
          anything about their claim is typed — which is also the order the
          declaration itself asserts.
        */}
        <ConsentCapture
          intakeSource={intakeSource}
          claimant={claimant}
          resolving={resolveClaimant.isPending || loadingConsent}
          hasConsent={hasConsent}
          state={consentState}
          onChange={setConsentState}
          onLookUp={() => void lookUpClaimant()}
          canLookUp={Boolean(claimantPhone.trim())}
        />

        {/* Flow-driven fields */}
        {claimType && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {TRAVEL_CLAIM_TYPE_LABELS[claimType]} details
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {formSteps.map(renderField)}
            </CardContent>
          </Card>
        )}

        <div className="flex justify-end gap-3 pb-6">
          <Button variant="outline" onClick={() => navigate('/cases')}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={!claimType || createCase.isPending || attest.isPending || Boolean(consentBlocker())}
            title={consentBlocker() ?? undefined}
          >
            {createCase.isPending || attest.isPending ? 'Creating…' : 'Create case'}
          </Button>
        </div>
      </div>
    </div>
  );
}
