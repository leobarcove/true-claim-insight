import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, Filter, Eye, Video, FileText } from 'lucide-react';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { formatDate } from '@/lib/utils';

// Mock claims data
const mockClaims = [
  {
    id: 'CLM-2025-000123',
    claimant: {
      name: 'Tan Wei Ming',
      phone: '+60 12-345 6789',
    },
    type: 'OWN_DAMAGE',
    status: 'SCHEDULED',
    incidentDate: '2025-12-15',
    createdAt: '2025-12-16',
    scheduledAt: '2025-12-18T10:00:00',
    description: 'Rear-ended at traffic light junction in Petaling Jaya',
  },
  {
    id: 'CLM-2025-000122',
    claimant: {
      name: 'Siti Aminah binti Yusof',
      phone: '+60 13-456 7890',
    },
    type: 'THIRD_PARTY_PROPERTY',
    status: 'IN_ASSESSMENT',
    incidentDate: '2025-12-14',
    createdAt: '2025-12-15',
    scheduledAt: null,
    description: 'Side collision at Jalan Ampang intersection',
  },
  {
    id: 'CLM-2025-000121',
    claimant: {
      name: 'Raj Kumar a/l Subramaniam',
      phone: '+60 14-567 8901',
    },
    type: 'OWN_DAMAGE',
    status: 'REPORT_PENDING',
    incidentDate: '2025-12-13',
    createdAt: '2025-12-14',
    scheduledAt: null,
    description: 'Hit pothole on Federal Highway, front suspension damage',
  },
  {
    id: 'CLM-2025-000120',
    claimant: {
      name: 'Lee Mei Ling',
      phone: '+60 15-678 9012',
    },
    type: 'WINDSCREEN',
    status: 'ASSIGNED',
    incidentDate: '2025-12-12',
    createdAt: '2025-12-13',
    scheduledAt: null,
    description: 'Cracked windscreen from flying debris on highway',
  },
  {
    id: 'CLM-2025-000119',
    claimant: {
      name: 'Ahmad Hassan bin Omar',
      phone: '+60 16-789 0123',
    },
    type: 'THEFT',
    status: 'ESCALATED_SIU',
    incidentDate: '2025-12-10',
    createdAt: '2025-12-11',
    scheduledAt: null,
    description: 'Vehicle stolen from shopping mall car park',
  },
];

const statusConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'success' | 'warning' | 'info' | 'destructive' }> = {
  SUBMITTED: { label: 'Submitted', variant: 'secondary' },
  ASSIGNED: { label: 'Assigned', variant: 'info' },
  SCHEDULED: { label: 'Scheduled', variant: 'info' },
  IN_ASSESSMENT: { label: 'In Assessment', variant: 'warning' },
  REPORT_PENDING: { label: 'Report Pending', variant: 'warning' },
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

  const filteredClaims = mockClaims.filter((claim) => {
    const matchesSearch =
      claim.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      claim.claimant.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = !statusFilter || claim.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="flex flex-col h-full">
      <Header
        title="Claims"
        description="Manage and process your assigned claims"
      />

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
            All ({mockClaims.length})
          </Button>
          {['ASSIGNED', 'SCHEDULED', 'IN_ASSESSMENT', 'REPORT_PENDING'].map((status) => (
            <Button
              key={status}
              variant={statusFilter === status ? 'default' : 'outline'}
              size="sm"
              onClick={() => setStatusFilter(status)}
            >
              {statusConfig[status].label} (
              {mockClaims.filter((c) => c.status === status).length})
            </Button>
          ))}
        </div>

        {/* Claims List */}
        <div className="space-y-4">
          {filteredClaims.map((claim) => (
            <Card key={claim.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <span className="font-mono font-semibold text-primary">
                        {claim.id}
                      </span>
                      <Badge variant={statusConfig[claim.status].variant}>
                        {statusConfig[claim.status].label}
                      </Badge>
                      <Badge variant="outline">{typeLabels[claim.type]}</Badge>
                    </div>

                    <div>
                      <p className="font-medium">{claim.claimant.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {claim.claimant.phone}
                      </p>
                    </div>

                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {claim.description}
                    </p>

                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span>Incident: {formatDate(claim.incidentDate)}</span>
                      <span>•</span>
                      <span>Created: {formatDate(claim.createdAt)}</span>
                      {claim.scheduledAt && (
                        <>
                          <span>•</span>
                          <span className="text-primary font-medium">
                            Session: {formatDate(claim.scheduledAt)}
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
                    {claim.status === 'REPORT_PENDING' && (
                      <Button size="sm" variant="secondary">
                        <FileText className="h-4 w-4 mr-2" />
                        Generate Report
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}

          {filteredClaims.length === 0 && (
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
