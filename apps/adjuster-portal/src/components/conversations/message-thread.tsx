import { Fragment } from 'react';
import { UserCheck } from 'lucide-react';
import { describeCallbackValue } from '@tci/shared-types';

import { AttachmentThumbnail } from '@/components/conversations/attachment-thumbnail';
import { ConversationMessage } from '@/hooks/use-conversations';
import { cn } from '@/lib/utils';

import { SPEAKER_STYLE, dayLabel, speakerOf, timeOfDay } from './shared';

/**
 * The transcript, rendered for review rather than replay.
 *
 * Three structural choices serve the operator reading history at speed. Day
 * separators, because "when did the claimant last answer" is a question about
 * days, not scroll distance. Grouping — consecutive messages from one speaker
 * within five minutes share a single header — because a bot asking sixteen
 * questions must not cost sixteen headers of vertical space. And the take-over
 * marker inline at the moment it happened, because the transcript otherwise
 * shows an unexplained change of author exactly where an auditor will ask
 * "who was speaking here, and why".
 */

/** Same speaker, close together — the second message joins the first's group. */
const GROUP_WINDOW_MS = 5 * 60 * 1000;

interface MessageThreadProps {
  messages: ConversationMessage[];
  /** When an agent took the conversation over; null in bot mode. */
  handoverAt: string | null;
  handoverReason: string | null;
  onOpenAttachment: (attachment: NonNullable<ConversationMessage['attachment']>) => void;
}

export function MessageThread({
  messages,
  handoverAt,
  handoverReason,
  onOpenAttachment,
}: MessageThreadProps) {
  const handoverTime = handoverAt ? new Date(handoverAt).getTime() : null;

  // A take-over later than every message still has to appear: the transcript
  // otherwise just goes quiet, and "the bot stopped because someone stepped
  // in" is exactly the fact a reader scrolling to the end is looking for.
  const handoverAfterLastMessage =
    handoverTime !== null &&
    (messages.length === 0 ||
      new Date(messages[messages.length - 1].createdAt).getTime() < handoverTime);

  return (
    <div className="space-y-1.5">
      {messages.map((message, index) => {
        const previous = index > 0 ? messages[index - 1] : null;
        const newDay = !previous || dayLabel(previous.createdAt) !== dayLabel(message.createdAt);

        // The marker sits between the last message before the take-over and
        // the first after it — the position where the change of author it
        // explains is visible.
        const showHandoverMarker =
          handoverTime !== null &&
          new Date(message.createdAt).getTime() >= handoverTime &&
          (!previous || new Date(previous.createdAt).getTime() < handoverTime);

        const grouped =
          !newDay &&
          !showHandoverMarker &&
          previous !== null &&
          speakerOf(previous) === speakerOf(message) &&
          new Date(message.createdAt).getTime() - new Date(previous.createdAt).getTime() <
            GROUP_WINDOW_MS;

        return (
          <Fragment key={message.id}>
            {newDay && <DaySeparator label={dayLabel(message.createdAt)} />}
            {showHandoverMarker && <HandoverMarker reason={handoverReason} />}
            <MessageBubble
              message={message}
              grouped={grouped}
              onOpenAttachment={onOpenAttachment}
            />
          </Fragment>
        );
      })}
      {handoverAfterLastMessage && <HandoverMarker reason={handoverReason} />}
    </div>
  );
}

function DaySeparator({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 py-2" role="separator" aria-label={label}>
      <span className="h-px flex-1 bg-border" />
      <span className="text-[11px] font-medium text-muted-foreground">{label}</span>
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}

function HandoverMarker({ reason }: { reason: string | null }) {
  return (
    <div className="flex items-center gap-3 py-2">
      <span className="h-px flex-1 bg-primary/30" />
      <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-primary">
        <UserCheck className="h-3 w-3" />
        Agent took over{reason ? ` — ${reason}` : ''}
      </span>
      <span className="h-px flex-1 bg-primary/30" />
    </div>
  );
}

function MessageBubble({
  message,
  grouped,
  onOpenAttachment,
}: {
  message: ConversationMessage;
  grouped: boolean;
  onOpenAttachment: (attachment: NonNullable<ConversationMessage['attachment']>) => void;
}) {
  const speaker = speakerOf(message);
  const style = SPEAKER_STYLE[speaker];
  const Icon = style.icon;

  return (
    <div className={cn('flex', style.row)}>
      <div className="max-w-[75%] space-y-1">
        {!grouped && (
          <div
            className={cn(
              'flex items-center gap-1.5 text-[11px] text-muted-foreground pt-1.5',
              speaker === 'claimant' ? 'justify-start' : 'justify-end'
            )}
          >
            <Icon className="h-3 w-3" />
            <span>{style.label}</span>
            <span>·</span>
            <span>{timeOfDay(message.createdAt)}</span>
          </div>
        )}
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
