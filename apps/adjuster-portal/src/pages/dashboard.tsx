import { useState } from 'react';
import {
  FileText,
  Video,
  Clock,
  CheckCircle,
  TrendingUp,
  Search,
  List,
  Grid,
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
} from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Header } from '@/components/layout/header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useAuthStore } from '@/stores/auth-store';

import { useClaims, useClaimStats } from '@/hooks/use-claims';

const getStatusBadge = (status: string) => {
  const variants: Record<
    string,
    'default' | 'secondary' | 'success' | 'warning' | 'info' | 'destructive'
  > = {
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
  const [recentClaimsView, setRecentClaimsView] = useState<'table' | 'card'>('table');
  const [recentClaimsPage, setRecentClaimsPage] = useState(1);
  const [sessionsView, setSessionsView] = useState<'table' | 'card'>('table');
  const [sessionsPage, setSessionsPage] = useState(1);

  const { data: statsData, isLoading: statsLoading } = useClaimStats();

  const { data: claimsData, isLoading: claimsLoading } = useClaims({
    limit: 5,
    page: recentClaimsPage,
    sortBy: 'createdAt',
    sortOrder: 'desc',
  });

  const { data: sessionsData, isLoading: sessionsLoading } = useClaims({
    status: 'SCHEDULED' as any,
    limit: 5,
    page: sessionsPage,
    sortBy: 'scheduledAssessmentTime',
    sortOrder: 'asc',
  });

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

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  };

  return (
    <div className="flex flex-col h-full">
      <Header
        title={`${getGreeting()}, ${user?.fullName.split(' ')[0] || 'Adjuster'}`}
        description="Here's what's happening with your claims today"
      />

      <div className="flex-1 overflow-auto p-6 space-y-6">
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
                {statsLoading ? (
                  <Skeleton className="h-9 w-12 mx-auto mb-1" />
                ) : (
                  <p className="text-3xl font-bold text-primary">
                    {statsData?.averagePerDay?.toFixed(1) || '0'}
                  </p>
                )}
                <p className="text-sm text-muted-foreground">Avg. Cases/Day</p>
              </div>
              <div className="text-center p-4 rounded-lg bg-accent/50">
                {statsLoading ? (
                  <Skeleton className="h-9 w-12 mx-auto mb-1" />
                ) : (
                  <p className="text-3xl font-bold text-emerald-600">
                    {statsData?.completedThisWeek || 0}
                  </p>
                )}
                <p className="text-sm text-muted-foreground">Completed This Week</p>
              </div>
              <div className="text-center p-4 rounded-lg bg-accent/50">
                {statsLoading ? (
                  <Skeleton className="h-9 w-12 mx-auto mb-1" />
                ) : (
                  <p className="text-3xl font-bold text-primary">{statsData?.totalClaims || 0}</p>
                )}
                <p className="text-sm text-muted-foreground">Total Cases Handled</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Stats Grid */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {stats.map(stat => (
            <Card key={stat.title}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {stat.title}
                </CardTitle>
                <stat.icon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                {statsLoading ? (
                  <Skeleton className="h-8 w-16 mb-1" />
                ) : (
                  <div className="text-2xl font-bold">{stat.value}</div>
                )}
                <p
                  className={`text-xs ${
                    stat.trend === 'up'
                      ? 'text-emerald-600'
                      : stat.trend === 'warning'
                        ? 'text-yellow-600'
                        : 'text-muted-foreground'
                  }`}
                >
                  {stat.change}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Recent Claims */}
          <Card className="flex flex-col">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Recent Claims</CardTitle>
              <div className="flex items-center gap-2">
                <div className="flex items-center bg-muted/50 rounded-lg p-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className={`h-6 w-6 rounded-md ${recentClaimsView === 'table' ? 'bg-background shadow-sm' : ''}`}
                    onClick={() => setRecentClaimsView('table')}
                  >
                    <List className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className={`h-6 w-6 rounded-md ${recentClaimsView === 'card' ? 'bg-background shadow-sm' : ''}`}
                    onClick={() => setRecentClaimsView('card')}
                  >
                    <Grid className="h-4 w-4" />
                  </Button>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => (window.location.href = '/claims')}
                >
                  View All
                </Button>
              </div>
            </CardHeader>
            <CardContent className="flex-1">
              {recentClaimsView === 'table' ? (
                <div className="space-y-4 transition-all duration-300">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent border-none">
                        <TableHead colSpan={4}>
                          <Skeleton className="h-4 w-full" />
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {claimsLoading ? (
                        [...Array(5)].map((_, i) => (
                          <TableRow key={i} className="border-border/50 hover:bg-transparent">
                            <TableCell>
                              <Skeleton className="h-4 w-24" />
                            </TableCell>
                            <TableCell>
                              <Skeleton className="h-4 w-32" />
                            </TableCell>
                            <TableCell>
                              <Skeleton className="h-6 w-24 rounded-full" />
                            </TableCell>
                            <TableCell>
                              <Skeleton className="h-6 w-6 ml-auto" />
                            </TableCell>
                          </TableRow>
                        ))
                      ) : recentClaims.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                            No recent claims found.
                          </TableCell>
                        </TableRow>
                      ) : (
                        recentClaims.map(claim => (
                          <TableRow
                            key={claim.id}
                            className="hover:bg-accent/50 cursor-pointer border-border/50"
                            onClick={() => (window.location.href = `/claims/${claim.id}`)}
                          >
                            <TableCell className="font-medium text-foreground">
                              {claim.claimNumber}
                              <div className="text-[10px] text-muted-foreground mt-0.5">
                                {new Date(claim.createdAt).toLocaleDateString()}
                              </div>
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {claim.claimType.replace('_', ' ')}
                            </TableCell>
                            <TableCell>{getStatusBadge(claim.status)}</TableCell>
                            <TableCell>
                              <Button variant="ghost" size="icon" className="h-6 w-6">
                                <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>

                  {/* Pagination */}
                  {!claimsLoading && (
                    <div className="flex items-center justify-end gap-2 pt-2">
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => setRecentClaimsPage(p => Math.max(1, p - 1))}
                        disabled={recentClaimsPage === 1}
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <span className="text-xs text-muted-foreground">Page {recentClaimsPage}</span>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => setRecentClaimsPage(p => p + 1)}
                        disabled={
                          !claimsData?.pagination ||
                          recentClaimsPage >= claimsData.pagination.totalPages
                        }
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </div>
              ) : (
                /* Card View */
                <div className="space-y-4 transition-all duration-300">
                  {claimsLoading ? (
                    [...Array(3)].map((_, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between p-3 rounded-lg border"
                      >
                        <div className="space-y-2">
                          <Skeleton className="h-4 w-24" />
                          <Skeleton className="h-3 w-40" />
                        </div>
                        <Skeleton className="h-6 w-20 rounded-full" />
                      </div>
                    ))
                  ) : recentClaims.length === 0 ? (
                    <div className="text-center py-4 text-muted-foreground">No recent claims</div>
                  ) : (
                    recentClaims.map(claim => (
                      <div
                        key={claim.id}
                        onClick={() => (window.location.href = `/claims/${claim.id}`)}
                        className="flex items-center justify-between p-3 rounded-lg border hover:bg-accent/50 cursor-pointer transition-colors"
                      >
                        <div className="space-y-1">
                          <p className="text-sm font-medium">{claim.claimNumber}</p>
                          <p className="text-xs text-muted-foreground">
                            ID: {claim.claimantId.substring(0, 8)}... •{' '}
                            {claim.claimType.replace('_', ' ')}
                          </p>
                        </div>
                        {getStatusBadge(claim.status)}
                      </div>
                    ))
                  )}
                  {/* Reuse Pagination for Card View too if desired, or keep it simple */}
                  {!claimsLoading && (
                    <div className="flex items-center justify-center pt-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setRecentClaimsPage(p => p + 1)}
                        disabled={
                          !claimsData?.pagination ||
                          recentClaimsPage >= claimsData.pagination.totalPages
                        }
                      >
                        Load More
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Upcoming Sessions */}
          <Card className="flex flex-col">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Upcoming Sessions</CardTitle>
              <div className="flex items-center gap-2">
                <div className="flex items-center bg-muted/50 rounded-lg p-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className={`h-6 w-6 rounded-md ${sessionsView === 'table' ? 'bg-background shadow-sm' : ''}`}
                    onClick={() => setSessionsView('table')}
                  >
                    <List className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className={`h-6 w-6 rounded-md ${sessionsView === 'card' ? 'bg-background shadow-sm' : ''}`}
                    onClick={() => setSessionsView('card')}
                  >
                    <Grid className="h-4 w-4" />
                  </Button>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => (window.location.href = '/claims?status=SCHEDULED')}
                >
                  View Schedule
                </Button>
              </div>
            </CardHeader>
            <CardContent className="flex-1">
              {sessionsView === 'table' ? (
                <div className="space-y-4 transition-all duration-300">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent border-none">
                        <TableHead colSpan={3}>
                          <Skeleton className="h-4 w-full" />
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sessionsLoading ? (
                        [...Array(5)].map((_, i) => (
                          <TableRow key={i} className="border-border/50 hover:bg-transparent">
                            <TableCell className="px-0">
                              <div className="flex items-center gap-3">
                                <Skeleton className="h-8 w-8 rounded-full" />
                                <div className="space-y-1">
                                  <Skeleton className="h-3 w-24" />
                                  <Skeleton className="h-3 w-16" />
                                </div>
                              </div>
                            </TableCell>
                            <TableCell className="text-right">
                              <Skeleton className="h-3 w-24 ml-auto mb-1" />
                              <Skeleton className="h-3 w-16 ml-auto" />
                            </TableCell>
                            <TableCell>
                              <Skeleton className="h-6 w-6 ml-auto" />
                            </TableCell>
                          </TableRow>
                        ))
                      ) : upcomingSessions.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={3} className="text-center text-muted-foreground py-8">
                            No upcoming sessions.
                          </TableCell>
                        </TableRow>
                      ) : (
                        upcomingSessions.map(claim => (
                          <TableRow
                            key={claim.id}
                            className="hover:bg-accent/50 cursor-pointer border-border/50"
                            onClick={() => (window.location.href = `/claims/${claim.id}`)}
                          >
                            <TableCell className="px-0">
                              <div className="flex items-center gap-3">
                                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                                  <Video className="h-4 w-4 text-primary" />
                                </div>
                                <div className="space-y-0.5">
                                  <p className="text-sm font-medium">
                                    Claimant: {claim.claimantId.substring(0, 8)}
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    {claim.claimNumber}
                                  </p>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell className="text-right">
                              <p className="text-sm font-medium">
                                {claim.scheduledAssessmentTime
                                  ? new Date(claim.scheduledAssessmentTime).toLocaleDateString()
                                  : 'N/A'}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {claim.scheduledAssessmentTime
                                  ? new Date(claim.scheduledAssessmentTime).toLocaleTimeString([], {
                                      hour: '2-digit',
                                      minute: '2-digit',
                                    })
                                  : 'Unscheduled'}
                              </p>
                            </TableCell>
                            <TableCell>
                              <Button variant="ghost" size="icon" className="h-6 w-6">
                                <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                  {/* Pagination */}
                  {!sessionsLoading && (
                    <div className="flex items-center justify-end gap-2 pt-2">
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => setSessionsPage(p => Math.max(1, p - 1))}
                        disabled={sessionsPage === 1}
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <span className="text-xs text-muted-foreground">Page {sessionsPage}</span>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => setSessionsPage(p => p + 1)}
                        disabled={
                          !sessionsData?.pagination ||
                          sessionsPage >= sessionsData.pagination.totalPages
                        }
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </div>
              ) : (
                /* Card View */
                <div className="space-y-4 transition-all duration-300">
                  {sessionsLoading ? (
                    [...Array(3)].map((_, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between p-3 rounded-lg border"
                      >
                        <div className="flex items-center gap-3">
                          <Skeleton className="h-10 w-10 rounded-full" />
                          <div className="space-y-2">
                            <Skeleton className="h-3 w-24" />
                            <Skeleton className="h-3 w-16" />
                          </div>
                        </div>
                        <div className="flex flex-col items-end">
                          <Skeleton className="h-3 w-16 mb-1" />
                          <Skeleton className="h-3 w-20" />
                        </div>
                      </div>
                    ))
                  ) : upcomingSessions.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <Video className="h-12 w-12 mx-auto mb-2 opacity-50" />
                      <p>No upcoming sessions</p>
                    </div>
                  ) : (
                    upcomingSessions.map(claim => (
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
                            <p className="text-sm font-medium">
                              Claimant ID: {claim.claimantId.substring(0, 8)}
                            </p>
                            <p className="text-xs text-muted-foreground">{claim.claimNumber}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-xs font-medium">Scheduled</p>
                          <p className="text-[10px] text-muted-foreground">
                            {claim.scheduledAssessmentTime
                              ? new Date(claim.scheduledAssessmentTime).toLocaleDateString()
                              : 'Unscheduled'}
                          </p>
                        </div>
                      </div>
                    ))
                  )}
                  {!sessionsLoading && (
                    <div className="flex items-center justify-center pt-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setSessionsPage(p => p + 1)}
                        disabled={
                          !sessionsData?.pagination ||
                          sessionsPage >= sessionsData.pagination.totalPages
                        }
                      >
                        Load More
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
