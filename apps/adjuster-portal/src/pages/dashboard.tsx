import {
  FileText,
  Video,
  Clock,
  CheckCircle,
  AlertTriangle,
  TrendingUp,
} from 'lucide-react';
import { Header } from '@/components/layout/header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/stores/auth-store';
import { formatDate } from '@/lib/utils';

// Mock data for dashboard
const stats = [
  {
    title: 'Active Claims',
    value: '12',
    change: '+2 from last week',
    icon: FileText,
    trend: 'up',
  },
  {
    title: 'Scheduled Sessions',
    value: '5',
    change: '3 today',
    icon: Video,
    trend: 'neutral',
  },
  {
    title: 'Pending Reports',
    value: '4',
    change: '2 due today',
    icon: Clock,
    trend: 'warning',
  },
  {
    title: 'Completed This Month',
    value: '28',
    change: '+15% vs last month',
    icon: CheckCircle,
    trend: 'up',
  },
];

const recentClaims = [
  {
    id: 'CLM-2025-000123',
    claimant: 'Tan Wei Ming',
    type: 'Own Damage',
    status: 'SCHEDULED',
    scheduledAt: '2025-12-18T10:00:00',
  },
  {
    id: 'CLM-2025-000122',
    claimant: 'Siti Aminah',
    type: 'Third Party',
    status: 'IN_ASSESSMENT',
    scheduledAt: null,
  },
  {
    id: 'CLM-2025-000121',
    claimant: 'Raj Kumar',
    type: 'Own Damage',
    status: 'REPORT_PENDING',
    scheduledAt: null,
  },
  {
    id: 'CLM-2025-000120',
    claimant: 'Lee Mei Ling',
    type: 'Windscreen',
    status: 'ASSIGNED',
    scheduledAt: null,
  },
];

const upcomingSessions = [
  {
    id: 'SES-001',
    claimId: 'CLM-2025-000123',
    claimant: 'Tan Wei Ming',
    time: '10:00 AM',
    date: 'Today',
  },
  {
    id: 'SES-002',
    claimId: 'CLM-2025-000125',
    claimant: 'Ahmad Hassan',
    time: '2:30 PM',
    date: 'Today',
  },
  {
    id: 'SES-003',
    claimId: 'CLM-2025-000126',
    claimant: 'Priya Devi',
    time: '9:00 AM',
    date: 'Tomorrow',
  },
];

const getStatusBadge = (status: string) => {
  const variants: Record<string, 'default' | 'secondary' | 'success' | 'warning' | 'info'> = {
    ASSIGNED: 'secondary',
    SCHEDULED: 'info',
    IN_ASSESSMENT: 'warning',
    REPORT_PENDING: 'warning',
    APPROVED: 'success',
  };
  return <Badge variant={variants[status] || 'default'}>{status.replace('_', ' ')}</Badge>;
};

export function DashboardPage() {
  const { user } = useAuthStore();

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
                {recentClaims.map((claim) => (
                  <div
                    key={claim.id}
                    className="flex items-center justify-between p-3 rounded-lg border hover:bg-accent/50 cursor-pointer transition-colors"
                  >
                    <div className="space-y-1">
                      <p className="text-sm font-medium">{claim.id}</p>
                      <p className="text-sm text-muted-foreground">
                        {claim.claimant} • {claim.type}
                      </p>
                    </div>
                    {getStatusBadge(claim.status)}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Upcoming Sessions */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Upcoming Sessions</CardTitle>
              <Button variant="outline" size="sm">
                View Schedule
              </Button>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {upcomingSessions.map((session) => (
                  <div
                    key={session.id}
                    className="flex items-center justify-between p-3 rounded-lg border hover:bg-accent/50 cursor-pointer transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                        <Video className="h-5 w-5 text-primary" />
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm font-medium">{session.claimant}</p>
                        <p className="text-xs text-muted-foreground">
                          {session.claimId}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium">{session.time}</p>
                      <p className="text-xs text-muted-foreground">{session.date}</p>
                    </div>
                  </div>
                ))}
              </div>

              {upcomingSessions.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  <Video className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>No upcoming sessions</p>
                </div>
              )}
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
