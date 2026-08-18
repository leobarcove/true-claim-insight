import { useEffect, useRef, useState } from 'react';
import { Loader2, UserRound } from 'lucide-react';

import {
  clearPublicSession,
  isChannelSession,
  publicConversationKey,
  usePublicConversation,
  useSendPublicTurn,
  useStartPublicConversation,
  uploadPublicDocument,
} from '@/hooks/use-public-conversation';
import { newTurnId, type ConversationMessage } from '@/hooks/use-conversation';
import { AnswerControl, Bubble, PageHeader, TypedInput } from '@/pages/cases/new';
import { useQueryClient } from '@tanstack/react-query';

/**
 * Claim intake for someone who has not logged in.
 *
 * The web equivalent of messaging the WhatsApp number: open the link, start
 * talking. There is no welcome screen, no account and no password — the
 * conversation asks for a mobile number and proves it with a code, at exactly
 * the point a WhatsApp binding resolves its platform-verified one.
 *
 * Nothing here presumes what kind of claim it is. The flow asks that as its
 * own step, so a heading that said "travel" was answering a question the
 * conversation had not yet put — and would have been wrong the moment a fire
 * or flood line was enabled.
 *
 * The chat itself is the same as the authenticated page's, imported rather
 * than reimplemented. That page exists because the PWA once had its own intake
 * that shared the rules with the messaging channels and nothing else; copying
 * its bubbles here to save an import would recreate the same problem one layer
 * down.

 * Uploads go through a session-authorised endpoint that reads the case off the
 * binding, so evidence works here exactly as it does for a signed-in claimant.
 */
export function PublicChatPage() {
  const queryClient = useQueryClient();

  const { data: conversation, isLoading } = usePublicConversation();
  const start = useStartPublicConversation();
  const sendTurn = useSendPublicTurn();

  const [inputValue, setInputValue] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const step = conversation?.currentStep ?? null;
  const busy = sendTurn.isPending || start.isPending || uploading;

  // Open the thread once. Idempotent server-side, so a reload resumes the same
  // conversation rather than greeting the visitor again.
  const started = useRef(false);
  useEffect(() => {
    if (started.current || isLoading) return;
    started.current = true;
    if (!conversation || conversation.messages.length === 0) {
      start.mutate(navigator.language?.split('-')[0]);
    }
  }, [conversation, isLoading, start]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [conversation?.messages.length, step?.id]);

  const send = (turn: { text?: string; callbackValue?: string }) => {
    if (busy) return;
    sendTurn.mutate({ clientMessageId: newTurnId(), ...turn, callbackStepId: step?.id });
  };

  const sendTyped = () => {
    const text = inputValue.trim();
    if (!text) return;
    setInputValue('');
    send({ text });
  };

  const handleFile = async (file: File) => {
    if (!step?.documentType) return;
    setUploadError('');
    setUploading(true);
    try {
      // No case id passed: the server reads it off the binding, because a
      // visitor has no token to prove which claim is theirs. Same two-step
      // shape as the authenticated app — store, then name it on a turn.
      const document = await uploadPublicDocument(file, step.documentType, step.id);
      sendTurn.mutate({ clientMessageId: newTurnId(), storedDocumentId: document.id });
    } catch {
      setUploadError('We could not upload that file. Please try again, or use a smaller photo.');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  /**
   * Abandon this conversation and open a fresh one.
   *
   * Only ever offered on a web thread the visitor owns. In the Telegram Mini
   * App the session names a binding the *thread* owns — clearing it would drop
   * the claimant out of the claim they have been building with the bot and into
   * a new anonymous web conversation, with no way back except closing the
   * window. That is precisely the failure the session bridge exists to prevent,
   * and it was reachable from a button.
   */
  const startOver = () => {
    // Guarded here as well as at the button, not instead of it. Hiding a
    // control keeps it out of reach; refusing inside the function keeps it
    // wrong for the next caller too, and this one is destructive enough that
    // the two costs are not comparable — a mistaken tap loses a claim the
    // claimant has been building with the bot, and the only route back is
    // closing the window and reopening it from the thread.
    if (isChannelSession()) return;
    clearPublicSession();
    queryClient.removeQueries({ queryKey: publicConversationKey });
    started.current = false;
    start.mutate(navigator.language?.split('-')[0]);
  };

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    // `min-h-0` matters: without it a flex child refuses to shrink below its
    // content, the transcript stops scrolling and the composer is pushed off
    // the bottom of the frame.
    <div className="flex min-h-0 flex-1 flex-col bg-background">
      <PageHeader title="Make a claim" withAgent={conversation?.withAgent} />

      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {conversation?.messages.map((message: ConversationMessage) => (
          <Bubble key={message.id} message={message} />
        ))}

        {busy && (
          <div className="flex items-center gap-2 pl-2 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" /> Sending…
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div className="safe-area-bottom space-y-2 border-t border-border bg-card px-4 py-3">
        {uploadError && <p className="px-1 text-xs text-destructive">{uploadError}</p>}
        {conversation?.withAgent ? (
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
            {step ? (
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
            ) : (
              /*
                Onboarding has no step, and that is why there was nothing to
                type into. `currentStep` is the open question *in the flow*,
                and the number-and-code exchange happens before the flow
                starts — so AnswerControl rendered null and the bot asked for
                a mobile number with no box to put it in.

                A plain text box is the honest control here: the same two
                questions on WhatsApp are answered by typing, and the page
                cannot know whether the next thing wanted is a number or a
                six-digit code.
              */
              <TypedInput
                value={inputValue}
                onChange={setInputValue}
                onSend={sendTyped}
                disabled={busy}
                type="text"
                placeholder="Type your answer…"
              />
            )}

            <div className="flex items-center justify-center gap-4">
              <button
                type="button"
                disabled={busy}
                onClick={() => send({ text: 'human' })}
                className="flex items-center gap-1.5 py-1 text-xs text-muted-foreground underline-offset-4 hover:underline disabled:opacity-60"
              >
                <UserRound className="h-3.5 w-3.5" />
                Talk to a person
              </button>
              {!isChannelSession() && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={startOver}
                  className="py-1 text-xs text-muted-foreground underline-offset-4 hover:underline disabled:opacity-60"
                >
                  Start again
                </button>
              )}
            </div>
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
