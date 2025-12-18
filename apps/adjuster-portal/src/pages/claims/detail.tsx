import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  MapPin,
  Calendar,
  Video,
} from 'lucide-react';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { formatDate, getInitials } from '@/lib/utils';
import { useClaim } from '@/hooks/use-claims';
import { useCreateVideoRoom } from '@/hooks/use-video';
import { useToast } from '@/hooks/use-toast';

const statusConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'success' | 'warning' | 'info' | 'destructive' }> = {
  SUBMITTED: { label: 'Submitted', variant: 'secondary' },
  ASSIGNED: { label: 'Assigned', variant: 'info' },
  SCHEDULED: { label: 'Scheduled', variant: 'info' },
  IN_ASSESSMENT: { label: 'In Assessment', variant: 'warning' },
  REPORT_PENDING: { label: 'Report Pending', variant: 'warning' },
  APPROVED: { label: 'Approved', variant: 'success' },
};

export function ClaimDetailPage() {
  const { id: claimId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const { data: claim, isLoading } = useClaim(claimId || '');
  const createVideoRoom = useCreateVideoRoom();

  const handleStartVideoSession = async () => {
    if (!claimId) return;
    
    try {
      const session = await createVideoRoom.mutateAsync(claimId);
      navigate(`/video/${session.sessionId}`);
    } catch (error: any) {
      toast({
        title: 'Error',
        description: 'Failed to create a video session. Please try again.',
        variant: 'destructive',
      });
    }
  };

  if (isLoading || !claim) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center font-medium">Loading claim details...</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <Header
        title={claim.claimNumber}
        description={`${claim.claimantId} • ${claim.claimType.replace('_', ' ')}`}
      >
        <div className="flex items-center gap-3">
          <Link to="/claims">
            <Button variant="outline" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
          </Link>
          <Badge variant={statusConfig[claim.status].variant}>
            {statusConfig[claim.status].label}
          </Badge>
          {claim.status === 'SCHEDULED' && (
            <Button size="sm" onClick={handleStartVideoSession} disabled={createVideoRoom.isPending}>
              <Video className="h-4 w-4 mr-2" />
              {createVideoRoom.isPending ? 'Starting...' : 'Start Session'}
            </Button>
          )}
        </div>
      </Header>

      <div className="flex-1 overflow-auto p-6">

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Incident Details */}
            <Card>
              <CardHeader>
                <CardTitle>Incident Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm">{claim.description}</p>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="flex items-start gap-3">
                    <Calendar className="h-5 w-5 text-muted-foreground mt-0.5" />
                    <div>
                      <p className="text-sm font-medium">Incident Date</p>
                      <p className="text-sm text-muted-foreground">
                        {formatDate(claim.incidentDate)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <MapPin className="h-5 w-5 text-muted-foreground mt-0.5" />
                    <div>
                      <p className="text-sm font-medium">Location</p>
                      <p className="text-sm text-muted-foreground">
                        {claim.incidentLocation.address}
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Documents placeholder */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Documents</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-center p-8 text-muted-foreground border-2 border-dashed rounded-lg">
                  <p className="text-sm">No documents uploaded yet.</p>
                </div>
              </CardContent>
            </Card>

            {/* Notes placeholder */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Notes</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-center p-4 text-muted-foreground">
                  <p className="text-sm">No notes available.</p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Claimant Info */}
            <Card>
              <CardHeader>
                <CardTitle>Claimant</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-3">
                  <Avatar>
                    <AvatarFallback>{getInitials(claim.claimantId)}</AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-medium text-sm">ID: {claim.claimantId}</p>
                    <Badge variant="success" className="text-[10px] mt-1">
                      eKYC Verified
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Video Session button */}
            <Card>
              <CardHeader>
                <CardTitle>Video Session</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <Button className="w-full" onClick={handleStartVideoSession} disabled={createVideoRoom.isPending}>
                    <Video className="h-4 w-4 mr-2" />
                    {createVideoRoom.isPending ? 'Starting...' : 'Start Session'}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Timeline Placeholder */}
            <Card>
              <CardHeader>
                <CardTitle>Timeline</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-center p-4 text-muted-foreground text-center">
                  <p className="text-xs">Timeline records will appear as the claim progresses.</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
