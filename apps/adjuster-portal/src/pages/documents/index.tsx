import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, Eye, List, Grid, ChevronLeft, ChevronRight } from 'lucide-react';
import { Header } from '@/components/layout/header';
import { Button, Badge, Skeleton } from '@/components/ui';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { SearchInput } from '@/components/ui/search-input';
import { InfoTooltip } from '@/components/ui/tooltip';
import { format } from 'date-fns';
import { useClaims } from '@/hooks/use-claims';
import { useDebounce } from '@/hooks/use-debounce';

export function DocumentsListPage() {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearch = useDebounce(searchTerm, 500);
  const [viewMode, setViewMode] = useState<'table' | 'card'>('table');
  const [page, setPage] = useState(1);
  const limit = 10;

  const { data: response, isLoading } = useClaims({
    search: debouncedSearch,
    page,
    limit,
  });

  const claims = response?.claims || [];
  const pagination = response?.pagination;

  return (
    <div className="flex flex-col h-full bg-background">
      <Header title="Documents" description="Review Trinity Cross-Checks and Document Validity.">
        <div className="flex items-center gap-2">
          <SearchInput
            placeholder="Search Claims or NRIC..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-[280px]"
          />
        </div>
      </Header>

      <div className="flex-1 overflow-auto p-6 space-y-6">
        {/* Filter Tab */}
        <div className="flex items-center justify-between border-b border-border">
          <div className="flex gap-2">
            <button className="px-4 py-2 font-medium text-sm transition-colors border-b-2 border-primary text-primary">
              All ({response?.pagination?.total || 0})
            </button>
          </div>

          {/* View Toggle */}
          <div className="flex items-center bg-muted/50 rounded-lg p-1 mb-1">
            <InfoTooltip
              content="List"
              direction="top"
              fontSize="text-[11px]"
              trigger={
                <Button
                  variant="ghost"
                  size="icon"
                  className={`h-7 w-7 rounded-md ${viewMode === 'table' ? 'bg-background shadow-sm' : ''}`}
                  onClick={() => setViewMode('table')}
                >
                  <List className="h-4 w-4" />
                </Button>
              }
            />
            <InfoTooltip
              content="Grid"
              direction="top"
              fontSize="text-[11px]"
              trigger={
                <Button
                  variant="ghost"
                  size="icon"
                  className={`h-7 w-7 rounded-md ${viewMode === 'card' ? 'bg-background shadow-sm' : ''}`}
                  onClick={() => setViewMode('card')}
                >
                  <Grid className="h-4 w-4" />
                </Button>
              }
            />
          </div>
        </div>

        {/* Documents List */}
        <div className="transition-all duration-300">
          {isLoading ? (
            viewMode === 'table' ? (
              <div className="rounded-md border animate-in fade-in duration-300">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead colSpan={8}>
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
                        <TableCell>
                          <Skeleton className="h-4 w-24" />
                        </TableCell>
                        <TableCell>
                          <Skeleton className="h-4 w-16" />
                        </TableCell>
                        <TableCell>
                          <Skeleton className="h-5 w-16 rounded-full" />
                        </TableCell>
                        <TableCell>
                          <Skeleton className="h-4 w-16" />
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            <Skeleton className="h-3 w-24" />
                            <Skeleton className="h-3 w-16" />
                          </div>
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
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 animate-in fade-in duration-300">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="bg-card rounded-xl border shadow-sm p-6">
                    <Skeleton className="h-40 w-full mb-4" />
                    <Skeleton className="h-4 w-3/4 mb-2" />
                    <Skeleton className="h-4 w-1/2" />
                  </div>
                ))}
              </div>
            )
          ) : claims.length === 0 ? (
            <div className="bg-card rounded-xl border shadow-sm p-12 text-center">
              <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-50" />
              <h3 className="text-lg font-semibold text-foreground mb-2">No documents found</h3>
              <p className="text-muted-foreground">
                {searchTerm ? 'Try adjusting your search criteria' : 'No documents available yet.'}
              </p>
            </div>
          ) : viewMode === 'table' ? (
            /* Table View */
            <div className="bg-card rounded-xl border shadow-sm overflow-hidden animate-in fade-in duration-300">
              <table className="w-full text-sm text-left">
                <thead className="bg-muted/50 border-b">
                  <tr className="hover:bg-transparent">
                    <th className="px-6 py-4 font-medium text-muted-foreground w-[200px]">
                      Claim ID
                    </th>
                    <th className="px-6 py-4 font-medium text-muted-foreground">Claimant</th>
                    <th className="px-6 py-4 font-medium text-muted-foreground">Policy Number</th>
                    <th className="px-6 py-4 font-medium text-muted-foreground">Documents</th>
                    <th className="px-6 py-4 font-medium text-muted-foreground">Risk Level</th>
                    <th className="px-6 py-4 font-medium text-muted-foreground text-center">
                      Trinity Score
                    </th>
                    <th className="px-6 py-4 font-medium text-muted-foreground text-center">
                      Created
                    </th>
                    <th className="px-6 py-4 font-medium text-muted-foreground text-center">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {claims.map(item => (
                    <tr key={item.id} className="hover:bg-muted/50 transition-colors">
                      <td className="px-6 py-4 font-medium">{item.claimNumber}</td>
                      <td className="px-6 py-4">
                        <span className="text-foreground">{item.claimant?.fullName || 'N/A'}</span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-foreground text-sm">{item.policyNumber}</span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <FileText className="h-4 w-4" />
                          {item.documents?.length || 0} Files
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <Badge
                          variant={
                            item.priority === 'LOW'
                              ? 'success'
                              : item.priority === 'HIGH' || item.priority === 'URGENT'
                                ? 'destructive'
                                : 'warning'
                          }
                        >
                          {item.priority}
                        </Badge>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-center gap-2">
                          <span className="text-muted-foreground text-sm">-</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <div className="flex flex-col text-xs">
                          <span>{format(new Date(item.createdAt), 'MMM dd, yyyy')}</span>
                          <span className="text-[11px] text-muted-foreground">
                            {format(new Date(item.createdAt), 'hh:mm a')}
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
                                  navigate(`/documents/${item.id}`);
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
          ) : (
            /* Card View */
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 animate-in fade-in duration-300">
              {claims.map(item => (
                <div
                  key={item.id}
                  className="bg-card rounded-xl border shadow-sm hover:shadow-lg transition-shadow cursor-pointer overflow-hidden"
                  onClick={() => navigate(`/documents/${item.id}`)}
                >
                  <div className="p-6">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex-1">
                        <h3 className="font-mono font-semibold text-primary mb-1">
                          {item.claimNumber}
                        </h3>
                        <p className="text-sm text-foreground">
                          {item.claimant?.fullName || 'N/A'}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Policy: {item.policyNumber}
                        </p>
                      </div>
                      <Badge
                        variant={
                          item.priority === 'LOW'
                            ? 'success'
                            : item.priority === 'HIGH' || item.priority === 'URGENT'
                              ? 'destructive'
                              : 'warning'
                        }
                      >
                        {item.priority}
                      </Badge>
                    </div>

                    <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
                      <FileText className="h-4 w-4" />
                      <span>{item.documents?.length || 0} Files</span>
                    </div>

                    <div className="pt-4 border-t space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">Trinity Score</span>
                        <span className="text-foreground">-</span>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">Created</span>
                        <span className="text-foreground">
                          {format(new Date(item.createdAt), 'MMM dd, yyyy')}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

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
  );
}
