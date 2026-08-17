import { Link } from 'react-router-dom';
import { AlertTriangle, Inbox, Loader2, MailX, RefreshCw } from 'lucide-react';

import { Header } from '@/components/layout/header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { useListParams } from '@/hooks/use-list-params';
import {
  InboundMessage,
  InboundMessageStatus,
  useIgnoreMessage,
  useInboundMessages,
  useRetryMessage,
} from '@/hooks/use-ingestion';

/**
 * The FNOL inbound queue.
 *
 * Exists because an email the system could not understand is not a non-event:
 * a claimant or agent who emailed believes they have notified the firm, and
 * until this screen there was no way for anyone to see that they had. That is
 * why NEEDS_REVIEW and FAILED lead the filter order rather than sitting behind
 * a default "all" view.
 */

const FILTERS: { value: InboundMessageStatus | 'ALL'; label: string; urgent?: boolean }[] = [
  { value: 'NEEDS_REVIEW', label: 'Needs review', urgent: true },
  { value: 'FAILED', label: 'Failed', urgent: true },
  { value: 'PROCESSED', label: 'Processed' },
  { value: 'IGNORED', label: 'Ignored' },
  { value: 'ALL', label: 'All' },
];

const STATUS_STYLE: Record<InboundMessageStatus, string> = {
  NEEDS_REVIEW: 'border-amber-500 text-amber-600',
  FAILED: 'border-destructive text-destructive',
  PROCESSED: 'border-primary text-primary',
  IGNORED: 'border-muted-foreground text-muted-foreground',
  PENDING: 'border-muted-foreground text-muted-foreground',
};

export function IntakeQueuePage() {
  // The filter lives in the URL — see useListParams. An absent param is the
  // page's true default, NEEDS_REVIEW: the queue opens on what is owed.
  const { tab, setTab } = useListParams({
    tabs: FILTERS.map(option => option.value),
    tabKey: 'status',
  });
  const filter = (tab as InboundMessageStatus | 'ALL' | null) ?? 'NEEDS_REVIEW';
  const setFilter = (value: InboundMessageStatus | 'ALL') =>
    setTab(value === 'NEEDS_REVIEW' ? null : value);
  const { data: messages, isLoading, refetch, isFetching } = useInboundMessages(
    filter === 'ALL' ? undefined : filter
  );

  return (
    <div className="flex h-full flex-col bg-background/50">
      <Header
        title="FNOL intake"
        description="Emails received at the claims mailbox, and what became of them"
      />

      <div className="flex-1 space-y-4 overflow-auto p-6">
        <div className="flex flex-wrap items-center gap-2">
          {FILTERS.map(option => (
            <Button
              key={option.value}
              size="sm"
              variant={filter === option.value ? 'default' : 'outline'}
              onClick={() => setFilter(option.value)}
            >
              {option.urgent && <AlertTriangle className="mr-1.5 h-3.5 w-3.5" />}
              {option.label}
            </Button>
          ))}
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}

        {!isLoading && (!messages || messages.length === 0) && (
          <Card>
            <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
              <Inbox className="h-8 w-8 text-muted-foreground" />
              <p className="font-medium">Nothing here</p>
              <p className="max-w-sm text-sm text-muted-foreground">
                {filter === 'NEEDS_REVIEW'
                  ? 'No emails are waiting on an operator. Anything the parser could not resolve appears here.'
                  : 'No messages with this status.'}
              </p>
            </CardContent>
          </Card>
        )}

        <div className="space-y-3">
          {messages?.map(message => (
            <MessageRow key={message.id} message={message} />
          ))}
        </div>
      </div>
    </div>
  );
}

function MessageRow({ message }: { message: InboundMessage }) {
  const retry = useRetryMessage();
  const ignore = useIgnoreMessage();
  const { toast } = useToast();

  const act = async (action: 'retry' | 'ignore') => {
    const mutation = action === 'retry' ? retry : ignore;
    try {
      await mutation.mutateAsync(message.id);
      toast({
        title: action === 'retry' ? 'Re-read from the mailbox' : 'Message dismissed',
      });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: action === 'retry' ? 'Could not retry' : 'Could not dismiss',
        // The server explains why — the email may no longer be on the server,
        // or the message may already have become a case.
        description:
          error?.response?.data?.error?.message ?? error?.message ?? 'The action was refused.',
      });
    }
  };

  const actionable = message.status === 'NEEDS_REVIEW' || message.status === 'FAILED';

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <p className="truncate font-medium">{message.subject || '(no subject)'}</p>
            <p className="truncate text-sm text-muted-foreground">
              {message.fromAddress} · {new Date(message.receivedAt).toLocaleString('en-GB')}
            </p>
          </div>
          <Badge variant="outline" className={STATUS_STYLE[message.status]}>
            {message.status.replace(/_/g, ' ').toLowerCase()}
          </Badge>
        </div>

        {message.error && (
          <p className="rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-sm text-amber-700 dark:text-amber-500">
            {message.error}
          </p>
        )}

        {message.parsed && Object.keys(message.parsed).length > 0 && (
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
            {message.parsed.policyNumber && <span>Policy {message.parsed.policyNumber}</span>}
            {message.parsed.travelClaimType && (
              <span>{message.parsed.travelClaimType.replace(/_/g, ' ').toLowerCase()}</span>
            )}
            {message.parsed.incidentDate && (
              <span>
                Incident {new Date(message.parsed.incidentDate).toLocaleDateString('en-GB')}
              </span>
            )}
            {message.parsed.flightNumber && <span>Flight {message.parsed.flightNumber}</span>}
            {message.parsed.destination && <span>To {message.parsed.destination}</span>}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          {message.case && (
            <Button asChild size="sm" variant="outline">
              <Link to={`/cases/${message.caseId}`}>Open {message.case.caseNumber}</Link>
            </Button>
          )}

          {actionable && (
            <>
              <Button size="sm" onClick={() => act('retry')} disabled={retry.isPending}>
                {retry.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                Retry
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => act('ignore')}
                disabled={ignore.isPending}
              >
                <MailX className="mr-1.5 h-3.5 w-3.5" />
                Not an FNOL
              </Button>
            </>
          )}

          {message.attempts > 0 && (
            <span className="ml-auto font-mono text-xs text-muted-foreground">
              {message.attempts} attempt{message.attempts === 1 ? '' : 's'}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
