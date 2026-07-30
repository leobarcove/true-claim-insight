import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Clock, FileQuestion, Inbox, Mail, MessageSquare, Phone, Plus } from 'lucide-react';
import { format } from 'date-fns';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { SearchInput } from '@/components/ui/search-input';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { InfoTooltip } from '@/components/ui/tooltip';
import { TRAVEL_CLAIM_TYPE_LABELS } from '@tci/shared-types';
import { useCases } from '@/hooks/use-cases';
import { useDebounce } from '@/hooks/use-debounce';
import { PERMISSIONS, useHasPermission } from '@/lib/permissions';
import { cn } from '@/lib/utils';

export const caseStatusConfig: Record<
  string,
  { label: string; variant: 'default' | 'secondary' | 'success' | 'warning' | 'info' | 'destructive' }
> = {
  DRAFT: { label: 'Draft', variant: 'secondary' },
  IN_PROGRESS: { label: 'In Progress', variant: 'secondary' },
  SUBMITTED: { label: 'Submitted', variant: 'info' },
  UNDER_REVIEW: { label: 'Under Review', variant: 'warning' },
  INFO_REQUESTED: { label: 'Info Requested', variant: 'warning' },
  REFERRED_TO_EXPERT: { label: 'With Expert', variant: 'info' },
  CONVERTED: { label: 'Converted', variant: 'success' },
  REJECTED: { label: 'Rejected', variant: 'destructive' },
  ABANDONED: { label: 'Abandoned', variant: 'secondary' },
};

const channelIcons: Record<string, { icon: any; label: string }> = {
  WEB_CHAT: { icon: MessageSquare, label: 'Web chat' },
  STAFF: { icon: Phone, label: 'Staff capture' },
  EMAIL: { icon: Mail, label: 'Email FNOL' },
  WHATSAPP: { icon: MessageSquare, label: 'WhatsApp' },
};

const QUEUE_TABS = ['SUBMITTED', 'UNDER_REVIEW', 'INFO_REQUESTED', 'REFERRED_TO_EXPERT', 'CONVERTED', 'REJECTED'];

export function CasesListPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearch = useDebounce(searchQuery, 400);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const canCreate = useHasPermission(PERMISSIONS.CLAIMS_CREATE);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, statusFilter]);

  const { data, isLoading } = useCases({
    search: debouncedSearch || undefined,
    status: statusFilter || undefined,
    page,
    limit: 10,
  });

  const cases = data?.cases || [];
  const pagination = data?.pagination;
  const breakdown = data?.statusBreakdown || {};
  const total = Object.values(breakdown).reduce((sum, count) => sum + count, 0);

  return (
    <div className="flex flex-col h-full">
      <Header
        title="Cases"
        description="Travel claim requests awaiting vetting and conversion"
      >
        {canCreate && (
          <Link to="/cases/new">
            <Button className="shadow-primary/20 shadow-lg -mr-3 scale-75">
              <Plus className="h-4 w-4 mr-0 sm:mr-2" />
              New Case
            </Button>
          </Link>
        )}
        <SearchInput
          placeholder="Search case no, name, policy..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="w-[240px]"
        />
      </Header>

      <div className="flex-1 overflow-auto p-6 space-y-6">
        <div
          data-horizontal="true"
          className="flex items-center border-b border-border overflow-x-auto whitespace-nowrap custom-scrollbar"
        >
          <button
            onClick={() => setStatusFilter(null)}
            className={cn(
              'px-4 py-2 mx-1 font-medium text-sm transition-colors border-b-2',
              statusFilter === null
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            All ({total})
          </button>
          {QUEUE_TABS.map(status => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={cn(
                'px-4 py-2 mx-1 font-medium text-sm transition-colors border-b-2',
                statusFilter === status
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              )}
            >
              {caseStatusConfig[status].label} ({breakdown[status] || 0})
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, index) => (
              <Skeleton key={index} className="h-14 w-full" />
            ))}
          </div>
        ) : cases.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Inbox className="h-10 w-10 text-muted-foreground mb-3" />
            <p className="font-medium">No cases found</p>
            <p className="text-sm text-muted-foreground">
              Claim requests from the web intake, email inbox or staff capture will appear here.
            </p>
          </div>
        ) : (
          <div className="rounded-lg border border-border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Case</TableHead>
                  <TableHead>Claimant</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Channel</TableHead>
                  <TableHead>Policy</TableHead>
                  <TableHead>Documents</TableHead>
                  <TableHead>Flags</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cases.map(caseRow => {
                  const channel = channelIcons[String(caseRow.channel)] || channelIcons.WEB_CHAT;
                  const ChannelIcon = channel.icon;
                  const status = caseStatusConfig[String(caseRow.status)];
                  const completeness = caseRow.completeness;
                  return (
                    <TableRow key={caseRow.id} className="hover:bg-muted/40">
                      <TableCell>
                        <Link to={`/cases/${caseRow.id}`} className="font-medium text-primary hover:underline">
                          {caseRow.caseNumber}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          {caseRow.claimant?.fullName || 'Unknown'}
                          <div className="text-xs text-muted-foreground">
                            {caseRow.claimant?.phoneNumber}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">
                        {caseRow.travelClaimType
                          ? TRAVEL_CLAIM_TYPE_LABELS[
                              caseRow.travelClaimType as keyof typeof TRAVEL_CLAIM_TYPE_LABELS
                            ]
                          : '—'}
                      </TableCell>
                      <TableCell>
                        <InfoTooltip
                          content={channel.label}
                          direction="top"
                          fontSize="text-[11px]"
                          trigger={<ChannelIcon className="h-4 w-4 text-muted-foreground" />}
                        />
                      </TableCell>
                      <TableCell className="text-sm">
                        {caseRow.policy?.policyNumber || caseRow.policyNumberRaw || '—'}
                      </TableCell>
                      <TableCell>
                        {completeness ? (
                          <span
                            className={cn(
                              'text-sm font-medium',
                              completeness.percent === 100 ? 'text-emerald-600' : 'text-amber-600'
                            )}
                          >
                            {completeness.mandatoryUploaded}/{completeness.mandatoryTotal} docs
                          </span>
                        ) : (
                          '—'
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          {caseRow.outOfWindow ? (
                            <InfoTooltip
                              content="Reported more than 30 days after the incident"
                              direction="top"
                              fontSize="text-[11px]"
                              trigger={<AlertTriangle className="h-4 w-4 text-destructive" />}
                            />
                          ) : caseRow.notifiedLate ? (
                            <InfoTooltip
                              content="Reported more than 24 hours after the incident"
                              direction="top"
                              fontSize="text-[11px]"
                              trigger={<Clock className="h-4 w-4 text-amber-500" />}
                            />
                          ) : null}
                          {caseRow.needsPolicyReview && (
                            <InfoTooltip
                              content="Policy could not be matched automatically"
                              direction="top"
                              fontSize="text-[11px]"
                              trigger={<FileQuestion className="h-4 w-4 text-amber-500" />}
                            />
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {status && <Badge variant={status.variant}>{status.label}</Badge>}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {format(new Date(caseRow.createdAt), 'dd MMM yyyy')}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}

        {pagination && pagination.totalPages > 1 && (
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Page {pagination.page} of {pagination.totalPages} ({pagination.total} cases)
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage(current => current - 1)}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= pagination.totalPages}
                onClick={() => setPage(current => current + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
