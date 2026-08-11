import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Bot, Loader2, MessageSquare, Send, User, UserCheck } from 'lucide-react';
import { CHANNEL_CAPABILITIES, CHANNEL_LABELS, describeCallbackValue } from '@tci/shared-types';

import { Header } from '@/components/layout/header';
import { AttachmentThumbnail } from '@/components/conversations/attachment-thumbnail';
import { EvidenceViewer } from '@/components/cases/evidence-viewer';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import {
  ConversationMessage,
  ConversationMode,
  ConversationSummary,
  useConversation,
  useConversations,
  useReplyToConversation,
  useResolveConversation,
  useTakeOverConversation,
} from '@/hooks/use-conversations';
import { cn } from '@/lib/utils';

/**
 * The conversations inbox.
 *
 * Two jobs, and they pull in different directions. Reviewing how the bot
 * performs needs the machine's words visibly distinct from a human's, which is
 * why bot and agent messages are styled apart rather than merged into one
 * "from us" column. Assisting a claimant needs the claim beside the thread —
 * an agent who has to open another tab to see what was being claimed will
 * answer the wrong question.
 */

/**
 * "All" leads and is the default.
 *
 * Filtering to HANDOVER by default hid every ordinary bot conversation, so the
 * screen read as empty exactly when it was working — the opposite of the FNOL
 * queue, where the urgent states genuinely are the whole point. Here the common
 * case is a bot conversation nobody needs to touch, and an inbox that hides it
 * teaches an operator the feature is broken.
 */
const FILTERS: { value: ConversationMode | 'ALL'; label: string }[] = [
  { value: 'ALL', label: 'All' },
  { value: 'HANDOVER', label: 'With an agent' },
  { value: 'BOT', label: 'With the bot' },
];

/** Who said it — the distinction the whole screen exists to make visible. */
type Speaker = 'claimant' | 'bot' | 'agent';

const speakerOf = (message: ConversationMessage): Speaker => {
  if (message.direction === 'INBOUND') return 'claimant';
  return message.sentByUserId ? 'agent' : 'bot';
};

const SPEAKER_STYLE: Record<Speaker, { bubble: string; row: string; icon: any; label: string }> = {
  claimant: {
    bubble: 'bg-muted text-foreground',
    row: 'justify-start',
    icon: User,
    label: 'Claimant',
  },
  bot: {
    bubble: 'bg-primary/10 text-foreground border border-primary/30',
    row: 'justify-end',
    icon: Bot,
    label: 'Bot',
  },
  agent: {
    bubble: 'bg-primary text-primary-foreground',
    row: 'justify-end',
    icon: UserCheck,
    label: 'Agent',
  },
};

const time = (iso: string) =>
  new Date(iso).toLocaleString('en-MY', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

export function ConversationsPage() {
  /**
   * Tab and open thread live in the URL, not component state.
   *
   * An inbox is something people link each other to — "have a look at this
   * one" is the normal way a conversation reaches a second pair of eyes. Held
   * in useState, a refresh dropped you back to the first row and a pasted link
   * opened someone else's thread.
   */
  const [searchParams, setSearchParams] = useSearchParams();
  const filter = (searchParams.get('tab') as ConversationMode | 'ALL') || 'ALL';
  const selectedId = searchParams.get('conversation') || undefined;

  const setFilter = (value: ConversationMode | 'ALL') => {
    setSearchParams(
      current => {
        const next = new URLSearchParams(current);
        if (value === 'ALL') next.delete('tab');
        else next.set('tab', value);
        // Changing tab drops the open thread: it may not be in the new list,
        // and showing a thread the list does not contain is confusing.
        next.delete('conversation');
        return next;
      },
      { replace: false }
    );
  };

  const selectConversation = (id: string, replace = false) => {
    setSearchParams(
      current => {
        const next = new URLSearchParams(current);
        next.set('conversation', id);
        return next;
      },
      // `replace` for the automatic first-row selection, so the back button
      // does not have to walk through a choice nobody made.
      { replace }
    );
  };

  const [draft, setDraft] = useState('');
  const [reason, setReason] = useState('');
  const [viewingAttachment, setViewingAttachment] =
    useState<NonNullable<ConversationMessage['attachment']> | null>(null);
  const { toast } = useToast();

  const { data: conversations, isLoading } = useConversations(
    filter === 'ALL' ? undefined : filter
  );
  const { data: thread } = useConversation(selectedId);

  const takeOver = useTakeOverConversation();
  const reply = useReplyToConversation();
  const resolve = useResolveConversation();

  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  /**
   * Whether the view should stay stuck to the newest message.
   *
   * True on landing and while the operator is reading the bottom; false the
   * moment they scroll up, because yanking someone back down while they are
   * reading history is worse than the problem this solves.
   */
  const pinnedRef = useRef(true);

  /**
   * Land on the newest message, and stay there while the transcript settles.
   *
   * Three things were wrong. The scroll was keyed only on message *count*, so
   * switching to another thread of the same length did not re-run it. It
   * animated, which on a long transcript means watching hundreds of messages
   * fly past instead of simply arriving at the end. And attachment thumbnails
   * are fetched as blobs *after* mount, so the content grew by a couple of
   * thousand pixels once the images decoded — long after the one scroll had
   * finished, leaving the view stranded mid-conversation.
   *
   * Hence a ResizeObserver rather than a single call: the correct moment to
   * be at the bottom is "whenever the content stops changing", which is not
   * knowable in advance.
   */
  useEffect(() => {
    const container = scrollRef.current;
    const content = contentRef.current;
    if (!container || !content) return;

    pinnedRef.current = true;
    const pin = () => {
      if (pinnedRef.current) container.scrollTop = container.scrollHeight;
    };

    pin();
    const observer = new ResizeObserver(pin);
    observer.observe(content);
    return () => observer.disconnect();
  }, [selectedId, thread?.messages.length]);

  /** Reading history unpins; returning to the bottom pins again. */
  const handleScroll = () => {
    const container = scrollRef.current;
    if (!container) return;
    const distanceFromBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight;
    // A few pixels of tolerance: sub-pixel layout and zoom mean an exact
    // equality would read as "scrolled up" when the operator is at the end.
    pinnedRef.current = distanceFromBottom < 40;
  };

  // Half-typed text belongs to the thread it was typed in. Now that switching
  // threads is a navigation, a leftover draft could be sent to the wrong
  // claimant.
  useEffect(() => {
    setDraft('');
    setReason('');
  }, [selectedId]);

  // Selecting nothing on an inbox is a dead screen; open whatever is waiting.
  useEffect(() => {
    if (!selectedId && conversations?.length) selectConversation(conversations[0].id, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversations, selectedId]);

  // A thread that leaves the filtered list — resolved while you were reading it,
  // say — must not leave a stale id in the URL pointing at nothing.
  useEffect(() => {
    if (!selectedId || !conversations) return;
    if (!conversations.some(conversation => conversation.id === selectedId)) {
      setSearchParams(
        current => {
          const next = new URLSearchParams(current);
          next.delete('conversation');
          return next;
        },
        { replace: true }
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversations, selectedId]);

  const waitingTotal = useMemo(
    () => (conversations ?? []).reduce((sum, c) => sum + c.awaitingAgent, 0),
    [conversations]
  );

  const handleTakeOver = async () => {
    if (!selectedId || reason.trim().length < 4) {
      toast({
        title: 'A reason is needed',
        description: 'It is what turns a handover count into a list of things to fix.',
        variant: 'destructive',
      });
      return;
    }
    await takeOver.mutateAsync({ id: selectedId, reason: reason.trim() });
    setReason('');
    toast({ title: 'You have this conversation', description: 'The bot has stopped replying.' });
  };

  const handleReply = async () => {
    if (!selectedId || !draft.trim()) return;
    try {
      await reply.mutateAsync({ id: selectedId, text: draft.trim() });
      setDraft('');
    } catch (error: any) {
      toast({
        title: 'Not sent',
        description: error?.response?.data?.error?.message || 'Could not send the message.',
        variant: 'destructive',
      });
    }
  };

  const handleResolve = async () => {
    if (!selectedId) return;
    await resolve.mutateAsync({ id: selectedId });
    toast({
      title: 'Handed back to the bot',
      description: 'The conversation resumes at the step the claim is on.',
    });
  };

  const inHandover = thread?.mode === 'HANDOVER';

  return (
    <div className="flex flex-col h-full">
      <Header
        title="Conversations"
        description={
          waitingTotal > 0
            ? `${waitingTotal} message${waitingTotal === 1 ? '' : 's'} waiting for a human`
            : 'Claimant conversations across every channel'
        }
      />

      <div className="flex gap-2 px-6 py-3 border-b">
        {FILTERS.map(option => (
          <Button
            key={option.value}
            variant={filter === option.value ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter(option.value)}
          >
            {option.label}
          </Button>
        ))}
      </div>

      <div className="flex flex-1 min-h-0">
        {/* Conversation list */}
        <div className="w-80 border-r overflow-y-auto">
          {isLoading && (
            <div className="p-6 text-sm text-muted-foreground flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          )}
          {conversations?.length === 0 && (
            <div className="p-6 text-sm text-muted-foreground">
              Nothing here. Conversations appear once a claimant is verified on a channel.
            </div>
          )}
          {conversations?.map(conversation => (
            <ConversationRow
              key={conversation.id}
              conversation={conversation}
              selected={conversation.id === selectedId}
              onSelect={() => selectConversation(conversation.id)}
            />
          ))}
        </div>

        {/* Thread */}
        <div className="flex-1 flex flex-col min-h-0">
          {!thread && (
            <div className="flex-1 grid place-items-center text-sm text-muted-foreground">
              <div className="flex flex-col items-center gap-2">
                <MessageSquare className="h-8 w-8 opacity-40" />
                Select a conversation
              </div>
            </div>
          )}

          {thread && (
            <>
              {/* Claim context, beside the thread rather than a tab away */}
              <div className="px-6 py-3 border-b flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="font-medium truncate">
                    {thread.claimant?.fullName || thread.claimant?.phoneNumber || 'Unknown claimant'}
                  </div>
                  <div className="text-xs text-muted-foreground flex items-center gap-2">
                    <ChannelTag channel={thread.channel} />
                    {thread.case && (
                      <>
                        <span>·</span>
                        <Link to={`/cases/${thread.case.id}`} className="text-primary hover:underline">
                          {thread.case.caseNumber}
                        </Link>
                        <span>·</span>
                        <span>{thread.case.status}</span>
                      </>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {inHandover ? (
                    <>
                      <Badge variant="outline" className="border-primary text-primary">
                        You have this
                      </Badge>
                      <Button size="sm" variant="outline" onClick={handleResolve}>
                        Hand back to bot
                      </Button>
                    </>
                  ) : (
                    <Badge variant="outline">Bot is answering</Badge>
                  )}
                </div>
              </div>

              {thread.handoverReason && inHandover && (
                <div className="px-6 py-2 text-xs text-muted-foreground border-b bg-muted/30">
                  Taken over: {thread.handoverReason}
                </div>
              )}

              <div
                ref={scrollRef}
                onScroll={handleScroll}
                className="flex-1 overflow-y-auto px-6 py-4"
              >
                {/* Inner wrapper so the ResizeObserver watches the content's
                    height rather than the fixed-height viewport, which never
                    changes and would therefore never fire. */}
                <div ref={contentRef} className="space-y-3">
                  {thread.messages.map(message => (
                    <MessageBubble
                      key={message.id}
                      message={message}
                      onOpenAttachment={setViewingAttachment}
                    />
                  ))}
                </div>
              </div>

              {/* Composer */}
              <div className="border-t p-4">
                {inHandover ? (
                  <div className="flex gap-2">
                    <input
                      className="flex-1 rounded-md border bg-background px-3 py-2 text-sm"
                      placeholder="Write to the claimant…"
                      value={draft}
                      maxLength={1024}
                      onChange={event => setDraft(event.target.value)}
                      onKeyDown={event => {
                        if (event.key === 'Enter' && !event.shiftKey) {
                          event.preventDefault();
                          void handleReply();
                        }
                      }}
                    />
                    <Button onClick={handleReply} disabled={!draft.trim() || reply.isPending}>
                      <Send className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground">
                      The bot is answering. Take the conversation over to reply — it stops
                      automated messages so you are not talking over each other.
                    </p>
                    <div className="flex gap-2">
                      <input
                        className="flex-1 rounded-md border bg-background px-3 py-2 text-sm"
                        placeholder="Why are you stepping in? e.g. bot could not parse the date"
                        value={reason}
                        maxLength={500}
                        onChange={event => setReason(event.target.value)}
                      />
                      <Button onClick={handleTakeOver} disabled={takeOver.isPending}>
                        Take over
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {viewingAttachment && (
        <EvidenceViewer
          caseId={viewingAttachment.caseId}
          document={{
            id: viewingAttachment.id,
            fileName: viewingAttachment.fileName,
            documentType: viewingAttachment.documentType,
            mimeType: viewingAttachment.mimeType,
          }}
          onClose={() => setViewingAttachment(null)}
        />
      )}
    </div>
  );
}

function ConversationRow({
  conversation,
  selected,
  onSelect,
}: {
  conversation: ConversationSummary;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'w-full text-left px-4 py-3 border-b hover:bg-muted/40 transition-colors',
        selected && 'bg-muted/60'
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium text-sm truncate">
          {conversation.claimant?.fullName || conversation.claimant?.phoneNumber || 'Unknown'}
        </span>
        {conversation.awaitingAgent > 0 && (
          <Badge variant="destructive" className="shrink-0">
            {conversation.awaitingAgent}
          </Badge>
        )}
      </div>
      <div className="text-xs text-muted-foreground truncate mt-0.5">
        {conversation.lastMessage?.text || 'No messages yet'}
      </div>
      <div className="flex items-center gap-2 mt-1 text-[11px] text-muted-foreground">
        <ChannelTag channel={conversation.channel} />
        {conversation.case && (
          <>
            <span>·</span>
            <span>{conversation.case.caseNumber}</span>
          </>
        )}
        {conversation.mode === 'HANDOVER' && (
          <>
            <span>·</span>
            <span className="text-primary">with an agent</span>
          </>
        )}
      </div>
    </button>
  );
}

function MessageBubble({
  message,
  onOpenAttachment,
}: {
  message: ConversationMessage;
  onOpenAttachment: (attachment: NonNullable<ConversationMessage['attachment']>) => void;
}) {
  const speaker = speakerOf(message);
  const style = SPEAKER_STYLE[speaker];
  const Icon = style.icon;

  return (
    <div className={cn('flex', style.row)}>
      <div className="max-w-[75%] space-y-1">
        <div
          className={cn(
            'flex items-center gap-1.5 text-[11px] text-muted-foreground',
            speaker === 'claimant' ? 'justify-start' : 'justify-end'
          )}
        >
          <Icon className="h-3 w-3" />
          <span>{style.label}</span>
          <span>·</span>
          <span>{time(message.createdAt)}</span>
        </div>
        <div className={cn('rounded-lg px-3 py-2 text-sm whitespace-pre-wrap', style.bubble)}>
          {/* An attachment shows the file itself: an operator vetting a damage
              photo needs to see it, not read its name. */}
          {message.attachment ? (
            <AttachmentThumbnail
              attachment={message.attachment}
              onOpen={() => onOpenAttachment(message.attachment!)}
            />
          ) : (
            /* describeCallbackValue covers a tap the gateway could not resolve
               to a label. Turns recorded before the value was stored have
               nothing to show and cannot be reconstructed — they say so rather
               than rendering a dash, which reads as "the claimant sent an empty
               message" and is a different, wrong fact. */
            message.text ||
            describeCallbackValue(message.callbackValue) ||
            (message.mediaRef ? (
              <span className="italic text-muted-foreground">
                Attachment not linked — this turn predates the fix
              </span>
            ) : (
              <span className="italic text-muted-foreground">
                Selection not recorded — this turn predates the fix
              </span>
            ))
          )}
        </div>
        {/* A message the bot could not interpret is the raw material of any
            performance review — surfaced, not hidden behind a status column. */}
        {message.status === 'UNPARSEABLE' && (
          <div className="text-[11px] text-amber-600">Bot could not interpret this</div>
        )}
        {message.status === 'AWAITING_AGENT' && (
          <div className="text-[11px] text-destructive">Waiting for a human</div>
        )}
        {message.status === 'FAILED' && (
          <div className="text-[11px] text-destructive">
            Not delivered{message.error ? ` — ${message.error}` : ''}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Which channel a thread is on, and whether it keeps what is typed.
 *
 * Not decoration. `retainsPlaintext` says the claimant's copy lives in a third
 * party's message history — offshore, outside our retention sweep, and beyond
 * anything we can delete. An agent about to type a payout reference into a
 * Telegram thread is making a disclosure they cannot take back, and the only
 * moment that is worth saying is before they type it.
 */
function ChannelTag({ channel }: { channel: string }) {
  const label = CHANNEL_LABELS[channel] ?? channel;
  const retains = CHANNEL_CAPABILITIES[channel]?.retainsPlaintext;

  return (
    <span className="inline-flex items-center gap-1">
      <span>{label}</span>
      {retains && (
        <span
          title={`${label} keeps a copy of this conversation on its own servers. Avoid sending anything that should not persist there.`}
          className="text-amber-600 dark:text-amber-500"
          aria-label="This channel retains message history off-platform"
        >
          ⚠
        </span>
      )}
    </span>
  );
}
