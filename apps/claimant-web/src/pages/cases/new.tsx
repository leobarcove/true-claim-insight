import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2, Paperclip, Send, UserRound } from 'lucide-react';
import type { FlowStep } from '@tci/shared-types';

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
      <div className="flex h-dvh items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex h-dvh flex-col bg-background">
      <PageHeader
        onBack={() => navigate('/')}
        title="Make a claim"
        subtitle={conversation?.withAgent ? 'A colleague is helping you' : undefined}
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
    return (
      <div className="flex flex-wrap gap-2">
        {step.choices?.map(choice => (
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
          {message.text}
        </div>
      </div>
    </div>
  );
}

export function PageHeader({
  onBack,
  title,
  subtitle,
}: {
  /**
   * Omitted where there is nowhere to go back to. The public intake link is
   * the first screen a visitor sees, and an arrow that navigates nowhere is
   * worse than no arrow — it reads as a broken page.
   */
  onBack?: () => void;
  title: string;
  subtitle?: string;
}) {
  return (
    <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-border bg-card px-4 py-3">
      {onBack && (
        <button
          onClick={onBack}
          className="rounded-full p-2 text-muted-foreground hover:bg-muted"
          aria-label="Back"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
      )}
      <div>
        <h1 className="text-sm font-semibold">{title}</h1>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </div>
    </header>
  );
}
