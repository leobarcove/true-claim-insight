import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, Filter, Eye, Video, FileText, PlusCircle } from 'lucide-react';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { formatDate } from '@/lib/utils';
import { useClaims } from '@/hooks/use-claims';

const statusConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'success' | 'warning' | 'info' | 'destructive' }> = {
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
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string | null>(null);

  const { data, isLoading } = useClaims({
    search: searchQuery,
    status: statusFilter as any || undefined,
  });

  const claims = data?.claims || [];

  return (
    <div className="flex flex-col h-full">
      <Header
        title="Claims"
        description="Manage and process your assigned claims"
      >
        <Link to="/claims/new">
          <Button>
            <PlusCircle className="h-4 w-4 mr-2" />
            New Claim
          </Button>
        </Link>
      </Header>

      <div className="flex-1 overflow-auto p-6 space-y-6">
        {/* Filters */}
        <div className="flex items-center gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search by claim ID or claimant name..."
              className="pl-9"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <Button variant="outline" size="icon">
            <Filter className="h-4 w-4" />
          </Button>
        </div>

        {/* Status Tabs */}
        <div className="flex gap-2 flex-wrap">
          <Button
            variant={statusFilter === null ? 'default' : 'outline'}
            size="sm"
            onClick={() => setStatusFilter(null)}
          >
            All
          </Button>
          {['ASSIGNED', 'SCHEDULED', 'IN_ASSESSMENT', 'REPORT_PENDING'].map((status) => (
            <Button
              key={status}
              variant={statusFilter === status ? 'default' : 'outline'}
              size="sm"
              onClick={() => setStatusFilter(status)}
            >
              {statusConfig[status].label}
            </Button>
          ))}
        </div>

        {/* Claims List */}
        <div className="space-y-4">
          {isLoading ? (
            <div className="text-center py-12">Loading claims...</div>
          ) : (
            claims.map((claim) => (
              <Card key={claim.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-6">
                  <div className="flex items-start justify-between">
                    <div className="space-y-3">
                      <div className="flex items-center gap-3">
                        <span className="font-mono font-semibold text-primary">
                          {claim.claimNumber}
                        </span>
                        <Badge variant={statusConfig[claim.status]?.variant || 'secondary'}>
                          {statusConfig[claim.status]?.label || claim.status}
                        </Badge>
                        <Badge variant="outline">{typeLabels[claim.claimType] || claim.claimType}</Badge>
                      </div>

                      <div>
                        <p className="font-medium">Claimant ID: {claim.claimantId}</p>
                      </div>

                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {claim.description}
                      </p>

                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <span>Incident: {formatDate(claim.incidentDate)}</span>
                        <span>•</span>
                        <span>Created: {formatDate(claim.createdAt)}</span>
                        {claim.scheduledAssessmentTime && (
                          <>
                            <span>•</span>
                            <span className="text-primary font-medium">
                              Session: {formatDate(claim.scheduledAssessmentTime)}
                            </span>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Link to={`/claims/${claim.id}`}>
                        <Button variant="outline" size="sm">
                          <Eye className="h-4 w-4 mr-2" />
                          View
                        </Button>
                      </Link>
                      {claim.status === 'SCHEDULED' && (
                        <Button size="sm">
                          <Video className="h-4 w-4 mr-2" />
                          Join Call
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}

          {!isLoading && claims.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="text-lg font-medium">No claims found</p>
              <p className="text-sm">Try adjusting your search or filters</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
