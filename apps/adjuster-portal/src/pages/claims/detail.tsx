import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  MapPin,
  Calendar,
  Video,
  Car,
  FileText,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  FileCheck,
  Banknote,
} from 'lucide-react';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { formatDate, getInitials, cn, getDaysSince } from '@/lib/utils';
import { useClaim, useUpdateClaim } from '@/hooks/use-claims';
import { useCreateVideoRoom } from '@/hooks/use-video';
import { useToast } from '@/hooks/use-toast';

const statusConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'success' | 'warning' | 'info' | 'destructive' }> = {
  SUBMITTED: { label: 'Submitted', variant: 'secondary' },
  ASSIGNED: { label: 'Assigned', variant: 'info' },
  SCHEDULED: { label: 'Scheduled', variant: 'info' },
  IN_ASSESSMENT: { label: 'In Assessment', variant: 'warning' },
  REPORT_PENDING: { label: 'Report Pending', variant: 'warning' },
  APPROVED: { label: 'Approved', variant: 'success' },
  REJECTED: { label: 'Rejected', variant: 'destructive' },
  CLOSED: { label: 'Closed', variant: 'secondary' },
};

export function ClaimDetailPage() {
  const { id: claimId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const { data: claim, isLoading } = useClaim(claimId || '');
  const updateClaim = useUpdateClaim(claimId || '');
  const createVideoRoom = useCreateVideoRoom();

  const handleUpdateStatus = async (status: string) => {
    if (!claimId) return;
    
    try {
      await updateClaim.mutateAsync({ status: status as any });
      toast({
        title: 'Success',
        description: `Claim status updated to ${status}.`,
      });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: 'Failed to update claim status.',
        variant: 'destructive',
      });
    }
  };

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

            {/* Policy Information (New: Compliance) */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <FileCheck className="h-5 w-5" />
                  Policy Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="flex justify-between border-b pb-2">
                    <span className="text-muted-foreground text-sm">Policy Number</span>
                    <span className="font-medium text-sm">{claim.policyNumber}</span>
                  </div>
                  <div className="flex justify-between border-b pb-2">
                    <span className="text-muted-foreground text-sm">Sum Insured</span>
                    <span className="font-medium text-sm">
                      {claim.sumInsured ? `RM ${claim.sumInsured.toLocaleString()}` : 'N/A'}
                    </span>
                  </div>
                  <div className="flex justify-between border-b pb-2">
                    <span className="text-muted-foreground text-sm">NCD Rate</span>
                    <span className="font-medium text-sm">
                      {claim.ncdRate ? `${(claim.ncdRate * 100).toFixed(0)}%` : 'N/A'}
                    </span>
                  </div>
                  <div className="flex justify-between border-b pb-2">
                    <span className="text-muted-foreground text-sm">Policy Type</span>
                    <span className="font-medium text-sm">
                      {claim.claimType.replace(/_/g, ' ')}
                    </span>
                  </div>
                  <div className="flex justify-between border-b pb-2">
                    <span className="text-muted-foreground text-sm">Panel Workshop</span>
                    <span className="font-medium text-sm">{claim.workshopName || 'Not Assigned'}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Financials (New: Compliance) */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Banknote className="h-5 w-5" />
                  Financials & Estimates
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-1">
                    <p className="text-sm font-medium">Estimated Loss</p>
                    <p className="text-2xl font-bold">
                      {claim.estimatedLossAmount 
                        ? `RM ${claim.estimatedLossAmount.toLocaleString()}` 
                        : 'Pending'}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-medium">Repair Cost (Final)</p>
                    <p className="text-2xl font-bold text-muted-foreground">
                      {claim.estimatedRepairCost 
                        ? `RM ${claim.estimatedRepairCost.toLocaleString()}` 
                        : 'Pending'}
                    </p>
                  </div>
                </div>
                <div className="grid gap-4 md:grid-cols-2 pt-4 border-t">
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">SST (Service Tax)</span>
                    <span className="text-sm font-medium">
                      {claim.sstAmount ? `RM ${claim.sstAmount.toLocaleString()}` : 'N/A'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Betterment</span>
                    <span className="text-sm font-medium">RM 0.00</span>
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
            {/* SLA Status */}
            <Card className={cn(
              "border-l-4",
              getDaysSince(claim.createdAt) > 7 ? "border-l-destructive" : "border-l-success"
            )}>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">SLA Status (BNM)</span>
                  <Badge variant={getDaysSince(claim.createdAt) > 7 ? "destructive" : "success"}>
                    {getDaysSince(claim.createdAt)} Days Active
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {getDaysSince(claim.createdAt) > 7 
                    ? "SLA breach: Recommended TAT is 7 working days for acknowledgement." 
                    : "Within recommended turnaround time."}
                </p>
              </CardContent>
            </Card>

            {/* Actions */}
            <Card>
              <CardHeader>
                <CardTitle>Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button 
                  className="w-full bg-success hover:bg-success/90" 
                  onClick={() => handleUpdateStatus('APPROVED')}
                  disabled={claim.status === 'APPROVED' || claim.status === 'REJECTED'}
                >
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  Approve Claim
                </Button>
                <Button 
                  variant="destructive" 
                  className="w-full" 
                  onClick={() => handleUpdateStatus('REJECTED')}
                  disabled={claim.status === 'APPROVED' || claim.status === 'REJECTED'}
                >
                  <XCircle className="h-4 w-4 mr-2" />
                  Reject Claim
                </Button>
                <Button variant="outline" className="w-full">
                  <FileText className="h-4 w-4 mr-2" />
                  Request Documents
                </Button>
              </CardContent>
            </Card>

            {/* Vehicle Info */}
            <Card>
              <CardHeader className="py-4">
                <CardTitle className="text-base flex items-center gap-2">
                  <Car className="h-4 w-4" />
                  Vehicle Details
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Plate No:</span>
                  <span className="font-medium">{claim.vehiclePlateNumber || 'N/A'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Chassis No:</span>
                  <span className="font-medium">{claim.vehicleChassisNumber || 'N/A'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Make/Model:</span>
                  <span className="font-medium">
                    {claim.vehicleMake} {claim.vehicleModel}
                    {!claim.vehicleMake && !claim.vehicleModel && 'N/A'}
                  </span>
                </div>
              </CardContent>
            </Card>

            {/* Police Report */}
            <Card>
              <CardHeader className="py-4">
                <CardTitle className="text-base flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4" />
                  Police Report
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Report No:</span>
                  <span className="font-medium">{claim.policeReportNumber || 'N/A'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Date:</span>
                  <span className="font-medium">
                    {claim.policeReportDate ? formatDate(claim.policeReportDate) : 'N/A'}
                  </span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-muted-foreground">Station:</span>
                  <span className="font-medium">{claim.policeStation || 'Not provided'}</span>
                </div>
              </CardContent>
            </Card>
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
                    <div className="flex flex-col gap-1 mt-1">
                      <Badge variant="success" className="text-[10px] w-fit">
                        eKYC Verified
                      </Badge>
                      {claim.isPdpaCompliant ? (
                        <Badge variant="info" className="text-[10px] w-fit bg-blue-100 text-blue-700 hover:bg-blue-100 border-none">
                          PDPA Consented
                        </Badge>
                      ) : (
                        <Badge variant="destructive" className="text-[10px] w-fit">
                          PDPA PENDING
                        </Badge>
                      )}
                    </div>
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
