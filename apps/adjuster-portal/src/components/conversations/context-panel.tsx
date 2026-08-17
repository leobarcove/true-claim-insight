import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ExternalLink, FileText, Phone, User } from 'lucide-react';
import { CHANNEL_CAPABILITIES, CHANNEL_LABELS } from '@tci/shared-types';

import { AttachmentThumbnail } from '@/components/conversations/attachment-thumbnail';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/native-select';
import {
  AssignableAgent,
  ConversationMessage,
  ConversationTranscript,
} from '@/hooks/use-conversations';

import { SNOOZE_OPTIONS } from './snooze-options';
import { STATUS_STYLE, initialsOf, time } from './shared';

/**
 * The right pane: everything about the claim an agent needs while replying.
 *
 * Its reason to exist is a finding every inbox study repeats — an agent who
 * must open another tab to see what was being claimed answers the wrong
 * question. So the panel holds the claimant, the case, how far the bot's
 * intake actually got, and every document the conversation has collected,
 * beside the thread rather than a navigation away.
 *
 * The management controls (assign, snooze, hand back) live here too, not in
 * the thread header: they are decisions about the conversation, made a few
 * times an hour, and belong with the context they are decided on — while the
 * header keeps only what identifies the thread at a glance.
 */

interface ContextPanelProps {
  thread: ConversationTranscript;
  agents: AssignableAgent[] | undefined;
  currentUserId: string | null;
  canManage: boolean;
  assignPending: boolean;
  snoozePending: boolean;
  onAssign: (assigneeId: string | null) => void;
  onSnooze: (hours: number) => void;
  onResolve: () => void;
  onOpenAttachment: (attachment: NonNullable<ConversationMessage['attachment']>) => void;
}

/**
 * The bot numbers its own questions — "(3 of 16) …" — so the transcript
 * already carries the intake's progress. Parsed from the latest bot message
 * that has one, rendered as a bar, silently absent when no message matches.
 * Derived presentation only: nothing downstream may depend on it, because the
 * wording belongs to the flow definition, not to any API contract.
 */
function intakeProgressOf(messages: ConversationMessage[]): { step: number; total: number } | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message.direction !== 'OUTBOUND' || message.sentByUserId) continue;
    const match = message.text?.match(/^\((\d+) of (\d+)\)/);
    if (match) {
      const step = Number(match[1]);
      const total = Number(match[2]);
      if (total > 0 && step <= total) return { step, total };
    }
  }
  return null;
}

export function ContextPanel({
  thread,
  agents,
  currentUserId,
  canManage,
  assignPending,
  snoozePending,
  onAssign,
  onSnooze,
  onResolve,
  onOpenAttachment,
}: ContextPanelProps) {
  const attachments = useMemo(
    () =>
      thread.messages
        .map(message => message.attachment)
        .filter((attachment): attachment is NonNullable<typeof attachment> => attachment !== null),
    [thread.messages]
  );
  const progress = useMemo(() => intakeProgressOf(thread.messages), [thread.messages]);

  const channelLabel = CHANNEL_LABELS[thread.channel] ?? thread.channel;
  const retains = CHANNEL_CAPABILITIES[thread.channel]?.retainsPlaintext;
  const inHandover = thread.mode === 'HANDOVER';

  return (
    <div className="h-full overflow-y-auto">
      {/* Claimant */}
      <section className="p-4 border-b">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-sm font-semibold">
            {initialsOf(thread.claimant?.fullName) ?? <User className="h-5 w-5" />}
          </span>
          <div className="min-w-0">
            {/* The same identity the list and thread header use — a claimant
                known only by number is their number here too, not a different
                "Unknown" person one pane over. */}
            <div className="font-medium truncate">
              {thread.claimant?.fullName || thread.claimant?.phoneNumber || 'Unknown claimant'}
            </div>
            {thread.claimant?.fullName && thread.claimant.phoneNumber && (
              <div className="text-xs text-muted-foreground flex items-center gap-1">
                <Phone className="h-3 w-3" />
                {thread.claimant.phoneNumber}
              </div>
            )}
          </div>
        </div>
      </section>

      {/*
       * The domain calls this a Case: the pre-claim intake funnel the
       * conversation is filling. It was briefly headed "Claim", and an
       * operator who clicked the CSE-number expecting the claim screen landed
       * on the case screen and reasonably reported a broken link. The heading
       * uses the claimant-facing term with the domain word beside it, and the
       * Claim — the regulated engagement — appears as its own entry the
       * moment conversion creates it.
       */}
      <section className="p-4 border-b space-y-2">
        <PanelHeading>Claim request (case)</PanelHeading>
        {thread.case ? (
          <>
            <Link
              to={`/cases/${thread.case.id}`}
              className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline font-medium"
            >
              {thread.case.caseNumber}
              <ExternalLink className="h-3 w-3" />
            </Link>
            <dl className="text-xs space-y-1">
              <FactRow label="Status" value={thread.case.status} />
              {thread.case.travelClaimType && (
                <FactRow label="Type" value={thread.case.travelClaimType.replace(/_/g, ' ')} />
              )}
              {thread.case.convertedClaim && (
                <FactRow
                  label="Claim"
                  value={
                    <Link
                      to={`/claims/${thread.case.convertedClaim.id}`}
                      className="inline-flex items-center gap-1 text-primary hover:underline"
                    >
                      {thread.case.convertedClaim.claimNumber}
                      <ExternalLink className="h-3 w-3" />
                    </Link>
                  }
                />
              )}
            </dl>
            {progress && (
              <div className="space-y-1 pt-1">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Intake progress</span>
                  <span>
                    {progress.step} of {progress.total}
                  </span>
                </div>
                <div
                  className="h-1.5 rounded-full bg-muted overflow-hidden"
                  role="progressbar"
                  aria-valuenow={progress.step}
                  aria-valuemin={0}
                  aria-valuemax={progress.total}
                  aria-label="Intake progress"
                >
                  <div
                    className="h-full bg-primary transition-all"
                    style={{ width: `${(progress.step / progress.total) * 100}%` }}
                  />
                </div>
              </div>
            )}
          </>
        ) : (
          <p className="text-xs text-muted-foreground">
            No case yet — one is opened when the intake reaches the claim details.
          </p>
        )}
      </section>

      {/* Conversation */}
      <section className="p-4 border-b space-y-2">
        <PanelHeading>Conversation</PanelHeading>
        <dl className="text-xs space-y-1">
          <FactRow
            label="Status"
            value={
              <Badge variant="outline" className={STATUS_STYLE[thread.status].className}>
                {STATUS_STYLE[thread.status].label}
              </Badge>
            }
          />
          <FactRow label="Channel" value={channelLabel} />
          {thread.messages.length > 0 && (
            <FactRow label="Started" value={time(thread.messages[0].createdAt)} />
          )}
          <FactRow
            label="First reply"
            value={thread.firstRespondedAt ? time(thread.firstRespondedAt) : 'No human reply yet'}
          />
          {thread.handoverAt && <FactRow label="Taken over" value={time(thread.handoverAt)} />}
          {thread.snoozedUntil && (
            <FactRow label="Snoozed until" value={time(thread.snoozedUntil)} />
          )}
          {thread.resolvedAt && <FactRow label="Resolved" value={time(thread.resolvedAt)} />}
        </dl>
        {thread.handoverReason && (
          <p className="text-xs border-l-2 border-primary/30 pl-2">
            <span className="text-muted-foreground">Take-over reason — </span>
            {thread.handoverReason}
          </p>
        )}
        {/* Not decoration. The claimant's copy of this thread lives in a third
            party's message history — offshore, outside our retention sweep, and
            beyond anything we can delete. Said in full here, where an agent
            decides what to type, rather than only as a ⚠ in the header. */}
        {retains && (
          <p className="text-xs rounded-md bg-amber-500/10 text-amber-800 dark:text-amber-300 p-2">
            {channelLabel} keeps a copy of this conversation on its own servers. Avoid sending
            anything that should not persist there.
          </p>
        )}
      </section>

      {/* Documents the conversation has collected */}
      <section className="p-4 border-b space-y-2">
        <PanelHeading>
          Evidence collected{attachments.length > 0 ? ` (${attachments.length})` : ''}
        </PanelHeading>
        {attachments.length === 0 ? (
          <p className="text-xs text-muted-foreground flex items-center gap-1.5">
            <FileText className="h-3.5 w-3.5" />
            Nothing collected in this conversation yet.
          </p>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {attachments.map(attachment => (
              <AttachmentThumbnail
                key={attachment.id}
                attachment={attachment}
                variant="tile"
                onOpen={() => onOpenAttachment(attachment)}
              />
            ))}
          </div>
        )}
      </section>

      {/* Management — only meaningful once a person holds the conversation. */}
      {inHandover && (
        <section className="p-4 space-y-3">
          <PanelHeading>Manage</PanelHeading>

          <label className="block text-xs space-y-1">
            <span className="text-muted-foreground">Assigned to</span>
            <NativeSelect
              className="w-full"
              value={thread.assignedUserId ?? ''}
              disabled={!canManage || assignPending}
              title={
                canManage
                  ? undefined
                  : 'Another agent has this conversation. A firm admin can move it.'
              }
              onChange={event => onAssign(event.target.value || null)}
            >
              <option value="">Unassigned</option>
              {agents?.map(agent => (
                <option key={agent.id} value={agent.id}>
                  {agent.fullName}
                  {agent.id === currentUserId ? ' (you)' : ''}
                </option>
              ))}
            </NativeSelect>
          </label>

          <label className="block text-xs space-y-1">
            <span className="text-muted-foreground">Snooze</span>
            <NativeSelect
              className="w-full"
              value=""
              disabled={!canManage || snoozePending}
              onChange={event => {
                const hours = Number(event.target.value);
                if (hours) onSnooze(hours);
              }}
            >
              <option value="">Not snoozed</option>
              {SNOOZE_OPTIONS.map(option => (
                <option key={option.hours} value={option.hours}>
                  {option.label}
                </option>
              ))}
            </NativeSelect>
          </label>

          <Button
            size="sm"
            variant="outline"
            className="w-full"
            onClick={onResolve}
            disabled={!canManage}
          >
            Hand back to bot
          </Button>
          <p className="text-[11px] text-muted-foreground">
            Handing back resumes the intake at the step the claim is on.
          </p>
        </section>
      )}
    </div>
  );
}

function PanelHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
      {children}
    </h3>
  );
}

function FactRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="text-muted-foreground shrink-0">{label}</dt>
      <dd className="text-right truncate">{value}</dd>
    </div>
  );
}
