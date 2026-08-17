import { Bot, StickyNote, User, UserCheck } from 'lucide-react';

import { ConversationMessage, ConversationStatus } from '@/hooks/use-conversations';

/**
 * Presentation vocabulary shared by the inbox's three panes.
 *
 * Pulled out of the page so the list, thread and context panel cannot drift
 * apart — a status that is amber in the list and red in the thread reads as
 * two different facts about one conversation.
 */

export const STATUS_STYLE: Record<ConversationStatus, { label: string; className: string }> = {
  BOT: { label: 'Bot', className: 'bg-muted text-muted-foreground' },
  OPEN: {
    label: 'Needs reply',
    className: 'bg-destructive/10 text-destructive border-destructive/30',
  },
  PENDING: {
    label: 'Waiting on claimant',
    className: 'bg-amber-500/10 text-amber-700 dark:text-amber-500',
  },
  SNOOZED: { label: 'Snoozed', className: 'bg-muted text-muted-foreground' },
  RESOLVED: {
    label: 'Resolved',
    className: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-500',
  },
};

/** "3h" / "2d" — how long somebody has been waiting, in the least words. */
export function waitedSince(iso: string): string {
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

/**
 * How loudly a wait should be displayed.
 *
 * Under an hour is a queue working normally; beyond it the claimant is being
 * ignored and the intake clock (which the take-over paused) is genuinely
 * running against the firm. One threshold, not a gradient: two levels of
 * urgency an operator can learn, rather than five shades they must interpret.
 * The hour is a starting point, not doctrine — revisit it against real queue
 * data once there is some.
 */
export function waitSeverity(iso: string): 'fresh' | 'overdue' {
  return Date.now() - new Date(iso).getTime() >= 60 * 60 * 1000 ? 'overdue' : 'fresh';
}

/** Who said it — the distinction the whole screen exists to make visible. */
export type Speaker = 'claimant' | 'bot' | 'agent' | 'note';

export const speakerOf = (message: ConversationMessage): Speaker => {
  // Checked first. A note is not a quieter message from the firm, it is a
  // message that was never sent, and rendering it anywhere near the outbound
  // styling invites somebody to read it as something the claimant saw.
  if (message.direction === 'INTERNAL') return 'note';
  if (message.direction === 'INBOUND') return 'claimant';
  return message.sentByUserId ? 'agent' : 'bot';
};

export const SPEAKER_STYLE: Record<
  Speaker,
  { bubble: string; row: string; icon: typeof User; label: string }
> = {
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
    bubble: 'bg-amber-500/10 text-foreground border border-dashed border-amber-500/50 italic',
    row: 'justify-center',
    icon: StickyNote,
    label: 'Internal note — not sent to the claimant',
  },
};

export const time = (iso: string) =>
  new Date(iso).toLocaleString('en-MY', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

export const timeOfDay = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-MY', { hour: '2-digit', minute: '2-digit' });

/** "Today" / "Yesterday" / "12 Aug 2026" — the day separators in a thread. */
export function dayLabel(iso: string): string {
  const date = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (sameDay(date, today)) return 'Today';
  if (sameDay(date, yesterday)) return 'Yesterday';
  return date.toLocaleDateString('en-MY', { day: '2-digit', month: 'short', year: 'numeric' });
}

/**
 * Initials for the claimant avatar: "Leo Boey" → "LB".
 *
 * Null when the value has no letters to take — a claimant known only by
 * "+60124791797" must not wear "+" as a monogram; the caller shows a person
 * icon instead, which honestly says "identity not yet collected".
 */
export function initialsOf(name: string | null | undefined): string | null {
  if (!name) return null;
  const parts = name
    .trim()
    .split(/\s+/)
    .map(part => part.replace(/[^\p{L}]/gu, ''))
    .filter(Boolean);
  if (parts.length === 0) return null;
  const first = parts[0][0];
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return `${first}${last}`.toUpperCase();
}
