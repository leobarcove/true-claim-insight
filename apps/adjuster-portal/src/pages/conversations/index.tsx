import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { MessageSquare, PanelRight, Send, StickyNote } from 'lucide-react';
import { CHANNEL_CAPABILITIES, CHANNEL_LABELS } from '@tci/shared-types';

import { Header } from '@/components/layout/header';
import { ContextPanel } from '@/components/conversations/context-panel';
import { ConversationList, matchesQuery } from '@/components/conversations/conversation-list';
import { MessageThread } from '@/components/conversations/message-thread';
import { EvidenceViewer } from '@/components/cases/evidence-viewer';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useAuthStore } from '@/stores/auth-store';
import {
  ConversationMessage,
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
import { STATUS_STYLE, time, waitedSince } from '@/components/conversations/shared';
import { cn } from '@/lib/utils';

/**
 * The conversations inbox — three panes: queue, thread, claim context.
 *
 * Two jobs, and they pull in different directions. Reviewing how the bot
 * performs needs the machine's words visibly distinct from a human's, which is
 * why bot and agent messages are styled apart rather than merged into one
 * "from us" column. Assisting a claimant needs the claim beside the thread —
 * an agent who has to open another tab to see what was being claimed will
 * answer the wrong question. The context panel exists for the second job; the
 * thread's speaker styling for the first.
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
  const [query, setQuery] = useState('');
  /**
   * The context panel starts open where there is room for it and closed where
   * there is not; after that it is the operator's choice. Evaluated once —
   * tracking resize would close a panel someone deliberately opened.
   */
  const [showContext, setShowContext] = useState(
    () => typeof window === 'undefined' || window.matchMedia('(min-width: 1280px)').matches
  );
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
        return (
          new Date(a.handoverAt ?? a.lastSeenAt).getTime() -
          new Date(b.handoverAt ?? b.lastSeenAt).getTime()
        );
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

  const agentNames = useMemo(
    () => new Map((agents ?? []).map(agent => [agent.id, agent.fullName])),
    [agents]
  );

  /** What the keyboard walks and the list draws: one filter, applied once. */
  const visibleConversations = useMemo(
    () => conversations.filter(row => matchesQuery(row, query)),
    [conversations, query]
  );

  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
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

  /**
   * ↑↓ and j/k walk the queue. Working an inbox is hundreds of small
   * decisions, and moving a hand to the mouse between each one is the cost
   * that compounds. Guarded to do nothing while any field has focus — "j" is
   * also a letter people type.
   */
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }
      const isNext = event.key === 'ArrowDown' || event.key === 'j';
      const isPrevious = event.key === 'ArrowUp' || event.key === 'k';
      if (!isNext && !isPrevious) return;
      if (visibleConversations.length === 0) return;
      event.preventDefault();
      const index = visibleConversations.findIndex(row => row.id === selectedId);
      const nextIndex =
        index === -1
          ? 0
          : Math.min(Math.max(index + (isNext ? 1 : -1), 0), visibleConversations.length - 1);
      const next = visibleConversations[nextIndex];
      if (next && next.id !== selectedId) selectConversation(next.id);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleConversations, selectedId]);

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
      resetComposerHeight();
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
    resetComposerHeight();
    toast({ title: 'Note saved', description: 'Only your team can see it.' });
  };

  /**
   * The composer grows with its text up to a cap, then scrolls. A one-line
   * box that scrolls its second line out of view invites sending half a
   * message; a box that grows without limit swallows the thread.
   */
  const autogrow = () => {
    const el = composerRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  };
  const resetComposerHeight = () => {
    const el = composerRef.current;
    if (el) el.style.height = 'auto';
  };

  const channelLabel = thread ? CHANNEL_LABELS[thread.channel] ?? thread.channel : '';
  const channelRetains = thread
    ? CHANNEL_CAPABILITIES[thread.channel]?.retainsPlaintext
    : false;

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
        {/* Queue */}
        <div className="w-80 border-r shrink-0 min-h-0">
          <ConversationList
            conversations={conversations}
            isLoading={isLoading}
            selectedId={selectedId}
            currentUserId={currentUserId}
            agentNames={agentNames}
            onSelect={selectConversation}
            query={query}
            onQueryChange={setQuery}
          />
        </div>

        {/* Thread */}
        <div className="flex-1 flex flex-col min-h-0 min-w-0">
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
              {/* Identity only; the claim's detail and the management controls
                  live in the context panel, so this bar stays scannable. */}
              <div className="px-6 py-3 border-b flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="font-medium truncate">
                    {thread.claimant?.fullName || thread.claimant?.phoneNumber || 'Unknown claimant'}
                  </div>
                  <div className="text-xs text-muted-foreground flex items-center gap-2">
                    <span className="inline-flex items-center gap-1">
                      {channelLabel}
                      {channelRetains && (
                        <span
                          title={`${channelLabel} keeps a copy of this conversation on its own servers. Avoid sending anything that should not persist there.`}
                          className="text-amber-600 dark:text-amber-500"
                          aria-label="This channel retains message history off-platform"
                        >
                          ⚠
                        </span>
                      )}
                    </span>
                    {thread.case && (
                      <>
                        <span>·</span>
                        <Link
                          to={`/cases/${thread.case.id}`}
                          className="text-primary hover:underline"
                        >
                          {thread.case.caseNumber}
                        </Link>
                      </>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge variant="outline" className={STATUS_STYLE[thread.status].className}>
                    {STATUS_STYLE[thread.status].label}
                  </Badge>
                  {!inHandover && <Badge variant="outline">Bot is answering</Badge>}
                  <Button
                    size="sm"
                    variant={showContext ? 'secondary' : 'ghost'}
                    onClick={() => setShowContext(open => !open)}
                    aria-label={showContext ? 'Hide claim context' : 'Show claim context'}
                    aria-pressed={showContext}
                  >
                    <PanelRight className="h-4 w-4" />
                  </Button>
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
                  {thread.snoozedUntil && (
                    <span className="opacity-80">· snoozed until {time(thread.snoozedUntil)}</span>
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
                <div ref={contentRef}>
                  <MessageThread
                    messages={thread.messages}
                    handoverAt={thread.handoverAt}
                    handoverReason={thread.handoverReason}
                    onOpenAttachment={setViewingAttachment}
                  />
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
                        className={
                          composing === 'note'
                            ? 'bg-amber-500 hover:bg-amber-500/90 text-amber-950'
                            : ''
                        }
                        onClick={() => setComposing('note')}
                      >
                        <StickyNote className="h-3.5 w-3.5 mr-1" />
                        Internal note
                      </Button>
                    </div>

                    <div
                      className={cn(
                        'flex gap-2 rounded-md p-2 -m-2 items-end',
                        composing === 'note' && 'bg-amber-500/10 ring-1 ring-amber-500/40'
                      )}
                    >
                      <textarea
                        ref={composerRef}
                        rows={1}
                        className="flex-1 resize-none rounded-md border bg-background px-3 py-2 text-sm leading-5"
                        placeholder={
                          composing === 'note'
                            ? 'Note for your team — the claimant never sees this…'
                            : 'Write to the claimant…'
                        }
                        value={draft}
                        maxLength={composing === 'note' ? 4000 : 1024}
                        onChange={event => setDraft(event.target.value)}
                        onInput={autogrow}
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
                    <p className="text-[11px] text-muted-foreground">
                      Enter to send · Shift+Enter for a new line
                    </p>
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

        {/* Claim context */}
        {thread && showContext && (
          <div className="w-80 border-l shrink-0 min-h-0 hidden md:block">
            <ContextPanel
              thread={thread}
              agents={agents}
              currentUserId={currentUserId}
              canManage={canManage}
              assignPending={assign.isPending}
              snoozePending={setStatus.isPending}
              onAssign={id => void handleAssign(id)}
              onSnooze={hours => void handleSnooze(hours)}
              onResolve={() => void handleResolve()}
              onOpenAttachment={setViewingAttachment}
            />
          </div>
        )}
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
