import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ClipboardList,
  Clock,
  FileQuestion,
  Inbox,
  Mail,
  MessageCircle,
  MessageSquare,
  Phone,
  Plus,
  Send,
} from 'lucide-react';
import { format } from 'date-fns';
import { Header } from '@/components/layout/header';
import { getCategoryConfig } from '@/lib/category-config';
import { Button } from '@/components/ui/button';
import { SearchInput } from '@/components/ui/search-input';
import { Badge } from '@/components/ui/badge';
import { ListTabs } from '@/components/ui/list-tabs';
import { ListPagination } from '@/components/ui/list-pagination';
import { EmptyState } from '@/components/ui/empty-state';
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
import { useListParams, usePageClamp } from '@/hooks/use-list-params';
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

/**
 * One entry per CaseChannel. Keyed by the Prisma enum value, which is a
 * string-literal union rather than a TS enum, so this cannot be a
 * Record<CaseChannel, …> that would fail to compile when a channel is added.
 * `unknownChannel` below is the guard instead: a new channel shows as itself
 * rather than being silently mislabelled as web chat.
 */
const channelIcons: Record<string, { icon: any; label: string }> = {
  WEB_CHAT: { icon: MessageSquare, label: 'Web chat' },
  WEB_FORM: { icon: ClipboardList, label: 'Web form' },
  STAFF: { icon: Phone, label: 'Staff capture' },
  EMAIL: { icon: Mail, label: 'Email FNOL' },
  WHATSAPP: { icon: MessageCircle, label: 'WhatsApp' },
  TELEGRAM: { icon: Send, label: 'Telegram' },
  MESSENGER: { icon: MessageCircle, label: 'Messenger' },
};

/**
 * Fallback for a channel this screen does not know yet.
 *
 * Deliberately not `channelIcons.WEB_CHAT`, which is what this used to do: a
 * Telegram case would render as "Web chat", and an operator reading the queue
 * would have no way to tell. Showing the raw enum value is uglier and honest.
 */
const unknownChannel = (channel: string) => ({ icon: FileQuestion, label: channel });

const QUEUE_TABS = ['SUBMITTED', 'UNDER_REVIEW', 'INFO_REQUESTED', 'REFERRED_TO_EXPERT', 'CONVERTED', 'REJECTED'];

export function CasesListPage() {
  // Tab, search and page live in the URL — see useListParams for the rules.
  // The URL is therefore an input surface, which is why CaseQueryDto
  // validates these values instead of casting them.
  const {
    tab: statusFilter,
    setTab: setStatusFilter,
    search: searchQuery,
    setSearch: setSearchQuery,
    page,
    setPage,
  } = useListParams({ tabs: QUEUE_TABS, tabKey: 'status' });

  const debouncedSearch = useDebounce(searchQuery, 400);
  const canCreate = useHasPermission(PERMISSIONS.CLAIMS_CREATE);

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

  usePageClamp(page, pagination?.totalPages, setPage);

  return (
    <div className="flex flex-col h-full">
      <Header
        title="Cases"
        description="Notifications of loss awaiting vetting and conversion"
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
        <ListTabs
          tabs={[
            { value: null, label: 'All', count: total },
            ...QUEUE_TABS.map(status => ({
              value: status,
              label: caseStatusConfig[status].label,
              count: breakdown[status] || 0,
            })),
          ]}
          active={statusFilter}
          onChange={setStatusFilter}
        />

        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, index) => (
              <Skeleton key={index} className="h-14 w-full" />
            ))}
          </div>
        ) : cases.length === 0 ? (
          <EmptyState
            icon={Inbox}
            title="No cases found"
            description="Claim requests from the web intake, email inbox or staff capture will appear here."
          />
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
                  const channel =
                    channelIcons[String(caseRow.channel)] ?? unknownChannel(String(caseRow.channel));
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
                          {caseRow.claimant?.fullName || caseRow.statedClaimantName || 'Unknown'}
                          <div className="text-xs text-muted-foreground">
                            {caseRow.claimant?.phoneNumber}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">
                        {/* Travel carries a subtype; a fire or burglary case is
                            named by its line. Reading the travel field alone
                            left every property row blank. */}
                        {caseRow.travelClaimType
                          ? TRAVEL_CLAIM_TYPE_LABELS[
                              caseRow.travelClaimType as keyof typeof TRAVEL_CLAIM_TYPE_LABELS
                            ]
                          : getCategoryConfig(caseRow.category).label}
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

        {pagination && (
          <ListPagination
            page={page}
            totalPages={pagination.totalPages}
            total={pagination.total}
            noun="cases"
            onPageChange={setPage}
          />
        )}
      </div>
    </div>
  );
}
