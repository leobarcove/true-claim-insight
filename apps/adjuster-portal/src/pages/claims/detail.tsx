import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Phone,
  MapPin,
  Calendar,
  FileText,
  Video,
  Clock,
  CheckCircle,
  Upload,
} from 'lucide-react';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { formatDate, formatDateTime, getInitials } from '@/lib/utils';
import { useClaim } from '@/hooks/use-claims';
import { useCreateVideoRoom } from '@/hooks/use-video';
import { useToast } from '@/hooks/use-toast';

// Mock claim detail

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
      <Header
        title={claim.claimNumber}
        description={`${claim.claimantId} • ${claim.claimType.replace('_', ' ')}`}
      />

      <div className="flex-1 overflow-auto p-6">
        {/* Back button and actions */}
        <div className="flex items-center justify-between mb-6">
          <Link to="/claims">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Claims
            </Button>
          </Link>
          <div className="flex items-center gap-2">
            <Badge variant={statusConfig[claim.status].variant} className="text-sm px-3 py-1">
              {statusConfig[claim.status].label}
            </Badge>
            {claim.status === 'SCHEDULED' && (
              <Button onClick={handleStartVideoSession} disabled={createVideoRoom.isPending}>
                <Video className="h-4 w-4 mr-2" />
                {createVideoRoom.isPending ? 'Starting...' : 'Start Video Session'}
              </Button>
            )}
          </div>
        </div>

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

            {/* Vehicle Information */}
            <Card>
              <CardHeader>
                <CardTitle>Vehicle Information</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-3">
                  <div>
                    <p className="text-sm font-medium">Make & Model</p>
                    <p className="text-sm text-muted-foreground">
                      {claim.vehicleMake} {claim.vehicleModel} ({claim.vehicleYear})
                    </p>
                  </div>
                  <div>
                    <p className="text-sm font-medium">Plate Number</p>
                    <p className="text-sm text-muted-foreground">{claim.vehiclePlateNumber}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Documents */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Documents</CardTitle>
                <Button variant="outline" size="sm">
                  <Upload className="h-4 w-4 mr-2" />
                  Upload
                </Button>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-center p-8 text-muted-foreground border-2 border-dashed rounded-lg">
                  <p className="text-sm">No documents uploaded yet.</p>
                </div>
              </CardContent>
            </Card>

            {/* Notes */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Notes</CardTitle>
                <Button variant="outline" size="sm">
                  Add Note
                </Button>
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
                    <p className="font-medium">{claim.claimantId}</p>
                    <Badge variant="success" className="text-xs">
                      <CheckCircle className="h-3 w-3 mr-1" />
                      eKYC Verified
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Video Session Placeholder */}
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

            {/* Timeline */}
            <Card>
              <CardHeader>
                <CardTitle>Timeline</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-center p-4 text-muted-foreground">
                  <p className="text-sm">Timeline records will appear as the claim progresses.</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
