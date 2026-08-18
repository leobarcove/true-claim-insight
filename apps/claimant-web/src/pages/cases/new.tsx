import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2, Paperclip, Send, UserRound } from 'lucide-react';
import { CHOICE_DISPLAY_MAX, formatDateAnswer, type FlowStep } from '@tci/shared-types';

import { uploadCaseDocument } from '@/hooks/use-cases';
import {
  newTurnId,
  useConversation,
  useSendTurn,
  useStartConversation,
  type ConversationMessage,
} from '@/hooks/use-conversation';
import { cn } from '@/lib/utils';

/**
 * Travel claim intake, as a conversation.
 *
 * This page decides nothing. It shows what the server said, renders a control
 * for whatever question is open, and posts back what the claimant did. Which
 * question comes next, whether an answer is acceptable, when to fetch a human
 * — all of that is `ConversationGateway`, the same code that answers Telegram.
 *
 * It used to drive the flow itself: pick the next step from the shared
 * definitions, PATCH each answer, keep the bubbles in local state. That shared
 * the *rules* with the messaging channels and nothing else, so this app had no
 * transcript, no "back", no way to reach a person, and none of the fixes made
 * on the other side. Deleting that logic is the point of the file, not a side
 * effect of rewriting it.
 */
export function CaseIntakePage() {
  const navigate = useNavigate();

  const { data: conversation, isLoading } = useConversation();
  const start = useStartConversation();
  const sendTurn = useSendTurn();

  const [inputValue, setInputValue] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const step = conversation?.currentStep ?? null;
  const busy = sendTurn.isPending || uploading;

  // Open the thread once. `start` is idempotent server-side, so a reload
  // resumes rather than greeting the claimant a second time.
  const started = useRef(false);
  useEffect(() => {
    if (started.current || isLoading || !conversation) return;
    started.current = true;
    if (conversation.messages.length === 0) {
      start.mutate(navigator.language?.split('-')[0]);
    }
  }, [conversation, isLoading, start]);

  // Always sitting at the newest message. A conversation that has to be
  // scrolled to be read is one where the claimant misses the question.
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [conversation?.messages.length, step?.id]);

  const send = (turn: { text?: string; callbackValue?: string }) => {
    if (busy) return;
    sendTurn.mutate({
      clientMessageId: newTurnId(),
      ...turn,
      // Lets the server ignore a tap on a question that has already moved on,
      // rather than applying it to whatever took its place.
      callbackStepId: step?.id,
    });
  };

  const sendTyped = () => {
    const text = inputValue.trim();
    if (!text) return;
    setInputValue('');
    send({ text });
  };

  const handleFile = async (file: File) => {
    if (!conversation?.caseId || !step?.documentType) return;
    setUploadError('');
    setUploading(true);
    try {
      // Uploaded first, through the endpoint that validates and stores it, and
      // only then named on a turn. The bytes never travel as part of the
      // conversation — the server checks the id belongs to this claim.
      const document = await uploadCaseDocument(
        conversation.caseId,
        file,
        step.documentType,
        step.id
      );
      sendTurn.mutate({ clientMessageId: newTurnId(), storedDocumentId: document.id });
    } catch {
      setUploadError('We could not upload that file. Please try again, or use a smaller photo.');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-background">
      <PageHeader
        onBack={() => navigate('/')}
        title="Make a claim"
        withAgent={conversation?.withAgent}
      />

      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {conversation?.messages.map(message => (
          <Bubble key={message.id} message={message} />
        ))}

        {sendTurn.isPending && (
          <div className="flex items-center gap-2 pl-2 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" /> Sending…
          </div>
        )}
        {uploading && (
          <div className="flex items-center gap-2 pl-2 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" /> Uploading…
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div className="safe-area-bottom space-y-2 border-t border-border bg-card px-4 py-3">
        {uploadError && <p className="px-1 text-xs text-destructive">{uploadError}</p>}

        {conversation?.withAgent ? (
          // The bot has stood down, so there is no question to answer — but the
          // claimant can still write to the person who took over.
          <TypedInput
            value={inputValue}
            onChange={setInputValue}
            onSend={sendTyped}
            disabled={busy}
            type="text"
            placeholder="Reply to our team…"
          />
        ) : (
          <>
            <AnswerControl
              step={step}
              busy={busy}
              value={inputValue}
              onChange={setInputValue}
              onSend={sendTyped}
              onChoose={value => send({ callbackValue: value })}
              onSkip={() => send({ text: 'skip' })}
              onAttach={() => fileInputRef.current?.click()}
            />

            {/*
              The way out, on every step.
              On Telegram and WhatsApp a claimant can type "human" at any point,
              and the gateway hands the conversation to an operator. Here they
              could not: choice, confirm and document steps render buttons and
              no text box, so the one moment someone most needs a person — the
              options do not cover their situation, or they disagree with
              something on the review — was exactly the moment they had no way
              to ask. The gateway already handles this turn for every channel;
              only the means of sending it was missing.

              Deliberately quiet: a prominent button invites a tap from anyone
              who finds a question mildly annoying, and an unstaffed queue is
              worse than a bot. It sends the same "human" turn a typed message
              would, so there is one code path and one handover reason.
            */}
            <button
              type="button"
              disabled={busy}
              onClick={() => send({ text: 'human' })}
              className="flex w-full items-center justify-center gap-1.5 py-1 text-xs text-muted-foreground underline-offset-4 hover:underline disabled:opacity-60"
            >
              <UserRound className="h-3.5 w-3.5" />
              Talk to a person
            </button>
          </>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,.pdf"
          className="hidden"
          onChange={event => {
            const file = event.target.files?.[0];
            if (file) void handleFile(file);
          }}
        />
      </div>
    </div>
  );
}

/**
 * The control for whatever is being asked.
 *
 * Keyed off `answerType` alone. Web chat declares `dateEntry: 'picker'` and
 * unlimited native choices in `CHANNEL_CAPABILITIES`, which is why a date step
 * gets a real picker here and typed text on Telegram — the same step, rendered
 * to the channel's strengths, with neither definition duplicated.
 */
export function AnswerControl({
  step,
  busy,
  value,
  onChange,
  onSend,
  onChoose,
  onSkip,
  onAttach,
}: {
  step: FlowStep | null;
  busy: boolean;
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  onChoose: (value: string) => void;
  onSkip: () => void;
  onAttach: () => void;
}) {
  if (!step) return null;

  if (step.answerType === 'choice') {
    // An `allowOther` list is the common answers, not the legal ones, so it is
    // trimmed to the readable few and paired with a box. Rendering all of them
    // is what a channel with no width limit tempts you into: thirty-one
    // destination chips is not a choice, it is a search problem with no search.
    //
    // A closed list still renders in full — there every option is a value the
    // step will accept, and hiding one would be a dead end with nothing to
    // type instead.
    const options = step.allowOther ? step.choices?.slice(0, CHOICE_DISPLAY_MAX) : step.choices;

    return (
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {options?.map(choice => (
            <button
              key={choice.value}
              disabled={busy}
              onClick={() => onChoose(choice.value)}
              className="rounded-full border border-primary/40 px-4 py-2 text-sm font-medium text-primary hover:bg-primary/5 disabled:opacity-60"
            >
              {choice.label}
            </button>
          ))}
        </div>

        {step.allowOther && (
          <div className="flex gap-2">
            <input
              type="text"
              value={value}
              disabled={busy}
              onChange={event => onChange(event.target.value)}
              onKeyDown={event => {
                if (event.key === 'Enter' && value.trim()) onSend();
              }}
              placeholder="Not listed? Type it here"
              aria-label="Type your answer if it is not listed above"
              className="flex-1 rounded-lg border border-border px-3 py-2 text-sm disabled:opacity-60"
            />
            <button
              disabled={busy || !value.trim()}
              onClick={onSend}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
            >
              Send
            </button>
          </div>
        )}
      </div>
    );
  }

  if (step.answerType === 'confirm') {
    return (
      <div className="flex gap-2">
        <button
          disabled={busy}
          onClick={() => onChoose('true')}
          className="flex-1 rounded-full bg-primary py-3 text-sm font-semibold text-primary-foreground disabled:opacity-60"
        >
          {step.isReview ? 'Confirm and submit' : 'I understand'}
        </button>
        {step.isReview && (
          <button
            disabled={busy}
            onClick={() => onChoose('false')}
            className="rounded-full border border-border px-4 py-3 text-sm text-muted-foreground disabled:opacity-60"
          >
            Change something
          </button>
        )}
      </div>
    );
  }

  if (step.answerType === 'document') {
    return (
      <div className="flex items-center gap-2">
        <button
          disabled={busy}
          onClick={onAttach}
          className="flex flex-1 items-center justify-center gap-2 rounded-full bg-primary py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
        >
          <Paperclip className="h-4 w-4" />
          Upload document
        </button>
        {step.optional && (
          <button
            disabled={busy}
            onClick={onSkip}
            className="rounded-full border border-border px-4 py-2.5 text-sm text-muted-foreground disabled:opacity-60"
          >
            Skip
          </button>
        )}
      </div>
    );
  }

  return (
    <TypedInput
      value={value}
      onChange={onChange}
      onSend={onSend}
      disabled={busy}
      type={
        step.answerType === 'number'
          ? 'number'
          : step.answerType === 'date'
            ? 'date'
            : step.answerType === 'datetime'
              ? 'datetime-local'
              : 'text'
      }
      placeholder="Type your answer…"
    />
  );
}

export function TypedInput({
  value,
  onChange,
  onSend,
  disabled,
  type,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  disabled: boolean;
  type: string;
  placeholder: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <input
        type={type}
        value={value}
        onChange={event => onChange(event.target.value)}
        onKeyDown={event => event.key === 'Enter' && onSend()}
        placeholder={placeholder}
        className="flex-1 rounded-full border border-border bg-background px-4 py-2.5 text-sm outline-none focus:border-primary"
      />
      <button
        disabled={disabled || !value.trim()}
        onClick={onSend}
        aria-label="Send"
        className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground disabled:opacity-50"
      >
        <Send className="h-4 w-4" />
      </button>
    </div>
  );
}

/**
 * An ISO date or datetime, as a person would read it.
 *
 * The date and datetime controls post `2026-08-13T09:00`, and that raw value
 * was echoed straight back into the claimant's own bubble — a machine
 * timestamp shown to someone checking their own answer. On WhatsApp and
 * Telegram the same answer is typed and appears as they wrote it, so the two
 * channels disagreed about the same claim.
 *
 * `formatDateAnswer` is the function the review summary already uses, so the
 * bubble now matches the summary the claimant confirms at the end. Month
 * spelled out, deliberately: "13/08" and "08/13" look alike, and this is the
 * moment somebody is meant to spot a wrong date.
 *
 * Returns the original text unless it is unambiguously an ISO value.
 */
function readableAnswer(text: string): string {
  const iso = text.trim();
  if (!/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?)?$/.test(iso)) return text;
  return formatDateAnswer(iso, iso.includes('T') ? 'datetime' : 'date') ?? text;
}

export function Bubble({ message }: { message: ConversationMessage }) {
  const fromClaimant = message.direction === 'INBOUND';

  return (
    <div className={cn('flex', fromClaimant ? 'justify-end' : 'justify-start')}>
      <div className="max-w-[85%] space-y-1">
        {message.fromAgent && (
          // Worth saying plainly. What the claimant should expect next differs
          // entirely depending on whether a person or the bot is talking.
          <p className="flex items-center gap-1 pl-1 text-xs text-muted-foreground">
            <UserRound className="h-3 w-3" /> Our team
          </p>
        )}
        <div
          className={cn(
            'whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm',
            fromClaimant
              ? 'bg-primary text-primary-foreground'
              : 'border border-border bg-card text-foreground'
          )}
        >
          {message.hasAttachment && !message.text ? (
            /*
              A file, not words. The bubble was rendering `text: null` as
              nothing at all, so a successful upload showed as an empty green
              blob — indistinguishable from a message that had failed to send,
              at the one moment a claimant wants to know their evidence
              arrived.
            */
            <span className="flex items-center gap-2">
              <Paperclip className="h-4 w-4 shrink-0" />
              Document sent
            </span>
          ) : fromClaimant ? (
            readableAnswer(message.text ?? '')
          ) : (
            message.text
          )}
        </div>
      </div>
    </div>
  );
}

export function PageHeader({
  onBack,
  title,
  subtitle,
  withAgent,
}: {
  /**
   * Omitted where there is nowhere to go back to. The public intake link is
   * the first screen a visitor sees, and an arrow that navigates nowhere is
   * worse than no arrow — it reads as a broken page.
   */
  onBack?: () => void;
  title: string;
  subtitle?: string;
  /**
   * Whether a person is on the other end. Drives the status line, because it
   * is the single most useful thing a claimant can know before they type: what
   * to expect back, and how quickly.
   */
  withAgent?: boolean;
}) {
  return (
    <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-border bg-card px-4 py-2.5">
      {onBack && (
        <button
          onClick={onBack}
          className="-ml-1 rounded-full p-2 text-muted-foreground hover:bg-muted"
          aria-label="Back"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
      )}

      {/*
        The mark, and the reason it belongs here rather than only on the
        welcome screen: the public intake link opens straight into this page.
        A claimant arriving from a QR code or a forwarded URL has met no
        branding at all, and is about to be asked for a phone number, a policy
        number and a bank account. Whose form this is should not be a guess.
      */}
      <img
        src="/logo.png"
        alt="True Claim Insight"
        className="h-9 w-9 shrink-0 rounded-xl bg-background object-contain p-1 ring-1 ring-border"
      />

      <div className="min-w-0 flex-1">
        <h1 className="truncate text-sm font-semibold leading-tight">{title}</h1>
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span
            className={cn(
              'h-1.5 w-1.5 shrink-0 rounded-full',
              withAgent ? 'bg-primary' : 'bg-emerald-500'
            )}
            aria-hidden
          />
          <span className="truncate">
            {subtitle ?? (withAgent ? 'A colleague is helping you' : 'True Claim assistant')}
          </span>
        </p>
      </div>
    </header>
  );
}
