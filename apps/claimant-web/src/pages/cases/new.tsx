import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  CheckCircle2,
  Loader2,
  Luggage,
  PackageX,
  Paperclip,
  PlaneTakeoff,
  Send,
  Stethoscope,
  XCircle,
} from 'lucide-react';
import {
  CASE_FLOWS,
  TRAVEL_CLAIM_TYPE_LABELS,
  TravelClaimType,
  getStep,
  type CaseAnswers,
  type FlowStep,
} from '@tci/shared-types';
import {
  uploadCaseDocument,
  useCaseFlow,
  useClaimantCase,
  useCreateClaimantCase,
  usePatchCaseAnswer,
  useSubmitClaimantCase,
} from '@/hooks/use-cases';
import { useConsentNotice, useConsentStanding, useGrantConsent } from '@/hooks/use-consent';
import { cn } from '@/lib/utils';

const TYPE_OPTIONS: Array<{ type: TravelClaimType; icon: any; hint: string }> = [
  { type: TravelClaimType.FLIGHT_DELAY, icon: PlaneTakeoff, hint: 'Delayed or cancelled flight' },
  { type: TravelClaimType.LUGGAGE_DAMAGE, icon: Luggage, hint: 'Damaged luggage' },
  { type: TravelClaimType.LUGGAGE_LOSS, icon: PackageX, hint: 'Lost luggage' },
  { type: TravelClaimType.TRIP_CANCELLATION, icon: XCircle, hint: 'Cancelled trip' },
  { type: TravelClaimType.MEDICAL, icon: Stethoscope, hint: 'Overseas medical expenses' },
];

interface ChatMessage {
  id: string;
  from: 'bot' | 'user' | 'warning';
  text: string;
}

/**
 * Chat-style travel claim intake — the WhatsApp-bot experience on the web.
 * Driven entirely by the shared flow definitions; the same steps a future
 * WhatsApp adapter would replay over the Business API.
 */
export function CaseIntakePage() {
  const navigate = useNavigate();
  const { id: routeCaseId } = useParams();
  const [caseId, setCaseId] = useState<string | undefined>(routeCaseId);

  const createCase = useCreateClaimantCase();
  const patchAnswer = usePatchCaseAnswer();
  const submitCase = useSubmitClaimantCase();
  const { data: caseData } = useClaimantCase(caseId);

  const [transientMessages, setTransientMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [inputError, setInputError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data: serverFlow } = useCaseFlow(caseId);

  // Consent is a precondition for processing, so it is asked before any claim
  // question — and case-service refuses to open a Case without it, on every
  // channel, so this screen is the claimant's chance to agree rather than the
  // thing that enforces it.
  const { data: consentNotice } = useConsentNotice();
  const { data: consentStanding, isLoading: consentLoading } = useConsentStanding();
  const grantConsent = useGrantConsent();
  const hasClaimConsent = (consentStanding ?? []).some(
    record => record.purpose === 'CLAIM_PROCESSING' && record.status === 'GRANTED'
  );

  // The server's resolved flow is authoritative — it is the version pinned on
  // this case. CASE_FLOWS is the fallback for the moment before the fetch
  // lands, so the first paint is not blank; it is only ever the built-in flow,
  // which for an unpinned case is the same thing the server would return.
  const flow = serverFlow
    ? serverFlow
    : caseData?.travelClaimType
      ? CASE_FLOWS[caseData.travelClaimType as TravelClaimType]
      : null;

  const currentStep: FlowStep | null = useMemo(() => {
    if (!flow || !caseData) return null;
    if (!caseData.currentStepId) return null;
    return getStep(flow, caseData.currentStepId) ?? null;
  }, [flow, caseData]);

  // Rebuild the transcript from flow order + stored answers (survives reload).
  const transcript: ChatMessage[] = useMemo(() => {
    if (!flow || !caseData) return [];
    const answers = caseData.answers as CaseAnswers;
    const messages: ChatMessage[] = [];
    for (const step of flow.steps) {
      const value = answers[step.id];
      if (value === undefined) continue;
      messages.push({ id: `${step.id}-q`, from: 'bot', text: step.prompt });
      const display =
        step.answerType === 'document'
          ? '📎 Document uploaded'
          : step.answerType === 'choice'
            ? step.choices?.find(choice => choice.value === value)?.label || String(value)
            : step.answerType === 'confirm'
              ? 'Confirmed'
              : String(value);
      messages.push({ id: `${step.id}-a`, from: 'user', text: display });
    }
    return messages;
  }, [flow, caseData]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [transcript.length, transientMessages.length, currentStep?.id]);

  const startCase = async (type: TravelClaimType) => {
    const created = await createCase.mutateAsync(type);
    setCaseId(created.id);
    navigate(`/cases/${created.id}`, { replace: true });
  };

  const pushWarnings = (warnings?: string[]) => {
    if (!warnings?.length) return;
    setTransientMessages(current => [
      ...current,
      ...warnings.map((text, index) => ({
        id: `warn-${Date.now()}-${index}`,
        from: 'warning' as const,
        text,
      })),
    ]);
  };

  const sendAnswer = async (step: FlowStep, value: string | number | boolean) => {
    if (!caseId) return;
    setInputError('');
    const result = await patchAnswer.mutateAsync({ caseId, stepId: step.id, value });
    if (!result.accepted) {
      setInputError(result.error || 'Please check your answer and try again.');
      return;
    }
    setInputValue('');
    pushWarnings(result.warnings);
  };

  const handleTextSend = () => {
    if (!currentStep) return;
    const raw = inputValue.trim();
    if (!raw) return;
    const value = currentStep.answerType === 'number' ? Number(raw) : raw;
    void sendAnswer(currentStep, value);
  };

  const handleFile = async (file: File) => {
    if (!caseId || !currentStep?.documentType) return;
    setUploading(true);
    setInputError('');
    try {
      const document = await uploadCaseDocument(
        caseId,
        file,
        String(currentStep.documentType),
        currentStep.id
      );
      await sendAnswer(currentStep, document.id);
    } catch (error: any) {
      setInputError(error?.response?.data?.error?.message || 'Upload failed — please try again.');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleConfirm = async () => {
    if (!caseId || !currentStep) return;
    await sendAnswer(currentStep, true);
    // review is the final step → submit
    if (currentStep.id === 'review') {
      await submitCase.mutateAsync(caseId);
      setSubmitted(true);
    }
  };

  // ------------------------------------------------------------------
  // Screens
  // ------------------------------------------------------------------

  if (!caseId && !consentLoading && !hasClaimConsent) {
    return (
      <div className="flex flex-col min-h-screen bg-background">
        <PageHeader onBack={() => navigate('/tracker')} title="Before we begin" />
        <main className="flex-1 px-5 py-6 space-y-4">
          <div className="bg-primary/5 border border-primary/10 rounded-2xl p-4 space-y-2">
            <h2 className="font-medium">{consentNotice?.title ?? 'How we use your information'}</h2>
            {/* The approved wording, fetched rather than bundled: a grant has to
                be tied to exactly what was shown, and app copy is not versioned. */}
            <p className="text-sm whitespace-pre-wrap text-muted-foreground">
              {consentNotice?.body ?? 'Loading…'}
            </p>
          </div>
          <button
            type="button"
            disabled={!consentNotice || grantConsent.isPending}
            onClick={() => void grantConsent.mutateAsync('CLAIM_PROCESSING')}
            className="w-full rounded-2xl bg-primary text-primary-foreground py-3 font-medium disabled:opacity-50"
          >
            I agree — continue
          </button>
          <p className="text-xs text-muted-foreground text-center">
            You can withdraw this at any time by contacting us.
          </p>
        </main>
      </div>
    );
  }

  if (!caseId) {
    return (
      <div className="flex flex-col min-h-screen bg-background">
        <PageHeader onBack={() => navigate('/tracker')} title="New travel claim" />
        <main className="flex-1 px-5 py-6 space-y-4">
          <div className="bg-primary/5 border border-primary/10 rounded-2xl p-4 text-sm">
            Hi! I can help you submit a travel insurance claim request in a few minutes. What
            happened on your trip?
          </div>
          <div className="grid gap-3">
            {TYPE_OPTIONS.map(option => (
              <button
                key={option.type}
                disabled={createCase.isPending}
                onClick={() => void startCase(option.type)}
                className="flex items-center gap-4 rounded-2xl border border-border bg-card p-4 text-left hover:border-primary/50 transition-colors"
              >
                <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                  <option.icon size={20} />
                </div>
                <div>
                  <p className="font-semibold text-sm">
                    {TRAVEL_CLAIM_TYPE_LABELS[option.type]}
                  </p>
                  <p className="text-xs text-muted-foreground">{option.hint}</p>
                </div>
              </button>
            ))}
          </div>
        </main>
      </div>
    );
  }

  if (submitted || (caseData && !['DRAFT', 'IN_PROGRESS', 'INFO_REQUESTED'].includes(String(caseData.status)))) {
    return (
      <div className="flex flex-col min-h-screen bg-background">
        <PageHeader onBack={() => navigate('/tracker')} title="Claim request" />
        <main className="flex-1 flex flex-col items-center justify-center px-6 text-center space-y-4">
          <CheckCircle2 className="h-14 w-14 text-emerald-500" />
          <h2 className="text-xl font-bold">Request submitted</h2>
          <p className="text-sm text-muted-foreground max-w-xs">
            Your reference is{' '}
            <span className="font-semibold text-foreground">{caseData?.caseNumber}</span>. Our
            claims team will review it and contact you if anything else is needed.
          </p>
          <button
            onClick={() => navigate('/tracker')}
            className="mt-2 rounded-full bg-primary text-primary-foreground px-6 py-2.5 text-sm font-semibold"
          >
            Back to tracker
          </button>
        </main>
      </div>
    );
  }

  const answers = (caseData?.answers ?? {}) as CaseAnswers;

  return (
    <div className="flex flex-col h-screen bg-background">
      <PageHeader
        onBack={() => navigate('/tracker')}
        title={
          caseData?.travelClaimType
            ? TRAVEL_CLAIM_TYPE_LABELS[caseData.travelClaimType as TravelClaimType]
            : 'Travel claim'
        }
        subtitle={caseData?.caseNumber}
      />

      {/* Chat area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-5 space-y-3">
        {caseData?.status === 'INFO_REQUESTED' && caseData.reviewNote && (
          <Bubble from="warning" text={`Our team needs more information: ${caseData.reviewNote}`} />
        )}
        {transcript.map(message => (
          <Bubble key={message.id} from={message.from} text={message.text} />
        ))}
        {transientMessages.map(message => (
          <Bubble key={message.id} from={message.from} text={message.text} />
        ))}
        {currentStep && currentStep.id !== 'review' && (
          <Bubble from="bot" text={currentStep.prompt} />
        )}

        {/* Review summary */}
        {currentStep?.id === 'review' && flow && (
          <>
            <Bubble from="bot" text={currentStep.prompt} />
            <div className="bg-card border border-border rounded-2xl p-4 space-y-2 text-sm">
              {flow.steps
                .filter(step => step.answerType !== 'confirm' && answers[step.id] !== undefined)
                .map(step => (
                  <div key={step.id} className="flex justify-between gap-4">
                    <span className="text-muted-foreground">{step.label}</span>
                    <span className="font-medium text-right break-all">
                      {step.answerType === 'document'
                        ? 'Uploaded'
                        : step.answerType === 'choice'
                          ? step.choices?.find(choice => choice.value === answers[step.id])?.label
                          : String(answers[step.id])}
                    </span>
                  </div>
                ))}
            </div>
          </>
        )}

        {patchAnswer.isPending && (
          <div className="flex items-center gap-2 text-muted-foreground text-xs pl-2">
            <Loader2 className="h-3 w-3 animate-spin" /> Saving…
          </div>
        )}
      </div>

      {/* Input area */}
      <div className="border-t border-border bg-card px-4 py-3 safe-area-bottom space-y-2">
        {inputError && <p className="text-xs text-destructive px-1">{inputError}</p>}

        {currentStep?.answerType === 'choice' && (
          <div className="flex flex-wrap gap-2">
            {currentStep.choices?.map(choice => (
              <button
                key={choice.value}
                disabled={patchAnswer.isPending}
                onClick={() => void sendAnswer(currentStep, choice.value)}
                className="rounded-full border border-primary/40 text-primary px-4 py-2 text-sm font-medium hover:bg-primary/5"
              >
                {choice.label}
              </button>
            ))}
          </div>
        )}

        {currentStep?.answerType === 'document' && (
          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,.pdf"
              className="hidden"
              onChange={e => {
                const file = e.target.files?.[0];
                if (file) void handleFile(file);
              }}
            />
            <button
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
              className="flex-1 flex items-center justify-center gap-2 rounded-full bg-primary text-primary-foreground py-2.5 text-sm font-semibold disabled:opacity-60"
            >
              {uploading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Paperclip className="h-4 w-4" />
              )}
              {uploading ? 'Uploading…' : 'Upload document'}
            </button>
            {currentStep.optional && (
              <button
                disabled={patchAnswer.isPending || uploading}
                onClick={() => void sendAnswer(currentStep, 'skip')}
                className="rounded-full border border-border px-4 py-2.5 text-sm text-muted-foreground"
              >
                Skip
              </button>
            )}
          </div>
        )}

        {currentStep?.answerType === 'confirm' && (
          <button
            disabled={patchAnswer.isPending || submitCase.isPending}
            onClick={() => void handleConfirm()}
            className="w-full rounded-full bg-primary text-primary-foreground py-3 text-sm font-semibold disabled:opacity-60"
          >
            {currentStep.id === 'review'
              ? submitCase.isPending
                ? 'Submitting…'
                : 'Confirm and submit'
              : 'I understand'}
          </button>
        )}

        {currentStep &&
          ['text', 'phone', 'number', 'date', 'datetime'].includes(currentStep.answerType) && (
            <div className="flex items-center gap-2">
              <input
                type={
                  currentStep.answerType === 'number'
                    ? 'number'
                    : currentStep.answerType === 'date'
                      ? 'date'
                      : currentStep.answerType === 'datetime'
                        ? 'datetime-local'
                        : 'text'
                }
                value={inputValue}
                onChange={e => setInputValue(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleTextSend()}
                placeholder="Type your answer…"
                className="flex-1 rounded-full border border-border bg-background px-4 py-2.5 text-sm outline-none focus:border-primary"
              />
              <button
                disabled={patchAnswer.isPending || !inputValue.trim()}
                onClick={handleTextSend}
                className="h-10 w-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-50"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          )}
      </div>
    </div>
  );
}

function PageHeader({
  onBack,
  title,
  subtitle,
}: {
  onBack: () => void;
  title: string;
  subtitle?: string;
}) {
  return (
    <header className="bg-card px-4 py-3 border-b border-border flex items-center gap-3 sticky top-0 z-10">
      <button
        onClick={onBack}
        className="p-2 rounded-full hover:bg-muted text-muted-foreground"
        aria-label="Back"
      >
        <ArrowLeft size={18} />
      </button>
      <div>
        <h1 className="font-bold text-base leading-tight">{title}</h1>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </div>
    </header>
  );
}

function Bubble({ from, text }: { from: 'bot' | 'user' | 'warning'; text: string }) {
  if (from === 'warning') {
    return (
      <div className="max-w-[85%] rounded-2xl rounded-tl-sm bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-300 px-4 py-2.5 text-sm">
        {text}
      </div>
    );
  }
  return (
    <div
      className={cn(
        'max-w-[85%] px-4 py-2.5 text-sm rounded-2xl whitespace-pre-wrap',
        from === 'bot'
          ? 'bg-muted text-foreground rounded-tl-sm'
          : 'bg-primary text-primary-foreground ml-auto rounded-tr-sm'
      )}
    >
      {text}
    </div>
  );
}
