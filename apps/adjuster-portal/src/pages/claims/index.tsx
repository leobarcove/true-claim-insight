import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Search,
  Video,
  FileText,
  PlusCircle,
  List,
  Grid,
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
} from 'lucide-react';
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
import { convertToTitleCase, formatDate } from '@/lib/utils';
import { useClaims, useClaimStats } from '@/hooks/use-claims';
import { useDebounce } from '@/hooks/use-debounce';

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

export function ClaimsListPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const searchFromUrl = searchParams.get('search') || '';
  const [searchQuery, setSearchQuery] = useState(searchFromUrl);
  const debouncedSearchQuery = useDebounce(searchQuery, 400);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);

  const [viewMode, setViewMode] = useState<'table' | 'card'>('table');
  const [page, setPage] = useState(1);
  const limit = 10;

  // Sync searchQuery with URL
  useEffect(() => {
    setSearchQuery(searchFromUrl);
  }, [searchFromUrl]);

  // Update URL when debounced search query changes
  useEffect(() => {
    const currentSearch = searchParams.get('search') || '';
    if (debouncedSearchQuery !== currentSearch) {
      if (debouncedSearchQuery) {
        setSearchParams({ ...Object.fromEntries(searchParams), search: debouncedSearchQuery });
      } else if (currentSearch) {
        const nextParams = Object.fromEntries(searchParams);
        delete nextParams.search;
        setSearchParams(nextParams);
      }
    }
  }, [debouncedSearchQuery, searchParams, setSearchParams]);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [debouncedSearchQuery, statusFilter]);

  const { data, isLoading } = useClaims({
    search: searchFromUrl,
    status: (statusFilter as any) || undefined,
    page,
    limit,
    sortBy: 'createdAt',
    sortOrder: 'desc',
  });

  const { data: statsData } = useClaimStats();

  const claims = data?.claims || [];
  const pagination = data?.pagination;

  const tabs = ['SCHEDULED', 'ASSIGNED', 'IN_ASSESSMENT', 'APPROVED'];

  return (
    <div className="flex flex-col h-full">
      <Header title="Claims" description="Manage and process your assigned claims">
        <Link to="/claims/new">
          <Button className="-mr-3 scale-75">
            <PlusCircle className="h-4 w-4 mr-2" />
            New
          </Button>
        </Link>
        <div className="flex items-center gap-2">
          <SearchInput
            placeholder="Search by ID or name..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-[280px]"
          />
        </div>
      </Header>

      <div className="flex-1 overflow-auto p-6 space-y-6">
        {/* Status Tabs and View Toggle */}
        <div className="flex items-center justify-between border-b border-border">
          <div className="flex gap-2">
            <button
              onClick={() => setStatusFilter(null)}
              className={`px-4 py-2 font-medium text-sm transition-colors border-b-2 ${
                statusFilter === null
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              All ({statsData?.totalClaims || 0})
            </button>
            {tabs.map(status => (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                className={`px-4 py-2 font-medium text-sm transition-colors border-b-2 ${
                  statusFilter === status
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                {statusConfig[status].label} ({statsData?.statusBreakdown?.[status] || 0})
              </button>
            ))}
          </div>

          {/* View Toggle */}
          <div className="flex items-center bg-muted/50 rounded-lg p-1 mb-1">
            <Button
              variant="ghost"
              size="icon"
              className={`h-7 w-7 rounded-md ${viewMode === 'table' ? 'bg-background shadow-sm' : ''}`}
              onClick={() => setViewMode('table')}
            >
              <List className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className={`h-7 w-7 rounded-md ${viewMode === 'card' ? 'bg-background shadow-sm' : ''}`}
              onClick={() => setViewMode('card')}
            >
              <Grid className="h-4 w-4" />
            </Button>
          </div>
        </div>

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
                  <TableBody>
                    {[...Array(3)].map((_, i) => (
                      <TableRow key={i} className="hover:bg-transparent">
                        <TableCell>
                          <Skeleton className="h-4 w-24" />
                        </TableCell>
                        <TableCell>
                          <Skeleton className="h-4 w-32" />
                        </TableCell>
                        <TableCell>
                          <Skeleton className="h-6 w-20 rounded-full" />
                        </TableCell>
                        <TableCell>
                          <Skeleton className="h-6 w-24 rounded-full" />
                        </TableCell>
                        <TableCell>
                          <Skeleton className="h-4 w-24" />
                        </TableCell>
                        <TableCell>
                          <Skeleton className="h-4 w-24" />
                        </TableCell>
                        <TableCell>
                          <Skeleton className="h-8 w-8 ml-auto" />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
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
            <div className="text-center py-12 text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="text-lg font-medium">No claims found</p>
              <p className="text-sm">Try adjusting your search or filters</p>
            </div>
          ) : viewMode === 'table' ? (
            /* Table View */
            <div className="rounded-md border animate-in fade-in duration-300">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[200px]">Claim Number</TableHead>
                    <TableHead>Claimant</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Incident Date</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-center">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {claims.map(claim => (
                    <TableRow
                      key={claim.id}
                      className="cursor-pointer hover:bg-accent/50"
                      onClick={() => (window.location.href = `/claims/${claim.id}`)}
                    >
                      <TableCell className="font-medium">{claim.claimNumber}</TableCell>
                      <TableCell>{claim.claimant?.fullName || claim.claimantId}</TableCell>
                      <TableCell>{typeLabels[claim.claimType] || claim.claimType}</TableCell>
                      <TableCell>
                        <Badge variant={statusConfig[claim.status]?.variant || 'secondary'}>
                          {convertToTitleCase(statusConfig[claim.status]?.label || claim.status)}
                        </Badge>
                      </TableCell>
                      <TableCell>{formatDate(claim.incidentDate)}</TableCell>
                      <TableCell>{formatDate(claim.createdAt)}</TableCell>
                      <TableCell className="text-center">
                        <div className="flex justify-center gap-2">
                          {claim.status === 'SCHEDULED' && (
                            <Button size="icon" variant="ghost" className="h-8 w-8 text-primary">
                              <Video className="h-4 w-4" />
                            </Button>
                          )}
                          <Button size="icon" variant="ghost" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            /* Card View */
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 animate-in fade-in duration-300">
              {claims.map(claim => (
                <Card
                  key={claim.id}
                  className="hover:shadow-md transition-shadow cursor-pointer"
                  onClick={() => (window.location.href = `/claims/${claim.id}`)}
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
                          <p className="font-medium">Claimant ID: {claim.claimantId}</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {typeLabels[claim.claimType] || claim.claimType}
                          </p>
                        </div>

                        <p className="text-sm text-muted-foreground line-clamp-2 min-h-[40px]">
                          {claim.description}
                        </p>

                        <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground pt-2 border-t">
                          <span>Incident: {formatDate(claim.incidentDate)}</span>
                          <span>Created: {formatDate(claim.createdAt)}</span>
                          {claim.scheduledAssessmentTime && (
                            <span className="col-span-2 text-primary font-medium">
                              Session: {formatDate(claim.scheduledAssessmentTime)}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Pagination */}
          {!isLoading && pagination && pagination.totalPages > 1 && (
            <div className="flex items-center justify-center gap-3 mb-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-xs text-muted-foreground">
                Page {page} of {pagination.totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(p => Math.min(pagination.totalPages, p + 1))}
                disabled={page >= pagination.totalPages}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
