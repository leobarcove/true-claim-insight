import { useMemo, useState } from 'react';
import { Loader2, Search, User } from 'lucide-react';
import { CHANNEL_CAPABILITIES, CHANNEL_LABELS } from '@tci/shared-types';

import { Badge } from '@/components/ui/badge';
import { ConversationSummary } from '@/hooks/use-conversations';
import { cn } from '@/lib/utils';

import { STATUS_STYLE, initialsOf, waitSeverity, waitedSince } from './shared';

/**
 * The left pane: a queue that answers "what needs me next" in one scan.
 *
 * Every element in a row earns its place by that test. The avatar and name
 * identify who; the wait chip and awaiting badge say how urgently; the
 * assignee chip says whether a colleague already has it (the collision
 * question — two agents drafting replies to one claimant is the shared-inbox
 * failure everything else here exists to prevent); the preview's "Bot:" /
 * "You:" prefix says who spoke last, which is the difference between "the
 * machine is coping" and "I owe an answer".
 */

interface ConversationListProps {
  conversations: ConversationSummary[] | undefined;
  isLoading: boolean;
  selectedId: string | undefined;
  currentUserId: string | null;
  /** id → display name, for the assignee chip. */
  agentNames: Map<string, string>;
  onSelect: (id: string) => void;
  /** Lifted so the page can apply the same filter to keyboard navigation. */
  query: string;
  onQueryChange: (query: string) => void;
}

/** Case-insensitive match on the three things an operator actually types. */
export function matchesQuery(conversation: ConversationSummary, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return [
    conversation.claimant?.fullName,
    conversation.claimant?.phoneNumber,
    conversation.case?.caseNumber,
  ].some(value => value?.toLowerCase().includes(needle));
}

export function ConversationList({
  conversations,
  isLoading,
  selectedId,
  currentUserId,
  agentNames,
  onSelect,
  query,
  onQueryChange,
}: ConversationListProps) {
  const filtered = useMemo(
    () => (conversations ?? []).filter(row => matchesQuery(row, query)),
    [conversations, query]
  );

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            className="w-full rounded-md border bg-background pl-8 pr-3 py-1.5 text-sm"
            placeholder="Name, phone or case number…"
            value={query}
            onChange={event => onQueryChange(event.target.value)}
            aria-label="Search conversations"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {isLoading && (
          <div className="p-6 text-sm text-muted-foreground flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        )}
        {!isLoading && filtered.length === 0 && (
          <div className="p-6 text-sm text-muted-foreground">
            {query.trim()
              ? 'No conversation matches that search.'
              : 'Nothing here. Conversations appear once a claimant is verified on a channel.'}
          </div>
        )}
        {filtered.map(conversation => (
          <ConversationRow
            key={conversation.id}
            conversation={conversation}
            selected={conversation.id === selectedId}
            currentUserId={currentUserId}
            agentNames={agentNames}
            onSelect={() => onSelect(conversation.id)}
          />
        ))}
      </div>

      {/* Present once you know it, invisible until you need it. */}
      <div className="px-3 py-1.5 border-t text-[11px] text-muted-foreground">
        ↑↓ or j/k to move between conversations
      </div>
    </div>
  );
}

/** "Bot: …" / "You: …" / bare text — who spoke last, before what they said. */
function previewOf(conversation: ConversationSummary, currentUserId: string | null): string {
  const last = conversation.lastMessage;
  if (!last) return 'No messages yet';
  const text = last.text || '…';
  if (last.direction === 'INBOUND') return text;
  if (!last.sentByUserId) return `Bot: ${text}`;
  return last.sentByUserId === currentUserId ? `You: ${text}` : `Agent: ${text}`;
}

function ConversationRow({
  conversation,
  selected,
  currentUserId,
  agentNames,
  onSelect,
}: {
  conversation: ConversationSummary;
  selected: boolean;
  currentUserId: string | null;
  agentNames: Map<string, string>;
  onSelect: () => void;
}) {
  const name =
    conversation.claimant?.fullName || conversation.claimant?.phoneNumber || 'Unknown';
  const assigneeName = conversation.assignedUserId
    ? conversation.assignedUserId === currentUserId
      ? 'you'
      : agentNames.get(conversation.assignedUserId)
    : undefined;
  const channelLabel = CHANNEL_LABELS[conversation.channel] ?? conversation.channel;
  const retains = CHANNEL_CAPABILITIES[conversation.channel]?.retainsPlaintext;
  const overdue =
    conversation.status === 'OPEN' &&
    conversation.handoverAt &&
    waitSeverity(conversation.handoverAt) === 'overdue';

  return (
    <button
      type="button"
      onClick={onSelect}
      // Announced as the current item, not merely drawn as one. The visual
      // cues below are invisible to a screen reader.
      aria-current={selected ? 'true' : undefined}
      className={cn(
        'relative w-full text-left px-3 py-3 border-b transition-colors',
        'hover:bg-muted/40',
        // Three cues, deliberately redundant: an accent bar (position), a
        // tint (colour) and a heavier title (typography). Two channels for
        // the same claimant can both read as their phone number, and the
        // highlight is then the only thing telling them apart.
        selected && 'bg-primary/10 hover:bg-primary/10'
      )}
    >
      {selected && <span aria-hidden className="absolute inset-y-0 left-0 w-1 bg-primary" />}

      <div className="flex items-start gap-2.5">
        <span
          aria-hidden
          className={cn(
            'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
            selected ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
          )}
        >
          {initialsOf(conversation.claimant?.fullName) ?? <User className="h-4 w-4" />}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className={cn('text-sm truncate', selected ? 'font-semibold' : 'font-medium')}>
              {name}
            </span>
            <span className="flex items-center gap-1.5 shrink-0">
              {/* How long a person has owed this. Only shown when one does —
                  a wait on a bot conversation is not a wait. */}
              {conversation.status === 'OPEN' && conversation.handoverAt && (
                <span
                  className={cn(
                    'text-[11px] font-medium rounded px-1',
                    overdue ? 'bg-destructive/10 text-destructive' : 'text-amber-700 dark:text-amber-500'
                  )}
                >
                  {waitedSince(conversation.handoverAt)}
                </span>
              )}
              {conversation.awaitingAgent > 0 && (
                <Badge variant="destructive" className="shrink-0 px-1.5">
                  {conversation.awaitingAgent}
                </Badge>
              )}
            </span>
          </div>

          <div className="text-xs text-muted-foreground truncate mt-0.5">
            {previewOf(conversation, currentUserId)}
          </div>

          <div className="flex items-center gap-1.5 mt-1.5 text-[11px] text-muted-foreground flex-wrap">
            <span
              className={cn('rounded px-1.5 py-0.5', STATUS_STYLE[conversation.status].className)}
            >
              {STATUS_STYLE[conversation.status].label}
            </span>
            <span className="inline-flex items-center gap-0.5">
              {channelLabel}
              {retains && (
                <span aria-hidden className="text-amber-600 dark:text-amber-500">
                  ⚠
                </span>
              )}
            </span>
            {conversation.case && <span className="truncate">{conversation.case.caseNumber}</span>}
            {/* Ownership, visibly. An unlabelled thread invites two agents in. */}
            {conversation.mode === 'HANDOVER' && (
              <span className="text-primary truncate">
                {assigneeName ? `with ${assigneeName}` : 'unassigned'}
              </span>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}
