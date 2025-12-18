import {
  FileText,
  Video,
  Clock,
  CheckCircle,
  TrendingUp,
} from 'lucide-react';
import { Header } from '@/components/layout/header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/stores/auth-store';

import { useClaims, useClaimStats } from '@/hooks/use-claims';

const getStatusBadge = (status: string) => {
  const variants: Record<string, 'default' | 'secondary' | 'success' | 'warning' | 'info' | 'destructive'> = {
    SUBMITTED: 'secondary',
    DOCUMENTS_PENDING: 'warning',
    PENDING_ASSIGNMENT: 'info',
    ASSIGNED: 'secondary',
    SCHEDULED: 'info',
    IN_ASSESSMENT: 'warning',
    REPORT_PENDING: 'warning',
    UNDER_REVIEW: 'info',
    APPROVED: 'success',
    REJECTED: 'destructive',
    ESCALATED_SIU: 'destructive',
    CLOSED: 'secondary',
  };
  return <Badge variant={variants[status] || 'default'}>{status.replace('_', ' ')}</Badge>;
};

export function DashboardPage() {
  const { user } = useAuthStore();
  const { data: statsData } = useClaimStats();
  const { data: claimsData, isLoading: claimsLoading } = useClaims({ limit: 5, sortBy: 'createdAt', sortOrder: 'desc' });
  const { data: sessionsData, isLoading: sessionsLoading } = useClaims({ status: 'SCHEDULED' as any, limit: 5 });

  const stats = [
    {
      title: 'Active Claims',
      value: statsData?.totalAssigned.toString() || '0',
      change: 'Currently assigned',
      icon: FileText,
      trend: 'neutral',
    },
    {
      title: 'Scheduled Sessions',
      value: statsData?.inProgress.toString() || '0',
      change: 'Active status',
      icon: Video,
      trend: 'neutral',
    },
    {
      title: 'Pending Reports',
      value: statsData?.pendingReview.toString() || '0',
      change: 'Action required',
      icon: Clock,
      trend: 'warning',
    },
    {
      title: 'Completed This Month',
      value: statsData?.completedThisMonth.toString() || '0',
      change: 'Finalised total',
      icon: CheckCircle,
      trend: 'up',
    },
  ];

  const recentClaims = claimsData?.claims || [];
  const upcomingSessions = sessionsData?.claims || [];

  return (
    <div className="flex flex-col h-full">
      <Header
        title={`Good morning, ${user?.fullName.split(' ')[0] || 'Adjuster'}`}
        description="Here's what's happening with your claims today"
      />

      <div className="flex-1 overflow-auto p-6 space-y-6">
        {/* Stats Grid */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {stats.map((stat) => (
            <Card key={stat.title}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {stat.title}
                </CardTitle>
                <stat.icon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stat.value}</div>
                <p className={`text-xs ${
                  stat.trend === 'up' ? 'text-green-600' :
                  stat.trend === 'warning' ? 'text-yellow-600' :
                  'text-muted-foreground'
                }`}>
                  {stat.change}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Recent Claims */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Recent Claims</CardTitle>
              <Button variant="outline" size="sm">
                View All
              </Button>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {(recentClaims.length === 0 && !claimsLoading) ? (
                  <div className="text-center py-4 text-muted-foreground">No recent claims</div>
                ) : (
                  recentClaims.map((claim) => (
                    <div
                      key={claim.id}
                      onClick={() => (window.location.href = `/claims/${claim.id}`)}
                      className="flex items-center justify-between p-3 rounded-lg border hover:bg-accent/50 cursor-pointer transition-colors"
                    >
                      <div className="space-y-1">
                        <p className="text-sm font-medium">{claim.claimNumber}</p>
                        <p className="text-xs text-muted-foreground">
                          ID: {claim.claimantId.substring(0, 8)}... • {claim.claimType.replace('_', ' ')}
                        </p>
                      </div>
                      {getStatusBadge(claim.status)}
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>

          {/* Upcoming Sessions */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Upcoming Sessions</CardTitle>
              <Button variant="outline" size="sm" onClick={() => (window.location.href = '/claims?status=SCHEDULED')}>
                View Schedule
              </Button>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {(upcomingSessions.length === 0 && !sessionsLoading) ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Video className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p>No upcoming sessions</p>
                  </div>
                ) : (
                  upcomingSessions.map((claim) => (
                    <div
                      key={claim.id}
                      onClick={() => (window.location.href = `/claims/${claim.id}`)}
                      className="flex items-center justify-between p-3 rounded-lg border hover:bg-accent/50 cursor-pointer transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                          <Video className="h-5 w-5 text-primary" />
                        </div>
                        <div className="space-y-1">
                          <p className="text-sm font-medium">Claimant ID: {claim.claimantId.substring(0, 8)}</p>
                          <p className="text-xs text-muted-foreground">
                            {claim.claimNumber}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-xs font-medium">Scheduled</p>
                        <p className="text-[10px] text-muted-foreground">
                          {claim.scheduledAssessmentTime ? new Date(claim.scheduledAssessmentTime).toLocaleDateString() : 'Unscheduled'}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Performance Summary */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Performance Summary
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="text-center p-4 rounded-lg bg-accent/50">
                <p className="text-3xl font-bold text-primary">4.2</p>
                <p className="text-sm text-muted-foreground">Avg. Days to Close</p>
              </div>
              <div className="text-center p-4 rounded-lg bg-accent/50">
                <p className="text-3xl font-bold text-green-600">96%</p>
                <p className="text-sm text-muted-foreground">On-Time Completion</p>
              </div>
              <div className="text-center p-4 rounded-lg bg-accent/50">
                <p className="text-3xl font-bold text-blue-600">28</p>
                <p className="text-sm text-muted-foreground">Cases This Month</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
