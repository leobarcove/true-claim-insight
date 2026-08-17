import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FileText, Plus, Eye, Calendar, Clock } from 'lucide-react';
import { format } from 'date-fns';
import { claimTypeLabel } from '@/lib/claim-label';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { SearchInput } from '@/components/ui/search-input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
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
import { convertToTitleCase, formatDate, cn } from '@/lib/utils';
import { useClaims, useClaimStats } from '@/hooks/use-claims';
import { useDebounce } from '@/hooks/use-debounce';
import { useListParams, usePageClamp } from '@/hooks/use-list-params';
import { ListTabs } from '@/components/ui/list-tabs';
import { ListPagination } from '@/components/ui/list-pagination';
import { ViewToggle } from '@/components/ui/view-toggle';
import { useAuthStore } from '@/stores/auth-store';
import { PERMISSIONS, useHasPermission } from '@/lib/permissions';
import { useLayout } from '@/components/layout';

const statusConfig: Record<
  string,
  {
    label: string;
    variant: 'default' | 'secondary' | 'success' | 'warning' | 'info' | 'destructive';
  }
> = {
  SUBMITTED: { label: 'Submitted', variant: 'secondary' },
  DOCUMENTS_PENDING: { label: 'Docs Pending', variant: 'warning' },
  PENDING_ASSIGNMENT: { label: 'Pending Assignment', variant: 'info' },
  ASSIGNED: { label: 'Assigned', variant: 'info' },
  SCHEDULED: { label: 'Scheduled', variant: 'info' },
  IN_ASSESSMENT: { label: 'In Assessment', variant: 'warning' },
  REPORT_PENDING: { label: 'Report Pending', variant: 'warning' },
  UNDER_REVIEW: { label: 'Review', variant: 'info' },
  APPROVED: { label: 'Approved', variant: 'success' },
  REJECTED: { label: 'Rejected', variant: 'destructive' },
  ESCALATED_SIU: { label: 'Escalated to SIU', variant: 'destructive' },
  CLOSED: { label: 'Closed', variant: 'secondary' },
};

const typeLabels: Record<string, string> = {
  OWN_DAMAGE: 'Own Damage',
  THIRD_PARTY_PROPERTY: 'Third Party',
  THEFT: 'Theft',
  WINDSCREEN: 'Windscreen',
};

/**
 * What kind of claim this is, in one cell.
 *
 * `Claim.claimType` is a MOTOR field and is null for everything in scope, so
 * reading it alone rendered an em dash on every row — the known §8 defect,
 * which only became conspicuous at volume. The real subtype for travel lives
 * on the TravelClaim child; property lines have no subtype at all and are
 * named by their category.
 */
const CLAIM_QUEUE_TABS = ['SUBMITTED', 'SCHEDULED', 'APPROVED', 'REJECTED'];

export function ClaimsListPage() {
  const navigate = useNavigate();
  // Status, search, page and the mine/all toggle live in the URL — see
  // useListParams. Two instances on one URL: the second holds the ownership
  // toggle under `view`, and changing either tab drops the page, which also
  // fixes the old bug where switching to "My claims" kept you on page 4 of a
  // list that no longer had one.
  const {
    tab: statusFilter,
    setTab: setStatusFilter,
    search: searchQuery,
    setSearch: setSearchQuery,
    page,
    setPage,
  } = useListParams({ tabs: CLAIM_QUEUE_TABS, tabKey: 'status' });
  const { tab: viewTab, setTab: setViewTab } = useListParams({
    tabs: ['MY_CLAIMS'],
    tabKey: 'view',
  });
  const userFilter: 'ALL' | 'MY_CLAIMS' = viewTab === 'MY_CLAIMS' ? 'MY_CLAIMS' : 'ALL';
  const setUserFilter = (value: 'ALL' | 'MY_CLAIMS') =>
    setViewTab(value === 'MY_CLAIMS' ? 'MY_CLAIMS' : null);

  const debouncedSearchQuery = useDebounce(searchQuery, 400);
  const [viewMode, setViewMode] = useState<'table' | 'card'>('table');
  const limit = 10;

  const { isMobile, currentWidth } = useLayout();
  const { user } = useAuthStore();
  const canCreateClaim = useHasPermission(PERMISSIONS.CLAIMS_CREATE);

  const { data, isLoading } = useClaims({
    search: debouncedSearchQuery,
    status: (statusFilter as any) || undefined,
    page,
    limit,
    sortBy: 'createdAt',
    sortOrder: 'desc',
    createdById: userFilter === 'MY_CLAIMS' ? user?.id : undefined,
  });

  const { data: statsData } = useClaimStats({
    createdById: userFilter === 'MY_CLAIMS' ? user?.id : undefined,
  });

  const claims = data?.claims || [];
  const pagination = data?.pagination;
  usePageClamp(page, pagination?.totalPages, setPage);

  return (
    <div className="flex flex-col h-full">
      <Header title="Claims" description="Manage and process your assigned claims">
        {canCreateClaim && (
          <Link to="/claims/new">
            <Button className="shadow-primary/20 shadow-lg -mr-3 scale-75">
              <Plus className="h-4 w-4 mr-0 sm:mr-2" />
              {currentWidth > 430 ? 'New' : ''}
            </Button>
          </Link>
        )}
        <div className="flex items-center gap-2">
          <SearchInput
            placeholder={isMobile ? 'Search' : 'Search by ID or name...'}
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className={isMobile ? 'w-[120px]' : 'w-[280px]'}
          />
        </div>
      </Header>

      <div className="flex-1 overflow-auto p-6 space-y-6">
        {/* Status Tabs and View Toggle */}
        <ListTabs
          tabs={[
            { value: null, label: 'All', count: statsData?.totalClaims || 0 },
            ...CLAIM_QUEUE_TABS.map(status => ({
              value: status,
              label: statusConfig[status].label,
              count: statsData?.statusBreakdown?.[status] || 0,
            })),
          ]}
          active={statusFilter}
          onChange={setStatusFilter}
          end={
          <div className="flex items-center gap-2 mb-1">
            {/* User Filter */}
            <div className="relative flex items-center bg-muted/30 border border-border/80 rounded-full overflow-hidden shadow-sm">
              <div
                className={cn(
                  'absolute inset-y-1 transition-all duration-300 ease-out bg-primary/80 rounded-full z-0 shadow-sm',
                  userFilter === 'ALL' ? 'left-1 w-16' : 'left-[50%] ml-px w-16'
                )}
              />
              <InfoTooltip
                content="Show all claims"
                direction="top"
                fontSize="text-[11px]"
                trigger={
                  <button
                    onClick={() => setUserFilter('ALL')}
                    className={cn(
                      'relative z-10 w-16 py-1 text-[10px] font-medium transition-colors duration-300 text-center ml-1',
                      userFilter === 'ALL'
                        ? 'text-primary-foreground'
                        : 'text-muted-foreground hover:text-primary'
                    )}
                  >
                    All
                  </button>
                }
              />
              <InfoTooltip
                content="Show only your claims"
                contentClassName="w-[8.5rem]"
                direction="top"
                fontSize="text-[11px]"
                trigger={
                  <button
                    onClick={() => setUserFilter('MY_CLAIMS')}
                    className={cn(
                      'relative z-10 w-16 py-1 text-[10px] font-medium transition-colors duration-300 text-center',
                      userFilter === 'MY_CLAIMS'
                        ? 'text-primary-foreground'
                        : 'text-muted-foreground hover:text-primary'
                    )}
                  >
                    My Claims
                  </button>
                }
              />
            </div>

            <ViewToggle value={viewMode} onChange={setViewMode} />
          </div>
          }
        />

        {/* Claims List */}
        <div className="space-y-4 transition-all duration-300">
          {isLoading ? (
            viewMode === 'table' ? (
              <div className="rounded-md border animate-in fade-in duration-300">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead colSpan={7}>
                        <Skeleton className="h-4 w-full" />
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className="bg-card">
                    {[...Array(3)].map((_, i) => (
                      <TableRow key={i} className="hover:bg-transparent">
                        <TableCell>
                          <Skeleton className="h-4 w-24" />
                        </TableCell>
                        <TableCell>
                          <Skeleton className="h-4 w-32" />
                        </TableCell>
                        <TableCell className="text-center">
                          <Skeleton className="h-4 w-24 mx-auto" />
                        </TableCell>
                        <TableCell className="text-center">
                          <Skeleton className="h-6 w-20 rounded-full mx-auto" />
                        </TableCell>
                        <TableCell className="text-center">
                          <Skeleton className="h-4 w-24 mx-auto" />
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="space-y-1 flex flex-col items-center">
                            <Skeleton className="h-3 w-24" />
                            <Skeleton className="h-3 w-16" />
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          <Skeleton className="h-8 w-8 mx-auto" />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 animate-in fade-in duration-300">
                {[...Array(3)].map((_, i) => (
                  <Card key={i}>
                    <CardContent className="p-6 space-y-4">
                      <div className="flex justify-between">
                        <Skeleton className="h-5 w-24" />
                        <Skeleton className="h-6 w-20 rounded-full" />
                      </div>
                      <div className="space-y-2">
                        <Skeleton className="h-4 w-32" />
                        <Skeleton className="h-3 w-20" />
                      </div>
                      <Skeleton className="h-10 w-full" />
                      <div className="flex justify-between pt-2">
                        <Skeleton className="h-3 w-24" />
                        <Skeleton className="h-3 w-24" />
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )
          ) : claims.length === 0 ? (
            <div className="bg-card rounded-xl border shadow-sm p-12 text-center">
              <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-50" />
              <h3 className="text-lg font-semibold text-foreground mb-2">No claims found</h3>
              <p className="text-muted-foreground">
                {searchQuery || statusFilter
                  ? 'Try adjusting your search or filters'
                  : 'No claims available yet.'}
              </p>
            </div>
          ) : viewMode === 'table' ? (
            /* Table View */
            <div className="rounded-md border animate-in fade-in duration-300">
              <div
                data-horizontal="true"
                className="bg-card rounded-xl border shadow-sm overflow-x-auto animate-in fade-in duration-300 custom-scrollbar"
              >
                <table className="w-full text-sm text-left">
                  <thead className="bg-muted/50 border-b">
                    <tr className="hover:bg-transparent">
                      <th className="px-6 py-4 font-medium text-muted-foreground w-[200px]">
                        Claim Number
                      </th>
                      <th className="px-6 py-4 font-medium text-muted-foreground">Claimant</th>
                      <th className="px-6 py-4 font-medium text-muted-foreground text-center">
                        Type
                      </th>
                      <th className="px-6 py-4 font-medium text-muted-foreground text-center">
                        Status
                      </th>
                      <th className="px-6 py-4 font-medium text-muted-foreground text-center">
                        Incident Date
                      </th>
                      <th className="px-6 py-4 font-medium text-muted-foreground text-center">
                        Created
                      </th>
                      <th className="px-6 py-4 font-medium text-muted-foreground text-center">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {claims.map(claim => (
                      <tr key={claim.id} className="hover:bg-muted/50 transition-colors">
                        <td className="px-6 py-4 font-medium">{claim.claimNumber}</td>
                        <td className="px-6 py-4">
                          {claim.claimant?.fullName || claim.claimantId}
                        </td>
                        <td className="px-6 py-4 text-center">
                          {claimTypeLabel(claim)}
                        </td>
                        <td className="px-6 py-4 text-center">
                          <Badge variant={statusConfig[claim.status]?.variant || 'secondary'}>
                            {convertToTitleCase(statusConfig[claim.status]?.label || claim.status)}
                          </Badge>
                        </td>
                        <td className="px-6 py-4 text-center">{formatDate(claim.incidentDate)}</td>
                        <td className="px-6 py-4 text-center">
                          <div className="flex flex-col text-xs">
                            <span>{format(new Date(claim.createdAt), 'MMM dd, yyyy')}</span>
                            <span className="text-[11px] text-muted-foreground">
                              {format(new Date(claim.createdAt), 'hh:mm a')}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <div className="flex justify-center">
                            <InfoTooltip
                              content="View"
                              direction="top"
                              fontSize="text-[11px]"
                              trigger={
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-8 w-8"
                                  onClick={e => {
                                    e.stopPropagation();
                                    navigate(`/claims/${claim.id}`);
                                  }}
                                >
                                  <Eye className="h-4 w-4" />
                                </Button>
                              }
                            />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            /* Card View */
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 animate-in fade-in duration-300">
              {claims.map(claim => (
                <Card
                  key={claim.id}
                  className="hover:shadow-md transition-shadow cursor-pointer"
                  onClick={() => navigate(`/claims/${claim.id}`)}
                >
                  <CardContent className="p-6">
                    <div className="flex items-start justify-between">
                      <div className="space-y-3 w-full">
                        <div className="flex items-center justify-between">
                          <span className="font-mono font-semibold text-primary">
                            {claim.claimNumber}
                          </span>
                          <Badge variant={statusConfig[claim.status]?.variant || 'secondary'}>
                            {statusConfig[claim.status]?.label || claim.status}
                          </Badge>
                        </div>

                        <div>
                          <p className="font-medium">{claim.claimant?.fullName}</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            <Badge variant="secondary" className="text-[10px]">
                              {claimTypeLabel(claim)}
                            </Badge>
                          </p>
                        </div>

                        <p className="text-sm text-muted-foreground line-clamp-2 min-h-[40px]">
                          {claim.description}
                        </p>

                        <div className="pt-2 border-t space-y-1.5">
                          <div className="flex justify-between gap-1.5 py-1">
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <Calendar className="h-3 w-3 text-primary/60" />
                              <span>Incident: {formatDate(claim.incidentDate)}</span>
                            </div>
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <Clock className="h-3 w-3 text-primary/60" />
                                <div className="flex flex-col mt-3">
                                  <span>
                                    Created: {format(new Date(claim.createdAt), 'MMM dd, yyyy')}
                                  </span>
                                  <span className="text-[11px] opacity-70">
                                    {format(new Date(claim.createdAt), 'hh:mm a')}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Pagination */}
          {!isLoading && pagination && (
            <ListPagination
              page={page}
              totalPages={pagination.totalPages}
              total={pagination.total}
              noun="claims"
              onPageChange={setPage}
            />
          )}
        </div>
      </div>
    </div>
  );
}
