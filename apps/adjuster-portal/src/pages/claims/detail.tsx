import { useState } from 'react';
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
  AlertTriangle,
  Clock,
  Download,
  Image,
  User,
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
  const [magicLink, setMagicLink] = useState<string | null>(null);
  const [isNotifying, setIsNotifying] = useState(false);

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

  const activeVideoSession = claim?.sessions?.find(
    (s) => s.status === 'WAITING' || s.status === 'SCHEDULED' || s.status === 'IN_PROGRESS'
  );

  const handleStartVideoAssessment = async () => {
    if (!claimId) return;
    setIsNotifying(true);
    
    try {
      let sessionId: string;

      // If there's already an active session, use it; otherwise create one
      if (activeVideoSession) {
        sessionId = activeVideoSession.id;
      } else {
        const session = await createVideoRoom.mutateAsync(claimId);
        sessionId = session.sessionId;
      }

      // Generate magic link for claimant (in production, this would send SMS)
      const devLink = `http://localhost:4001/video/${sessionId}`;
      setMagicLink(devLink);
      
      // Auto-copy to clipboard for easy testing
      await navigator.clipboard.writeText(devLink);
      
      toast({
        title: 'Assessment Started',
        description: 'Magic link copied to clipboard! Joining video room...',
      });

      // Small delay to show the magic link before navigating
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Navigate adjuster to video call
      navigate(`/video/${sessionId}`);
    } catch (error: any) {
      toast({
        title: 'Error',
        description: 'Failed to start video assessment. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsNotifying(false);
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
            <Button size="sm" onClick={handleStartVideoAssessment} disabled={createVideoRoom.isPending || isNotifying}>
              <Video className="h-4 w-4 mr-2" />
              {(createVideoRoom.isPending || isNotifying) ? 'Starting...' : 'Start Video Assessment'}
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
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Incident Details</CardTitle>
                <span className="text-xs text-muted-foreground">
                  Updated: {formatDate(claim.updatedAt)}
                </span>
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

                {/* Other Party Details (for TPPD claims) */}
                {claim.otherParty && Object.keys(claim.otherParty).length > 0 && (
                  <div className="pt-4 border-t">
                    <p className="text-sm font-medium mb-2">Other Party Details</p>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      {(claim.otherParty as any).name && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Name:</span>
                          <span className="font-medium">{String((claim.otherParty as any).name)}</span>
                        </div>
                      )}
                      {(claim.otherParty as any).vehiclePlate && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Vehicle:</span>
                          <span className="font-medium">{String((claim.otherParty as any).vehiclePlate)}</span>
                        </div>
                      )}
                      {(claim.otherParty as any).insurerName && (
                        <div className="flex justify-between col-span-2">
                          <span className="text-muted-foreground">Insurer:</span>
                          <span className="font-medium">{String((claim.otherParty as any).insurerName)}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
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
                    <span className="text-sm text-muted-foreground">Excess/Deductible</span>
                    <span className="text-sm font-medium">
                      {claim.excessAmount ? `RM ${claim.excessAmount.toLocaleString()}` : 'N/A'}
                    </span>
                  </div>
                </div>
                {claim.approvedAmount && (
                  <div className="pt-4 border-t">
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium text-green-700">Approved Payout</span>
                      <span className="text-xl font-bold text-green-700">
                        RM {claim.approvedAmount.toLocaleString()}
                      </span>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Documents */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Documents</CardTitle>
                <Badge variant="secondary">{claim.documents?.length || 0}</Badge>
              </CardHeader>
              <CardContent>
                {claim.documents && claim.documents.length > 0 ? (
                  <div className="space-y-2">
                    {claim.documents.map((doc: any) => (
                      <div key={doc.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                        <div className="flex items-center gap-3">
                          {doc.type === 'DAMAGE_PHOTO' ? (
                            <Image className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <FileText className="h-4 w-4 text-muted-foreground" />
                          )}
                          <div>
                            <p className="text-sm font-medium">{doc.filename}</p>
                            <p className="text-xs text-muted-foreground">{doc.type.replace('_', ' ')}</p>
                          </div>
                        </div>
                        <Button variant="ghost" size="sm">
                          <Download className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex items-center justify-center p-8 text-muted-foreground border-2 border-dashed rounded-lg">
                    <p className="text-sm">No documents uploaded yet.</p>
                  </div>
                )}
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
                  <span className="text-muted-foreground">Engine No:</span>
                  <span className="font-medium">{claim.vehicleEngineNumber || 'N/A'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Make/Model:</span>
                  <span className="font-medium">
                    {claim.vehicleMake} {claim.vehicleModel}
                    {!claim.vehicleMake && !claim.vehicleModel && 'N/A'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Year:</span>
                  <span className="font-medium">{claim.vehicleYear || 'N/A'}</span>
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
                <CardTitle className="flex items-center gap-2">
                  <User className="h-4 w-4" />
                  Claimant
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-3">
                  <Avatar>
                    <AvatarFallback>{getInitials(claim.claimant?.fullName || claim.claimantId)}</AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-medium text-sm">{claim.claimant?.fullName || 'Unknown'}</p>
                    <p className="text-xs text-muted-foreground">{claim.claimant?.phoneNumber || 'No phone'}</p>
                    <div className="flex flex-wrap gap-1 mt-2">
                      {claim.claimant?.kycStatus === 'VERIFIED' ? (
                        <Badge variant="success" className="text-[10px] w-fit">
                          eKYC Verified
                        </Badge>
                      ) : (
                        <Badge variant="warning" className="text-[10px] w-fit">
                          KYC {claim.claimant?.kycStatus || 'PENDING'}
                        </Badge>
                      )}
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
                {claim.siuInvestigatorId && (
                  <div className="flex items-center gap-2 p-2 bg-amber-50 border border-amber-200 rounded-lg">
                    <AlertTriangle className="h-4 w-4 text-amber-600" />
                    <span className="text-xs font-medium text-amber-700">Escalated to SIU</span>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Video Session button */}
            <Card>
              <CardHeader>
                <CardTitle>Video Session</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <Button 
                    className="w-full" 
                    onClick={handleStartVideoAssessment} 
                    disabled={createVideoRoom.isPending || isNotifying}
                  >
                    <Video className="h-4 w-4 mr-2" />
                    {(createVideoRoom.isPending || isNotifying) ? 'Starting...' : 'Start Video Assessment'}
                  </Button>
                  <p className="text-xs text-muted-foreground text-center">
                    Creates room & notifies claimant via SMS
                  </p>

                  {/* DEV ONLY: Show Magic Link */}
                  {magicLink && (
                    <div className="mt-4 p-3 bg-blue-50 border border-blue-100 rounded-lg animate-in fade-in slide-in-from-top-2">
                      <p className="text-[10px] font-bold text-blue-600 uppercase tracking-widest mb-1">
                        [DEV ONLY] Magic Link
                      </p>
                      <div className="flex gap-2">
                        <code className="text-[10px] bg-white p-1 rounded border flex-1 break-all">
                          {magicLink}
                        </code>
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="h-6 px-2 text-[10px]"
                          onClick={() => {
                            navigator.clipboard.writeText(magicLink);
                            toast({ title: 'Copied to clipboard' });
                          }}
                        >
                          Copy
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Timeline */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  Timeline
                </CardTitle>
              </CardHeader>
              <CardContent>
                {claim.sessions && claim.sessions.length > 0 ? (
                  <div className="space-y-3">
                    {claim.sessions.map((session: any) => (
                      <div key={session.id} className="flex items-start gap-3">
                        <div className="w-2 h-2 rounded-full bg-blue-500 mt-1.5" />
                        <div>
                          <p className="text-xs font-medium">
                            Video Session - {session.status}
                          </p>
                          <p className="text-[10px] text-muted-foreground">
                            {session.scheduledTime ? formatDate(session.scheduledTime) : formatDate(session.createdAt)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex items-center justify-center p-4 text-muted-foreground text-center">
                    <p className="text-xs">No timeline events yet.</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
