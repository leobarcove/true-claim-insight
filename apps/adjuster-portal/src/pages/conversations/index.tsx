import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Bot, Loader2, MessageSquare, Send, StickyNote, User, UserCheck } from 'lucide-react';
import { CHANNEL_CAPABILITIES, CHANNEL_LABELS, describeCallbackValue } from '@tci/shared-types';

import { Header } from '@/components/layout/header';
import { AttachmentThumbnail } from '@/components/conversations/attachment-thumbnail';
import { EvidenceViewer } from '@/components/cases/evidence-viewer';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useAuthStore } from '@/stores/auth-store';
import {
  ConversationMessage,
  ConversationStatus,
  ConversationSummary,
  useAddNote,
  useAssignableAgents,
  useAssignConversation,
  useConversation,
  useConversations,
  useReplyToConversation,
  useResolveConversation,
  useSetConversationStatus,
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
/**
 * Views, not statuses.
 *
 * There is deliberately no "Needs reply" view: that is `status === 'OPEN'`,
 * shown as a badge and used to sort. A view per status would put the same
 * conversation in two places and make the counts disagree.
 */
type View = 'MINE' | 'UNASSIGNED' | 'ALL' | 'SNOOZED';

const VIEWS: { value: View; label: string }[] = [
  { value: 'MINE', label: 'Mine' },
  { value: 'UNASSIGNED', label: 'Unassigned' },
  { value: 'ALL', label: 'All' },
  { value: 'SNOOZED', label: 'Snoozed' },
];

/**
 * Snooze options, not a date picker.
 *
 * Every real choice here is "not now, but don't lose it", and the three
 * timescales that covers are: after this call, after lunch, tomorrow. A
 * calendar widget makes the agent do arithmetic to express one of them.
 */
const SNOOZE_OPTIONS: { label: string; hours: number }[] = [
  { label: 'in 1 hour', hours: 1 },
  { label: 'in 3 hours', hours: 3 },
  { label: 'tomorrow', hours: 24 },
];

const STATUS_STYLE: Record<ConversationStatus, { label: string; className: string }> = {
  BOT: { label: 'Bot', className: 'bg-muted text-muted-foreground' },
  OPEN: { label: 'Needs reply', className: 'bg-destructive/10 text-destructive border-destructive/30' },
  PENDING: { label: 'Waiting on claimant', className: 'bg-amber-500/10 text-amber-700 dark:text-amber-500' },
  SNOOZED: { label: 'Snoozed', className: 'bg-muted text-muted-foreground' },
  RESOLVED: { label: 'Resolved', className: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-500' },
};

/** "3h" / "2d" — how long somebody has been waiting, in the least words. */
function waitedSince(iso: string): string {
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

/** Who said it — the distinction the whole screen exists to make visible. */
type Speaker = 'claimant' | 'bot' | 'agent' | 'note';

const speakerOf = (message: ConversationMessage): Speaker => {
  // Checked first. A note is not a quieter message from the firm, it is a
  // message that was never sent, and rendering it anywhere near the outbound
  // styling invites somebody to read it as something the claimant saw.
  if (message.direction === 'INTERNAL') return 'note';
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
  note: {
    // Centred and amber: off the claimant/firm axis entirely, because it
    // belongs to neither side of the conversation.
    bubble:
      'bg-amber-500/10 text-foreground border border-dashed border-amber-500/50 italic',
    row: 'justify-center',
    icon: StickyNote,
    label: 'Internal note — not sent to the claimant',
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
  const view = (searchParams.get('tab') as View) || 'MINE';
  const selectedId = searchParams.get('conversation') || undefined;

  const setView = (value: View) => {
    setSearchParams(
      current => {
        const next = new URLSearchParams(current);
        if (value === 'MINE') next.delete('tab');
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
  /** Reply goes to the claimant; note stays with the team. */
  const [composing, setComposing] = useState<'reply' | 'note'>('reply');
  const [reason, setReason] = useState('');
  const [viewingAttachment, setViewingAttachment] =
    useState<NonNullable<ConversationMessage['attachment']> | null>(null);
  const { toast } = useToast();
  const currentUserId = useAuthStore(state => state.user?.id) ?? null;
  const currentRole = useAuthStore(state => state.user?.role);
  /** Admins may move work off a colleague; everyone else may not. */
  const isAdmin = currentRole === 'FIRM_ADMIN' || currentRole === 'SUPER_ADMIN';

  // Always fetch everything and filter in the client. The views are cuts of
  // one list, and asking the server per view would make the counts on the
  // other tabs stale the moment you switched.
  const { data: allConversations, isLoading } = useConversations();

  const conversations = useMemo(() => {
    const rows = allConversations ?? [];
    const mine = (row: ConversationSummary) => row.assignedUserId === currentUserId;

    const inView = rows.filter(row => {
      if (view === 'MINE') return mine(row);
      if (view === 'UNASSIGNED') return row.assignedUserId === null && row.mode === 'HANDOVER';
      if (view === 'SNOOZED') return row.status === 'SNOOZED';
      return true;
    });

    // Longest wait first among the ones that need a person; everything else
    // by recency. A queue sorted purely by time buries the oldest complaint.
    return [...inView].sort((a, b) => {
      const aOpen = a.status === 'OPEN';
      const bOpen = b.status === 'OPEN';
      if (aOpen !== bOpen) return aOpen ? -1 : 1;
      if (aOpen && bOpen) {
        return new Date(a.handoverAt ?? a.lastSeenAt).getTime() -
          new Date(b.handoverAt ?? b.lastSeenAt).getTime();
      }
      return new Date(b.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime();
    });
  }, [allConversations, view, currentUserId]);

  const viewCounts = useMemo(() => {
    const rows = allConversations ?? [];
    return {
      MINE: rows.filter(r => r.assignedUserId === currentUserId && r.status === 'OPEN').length,
      UNASSIGNED: rows.filter(r => r.assignedUserId === null && r.mode === 'HANDOVER').length,
      ALL: rows.filter(r => r.status === 'OPEN').length,
      SNOOZED: rows.filter(r => r.status === 'SNOOZED').length,
    } as Record<View, number>;
  }, [allConversations, currentUserId]);
  const { data: thread } = useConversation(selectedId);

  const takeOver = useTakeOverConversation();
  const reply = useReplyToConversation();
  const resolve = useResolveConversation();
  const assign = useAssignConversation();
  const setStatus = useSetConversationStatus();
  const addNote = useAddNote();
  const { data: agents } = useAssignableAgents();

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

  /**
   * May this operator move the conversation about?
   *
   * Mirrors the server rule rather than trusting it to say no: an agent who
   * discovers they cannot reassign by receiving a 400 has been told off for
   * trying something the screen offered them.
   */
  const canManage =
    !thread?.assignedUserId || thread.assignedUserId === currentUserId || isAdmin;

  const handleAssign = async (assigneeId: string | null) => {
    if (!selectedId) return;
    await assign.mutateAsync({ id: selectedId, assigneeId });
    const name = agents?.find(agent => agent.id === assigneeId)?.fullName;
    toast({
      title: assigneeId ? `Assigned to ${name ?? 'colleague'}` : 'Returned to the unassigned queue',
    });
  };

  const handleSnooze = async (hours: number) => {
    if (!selectedId || !hours) return;
    const until = new Date(Date.now() + hours * 60 * 60 * 1000);
    await setStatus.mutateAsync({
      id: selectedId,
      status: 'SNOOZED',
      snoozedUntil: until.toISOString(),
    });
    toast({
      title: 'Snoozed',
      description: `Back in your queue at ${time(until.toISOString())}.`,
    });
  };

  const handleNote = async () => {
    if (!selectedId || !draft.trim()) return;
    await addNote.mutateAsync({ id: selectedId, text: draft.trim() });
    setDraft('');
    toast({ title: 'Note saved', description: 'Only your team can see it.' });
  };

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
        {VIEWS.map(option => (
          <Button
            key={option.value}
            variant={view === option.value ? 'default' : 'outline'}
            size="sm"
            onClick={() => setView(option.value)}
            className="gap-2"
          >
            {option.label}
            {viewCounts[option.value] > 0 && (
              <span
                className={cn(
                  'rounded-full px-1.5 text-[11px] leading-5',
                  view === option.value
                    ? 'bg-primary-foreground/20'
                    : 'bg-destructive/10 text-destructive'
                )}
              >
                {viewCounts[option.value]}
              </span>
            )}
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
                  <Badge variant="outline" className={STATUS_STYLE[thread.status].className}>
                    {STATUS_STYLE[thread.status].label}
                  </Badge>

                  {inHandover && (
                    <>
                      <select
                        aria-label="Assign to"
                        className="rounded-md border bg-background px-2 py-1.5 text-xs disabled:opacity-50"
                        value={thread.assignedUserId ?? ''}
                        disabled={!canManage || assign.isPending}
                        title={
                          canManage
                            ? undefined
                            : 'Another agent has this conversation. A firm admin can move it.'
                        }
                        onChange={event => void handleAssign(event.target.value || null)}
                      >
                        <option value="">Unassigned</option>
                        {agents?.map(agent => (
                          <option key={agent.id} value={agent.id}>
                            {agent.fullName}
                            {agent.id === currentUserId ? ' (you)' : ''}
                          </option>
                        ))}
                      </select>

                      <select
                        aria-label="Snooze"
                        className="rounded-md border bg-background px-2 py-1.5 text-xs disabled:opacity-50"
                        value=""
                        disabled={!canManage || setStatus.isPending}
                        onChange={event => void handleSnooze(Number(event.target.value))}
                      >
                        <option value="">Snooze…</option>
                        {SNOOZE_OPTIONS.map(option => (
                          <option key={option.hours} value={option.hours}>
                            {option.label}
                          </option>
                        ))}
                      </select>

                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleResolve}
                        disabled={!canManage}
                      >
                        Hand back to bot
                      </Button>
                    </>
                  )}
                  {!inHandover && <Badge variant="outline">Bot is answering</Badge>}
                </div>
              </div>

              {inHandover && (
                /*
                 * The thing no generic support console has to say. Taking a
                 * conversation stops the bot, so the claim stops being filled
                 * in — a thread left open for three days is not a slow reply,
                 * it is an intake that has not moved and a CSP clock that may
                 * be running against the firm. Stated at the top, with the
                 * elapsed time, because nothing else on the screen says it.
                 */
                <div className="px-6 py-2 text-xs border-b bg-amber-500/10 text-amber-900 dark:text-amber-200 flex items-center gap-2 flex-wrap">
                  <span className="font-medium">Intake is paused.</span>
                  <span>
                    The bot stopped
                    {thread.handoverAt ? ` ${waitedSince(thread.handoverAt)} ago` : ''} and will not
                    ask the claimant anything until you hand it back.
                  </span>
                  {thread.handoverReason && (
                    <span className="opacity-80">· {thread.handoverReason}</span>
                  )}
                  {thread.snoozedUntil && (
                    <span className="opacity-80">
                      · snoozed until {time(thread.snoozedUntil)}
                    </span>
                  )}
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
                  /*
                   * Note mode changes the colour of the whole composer, not
                   * just a label. The worst thing this screen can do is send
                   * an internal note to a claimant, and a selected tab is easy
                   * to miss when you are reading the thread rather than the
                   * controls. A different background is not.
                   */
                  <div className="space-y-2">
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        variant={composing === 'reply' ? 'default' : 'ghost'}
                        onClick={() => setComposing('reply')}
                      >
                        Reply to claimant
                      </Button>
                      <Button
                        size="sm"
                        variant={composing === 'note' ? 'default' : 'ghost'}
                        className={composing === 'note' ? 'bg-amber-500 hover:bg-amber-500/90 text-amber-950' : ''}
                        onClick={() => setComposing('note')}
                      >
                        <StickyNote className="h-3.5 w-3.5 mr-1" />
                        Internal note
                      </Button>
                    </div>

                    <div
                      className={cn(
                        'flex gap-2 rounded-md p-2 -m-2',
                        composing === 'note' && 'bg-amber-500/10 ring-1 ring-amber-500/40'
                      )}
                    >
                      <input
                        className="flex-1 rounded-md border bg-background px-3 py-2 text-sm"
                        placeholder={
                          composing === 'note'
                            ? 'Note for your team — the claimant never sees this…'
                            : 'Write to the claimant…'
                        }
                        value={draft}
                        maxLength={composing === 'note' ? 4000 : 1024}
                        onChange={event => setDraft(event.target.value)}
                        onKeyDown={event => {
                          if (event.key === 'Enter' && !event.shiftKey) {
                            event.preventDefault();
                            void (composing === 'note' ? handleNote() : handleReply());
                          }
                        }}
                      />
                      <Button
                        onClick={() => void (composing === 'note' ? handleNote() : handleReply())}
                        disabled={!draft.trim() || reply.isPending || addNote.isPending}
                        className={
                          composing === 'note'
                            ? 'bg-amber-500 hover:bg-amber-500/90 text-amber-950'
                            : ''
                        }
                      >
                        {composing === 'note' ? (
                          <StickyNote className="h-4 w-4" />
                        ) : (
                          <Send className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
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
      // Announced as the current item, not merely drawn as one. The visual
      // cues below are invisible to a screen reader.
      aria-current={selected ? 'true' : undefined}
      className={cn(
        'relative w-full text-left px-4 py-3 border-b transition-colors',
        'hover:bg-muted/40',
        // Three cues, deliberately redundant: an accent bar (position), a
        // tint (colour) and a heavier title (typography). The previous
        // selected state was bg-muted/60 against a bg-muted/40 hover — a 20%
        // opacity step on one colour, so "selected" and "hovered" were all
        // but identical. That is survivable when rows have distinct titles;
        // here two channels for the same claimant both read as their phone
        // number, and the highlight is the only thing telling them apart.
        selected && 'bg-primary/10 hover:bg-primary/10'
      )}
    >
      {selected && (
        <span aria-hidden className="absolute inset-y-0 left-0 w-1 bg-primary" />
      )}
      <div className="flex items-center justify-between gap-2">
        <span className={cn('text-sm truncate', selected ? 'font-semibold' : 'font-medium')}>
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
      <div className="flex items-center gap-2 mt-1 text-[11px] text-muted-foreground flex-wrap">
        <span className={cn('rounded px-1.5 py-0.5', STATUS_STYLE[conversation.status].className)}>
          {STATUS_STYLE[conversation.status].label}
        </span>
        {/* How long a person has owed this. Only shown when one does — a wait
            on a bot conversation is not a wait. */}
        {conversation.status === 'OPEN' && conversation.handoverAt && (
          <span className="text-destructive font-medium">
            {waitedSince(conversation.handoverAt)}
          </span>
        )}
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
