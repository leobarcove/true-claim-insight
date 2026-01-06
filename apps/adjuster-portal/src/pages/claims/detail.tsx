import { useState, useEffect } from 'react';
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
  Eye,
  Activity,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  formatDate,
  getInitials,
  cn,
  getDaysSince,
  formatDateTime,
  formatFileSize,
  downloadFile,
} from '@/lib/utils';
import { useClaim, useUpdateClaimStatus } from '@/hooks/use-claims';
import { useCreateVideoRoom, useSessionDeceptionScore } from '@/hooks/use-video';
import { useToast } from '@/hooks/use-toast';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import { useMemo } from 'react';

const statusConfig: Record<
  string,
  {
    label: string;
    variant: 'default' | 'secondary' | 'success' | 'warning' | 'info' | 'destructive';
  }
> = {
  SUBMITTED: { label: 'Submitted', variant: 'secondary' },
  ASSIGNED: { label: 'Assigned', variant: 'info' },
  SCHEDULED: { label: 'Scheduled', variant: 'info' },
  IN_ASSESSMENT: { label: 'In Assessment', variant: 'warning' },
  REPORT_PENDING: { label: 'Report Pending', variant: 'warning' },
  APPROVED: { label: 'Approved', variant: 'success' },
  REJECTED: { label: 'Rejected', variant: 'destructive' },
  CLOSED: { label: 'Closed', variant: 'secondary' },
};

const SessionChart = ({ sessionId, assessments }: { sessionId: string; assessments: any[] }) => {
  const { data: deception, isLoading: isDeceptionLoading } = useSessionDeceptionScore(sessionId);

  const chartData = useMemo(() => {
    if (!assessments || assessments.length === 0) return [];

    // Group assessments by creation time period (e.g., 5-second buckets)
    // to build a chronological timeline of the session metrics
    const sorted = [...assessments].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );

    // Filter to only those with scores and map to timeline points
    // We group by timestamps that are close to each other
    const timeline: any[] = [];
    let currentPoint: any = null;

    sorted.forEach(a => {
      const timeStr = new Date(a.createdAt).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });

      if (!currentPoint || currentPoint.time !== timeStr) {
        if (currentPoint) timeline.push(currentPoint);
        currentPoint = { time: timeStr, deception: 0, voice: 0, visual: 0, expression: 0 };
      }

      const score = a.riskScore === 'HIGH' ? 80 : a.riskScore === 'MEDIUM' ? 50 : 20;

      if (a.assessmentType === 'VOICE_ANALYSIS') currentPoint.voice = score;
      if (a.assessmentType === 'ATTENTION_TRACKING' || a.provider.includes('MediaPipe'))
        currentPoint.visual = score;
      if (a.provider.includes('HumeAI')) currentPoint.expression = score;

      // Weighted aggregate for the timeline deception score
      currentPoint.deception =
        (currentPoint.voice + currentPoint.visual + currentPoint.expression) / 3;
    });

    if (currentPoint) timeline.push(currentPoint);
    return timeline;
  }, [assessments]);

  if (isDeceptionLoading && !deception) {
    return (
      <div className="h-40 flex items-center justify-center text-xs text-slate-500">
        Loading metrics...
      </div>
    );
  }

  if (!assessments || assessments.length === 0) {
    return (
      <div className="h-40 flex flex-col items-center justify-center text-xs text-slate-500 bg-slate-50 rounded-lg border border-dashed">
        <Activity className="h-5 w-5 mb-2 opacity-20" />
        No risk data captured for this session.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* <div className="grid grid-cols-4 gap-2 mb-4">
        <div className="bg-slate-50 p-2 rounded border border-slate-100 text-center">
          <p className="text-[10px] text-slate-500 uppercase font-bold">Deception Score</p>
          <p className="text-sm font-bold" style={{ color: '#A855F7' }}>
            {deception?.deceptionScore ? `${(deception.deceptionScore * 100).toFixed(0)}%` : '—'}
          </p>
        </div>
        <div className="bg-slate-50 p-2 rounded border border-slate-100 text-center">
          <p className="text-[10px] text-slate-500 uppercase font-bold">Voice Stress</p>
          <p className="text-sm font-semibold" style={{ color: '#72B0F2' }}>
            {deception?.breakdown?.voiceStress
              ? `${(deception.breakdown.voiceStress * 100).toFixed(0)}%`
              : '—'}
          </p>
        </div>
        <div className="bg-slate-50 p-2 rounded border border-slate-100 text-center">
          <p className="text-[10px] text-slate-500 uppercase font-bold">Visual Behavior</p>
          <p className="text-sm font-semibold" style={{ color: '#2EE797' }}>
            {deception?.breakdown?.visualBehavior
              ? `${(deception.breakdown.visualBehavior * 100).toFixed(0)}%`
              : '—'}
          </p>
        </div>
        <div className="bg-slate-50 p-2 rounded border border-slate-100 text-center">
          <p className="text-[10px] text-slate-500 uppercase font-bold">Expression Measurement</p>
          <p className="text-sm font-semibold" style={{ color: '#E884B6' }}>
            {deception?.breakdown?.expressionMeasurement
              ? `${(deception.breakdown.expressionMeasurement * 100).toFixed(0)}%`
              : '—'}
          </p>
        </div>
      </div> */}

      <div className="h-40 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
            <XAxis
              dataKey="time"
              fontSize={9}
              tickMargin={10}
              axisLine={false}
              tickLine={false}
              hide
            />
            <YAxis hide domain={[0, 100]} />
            <Tooltip
              formatter={(value: any, name: string) => [`${parseFloat(value).toFixed(2)}%`, name]}
              contentStyle={{
                backgroundColor: '#fff',
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                fontSize: '10px',
                color: '#000',
                textAlign: 'center',
                boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
              }}
              labelStyle={{ color: '#000', fontWeight: 'bold', marginBottom: '4px' }}
              itemStyle={{ padding: '0 2px' }}
            />
            <Line
              type="monotone"
              dataKey="deception"
              stroke="#A855F7"
              strokeWidth={2}
              dot={false}
              name="Deception Score"
            />
            <Line
              type="monotone"
              dataKey="voice"
              stroke="#72B0F2"
              strokeWidth={1.5}
              dot={false}
              strokeOpacity={0.4}
              name="Voice Stress"
            />
            <Line
              type="monotone"
              dataKey="visual"
              stroke="#2EE797"
              strokeWidth={1.5}
              dot={false}
              strokeOpacity={0.4}
              name="Visual Behavior"
            />
            <Line
              type="monotone"
              dataKey="expression"
              stroke="#E884B6"
              strokeWidth={1.5}
              dot={false}
              strokeOpacity={0.4}
              name="Expression Measurement"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export function ClaimDetailPage() {
  const { id: claimId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const { data: claim, isLoading } = useClaim(claimId || '');
  const updateStatus = useUpdateClaimStatus(claimId || '');
  const createVideoRoom = useCreateVideoRoom();
  const [magicLink, setMagicLink] = useState<string | null>(null);
  const [isNotifying, setIsNotifying] = useState(false);

  const [expandedSessions, setExpandedSessions] = useState<Set<string>>(new Set());

  // Initialize expanded sessions with the most recent one
  useEffect(() => {
    if (claim?.sessions && claim.sessions.length > 0 && expandedSessions.size === 0) {
      const sorted = [...claim.sessions].sort(
        (a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      setExpandedSessions(new Set([sorted[0].id]));
    }
  }, [claim?.sessions]);

  const toggleSession = (id: string) => {
    const next = new Set(expandedSessions);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setExpandedSessions(next);
  };

  const handleUpdateStatus = async (status: string) => {
    if (!claimId) return;

    try {
      await updateStatus.mutateAsync(status as any);
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
    s => s.status === 'WAITING' || s.status === 'SCHEDULED' || s.status === 'IN_PROGRESS'
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
        description={`${claim.claimant?.fullName || claim.claimantId} • ${claim.claimType.replace(/_/g, ' ')}`}
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
            <Button
              size="sm"
              onClick={handleStartVideoAssessment}
              disabled={createVideoRoom.isPending || isNotifying}
            >
              <Video className="h-4 w-4 mr-2" />
              {createVideoRoom.isPending || isNotifying ? 'Starting...' : 'Start Video Assessment'}
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
                          <span className="font-medium">
                            {String((claim.otherParty as any).name)}
                          </span>
                        </div>
                      )}
                      {(claim.otherParty as any).vehiclePlate && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Vehicle:</span>
                          <span className="font-medium">
                            {String((claim.otherParty as any).vehiclePlate)}
                          </span>
                        </div>
                      )}
                      {(claim.otherParty as any).insurerName && (
                        <div className="flex justify-between col-span-2">
                          <span className="text-muted-foreground">Insurer:</span>
                          <span className="font-medium">
                            {String((claim.otherParty as any).insurerName)}
                          </span>
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
                    <span className="font-medium text-sm">
                      {claim.workshopName || 'Not Assigned'}
                    </span>
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
                    {claim.documents
                      .slice()
                      .sort(
                        (a: any, b: any) =>
                          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
                      )
                      .map((doc: any) => (
                        <div
                          key={doc.id}
                          className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
                        >
                          <div className="flex items-center gap-3">
                            {doc.type === 'DAMAGE_PHOTO' ? (
                              <Image className="h-4 w-4 text-muted-foreground" />
                            ) : (
                              <FileText className="h-4 w-4 text-muted-foreground" />
                            )}
                            <div>
                              <p className="text-sm font-medium">{doc.filename}</p>
                              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <span>{doc.type.replace('_', ' ')}</span>
                                <span>•</span>
                                <span>{formatFileSize(doc.fileSize)}</span>
                                <span>•</span>
                                <span>{formatDateTime(doc.createdAt)}</span>
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0"
                              title="View document"
                              onClick={() => {
                                if (doc.storageUrl) {
                                  window.open(doc.storageUrl, '_blank');
                                }
                              }}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0"
                              title="Download document"
                              onClick={() => {
                                if (doc.storageUrl) {
                                  downloadFile(doc.storageUrl, doc.filename);
                                }
                              }}
                            >
                              <Download className="h-4 w-4" />
                            </Button>
                          </div>
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

            {/* Timeline (Sessions Analysis) */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-5 w-5" />
                  Timeline
                </CardTitle>
                <span className="text-xs text-muted-foreground">Historical Analysis</span>
              </CardHeader>

              <CardContent className="space-y-8">
                {claim.sessions && claim.sessions.length > 0 ? (
                  [...claim.sessions]
                    .sort(
                      (a: any, b: any) =>
                        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
                    )
                    .map((session: any) => (
                      <div
                        key={session.id}
                        className="space-y-4 border-b pb-8 last:border-0 last:pb-0"
                      >
                        <div
                          className="flex items-center justify-between cursor-pointer group"
                          onClick={() => toggleSession(session.id)}
                        >
                          <div className="flex items-center gap-2">
                            <div
                              className={cn(
                                'w-2 h-2 rounded-full',
                                session.status === 'COMPLETED' ? 'bg-emerald-500' : 'bg-blue-500'
                              )}
                            />
                            <h4 className="text-sm font-semibold transition-colors">
                              Session: {formatDateTime(session.createdAt)}
                            </h4>
                          </div>
                          <div className="flex items-center gap-3">
                            <Badge
                              variant={session.status === 'COMPLETED' ? 'default' : 'secondary'}
                              className="text-[10px]"
                            >
                              {session.status}
                            </Badge>
                            {expandedSessions.has(session.id) ? (
                              <ChevronUp className="h-4 w-4 text-slate-400" />
                            ) : (
                              <ChevronDown className="h-4 w-4 text-slate-400" />
                            )}
                          </div>
                        </div>

                        {expandedSessions.has(session.id) && (
                          <div className="animate-in fade-in slide-in-from-top-2 duration-300">
                            <SessionChart
                              sessionId={session.id}
                              assessments={session.riskAssessments || []}
                            />
                          </div>
                        )}
                      </div>
                    ))
                ) : (
                  <div className="flex flex-col items-center justify-center py-12 text-muted-foreground border-2 border-dashed rounded-lg">
                    <Activity className="h-8 w-8 mb-2 opacity-20" />
                    <p className="text-sm">No analysis sessions found for this claim.</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
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
                    {createVideoRoom.isPending || isNotifying
                      ? 'Starting...'
                      : 'Start Video Assessment'}
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
              </CardContent>
            </Card>

            {/* SLA Status */}
            <Card
              className={cn(
                'border-l-4',
                getDaysSince(claim.createdAt) > 7 ? 'border-l-destructive' : 'border-l-success'
              )}
            >
              <CardContent className="pt-6">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">SLA Status (BNM)</span>
                  <Badge variant={getDaysSince(claim.createdAt) > 7 ? 'destructive' : 'success'}>
                    {getDaysSince(claim.createdAt)} Days Active
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {getDaysSince(claim.createdAt) > 7
                    ? 'SLA breach: Recommended TAT is 7 working days for acknowledgement.'
                    : 'Within recommended turnaround time.'}
                </p>
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
                    <AvatarFallback>
                      {getInitials(claim.claimant?.fullName || claim.claimantId)}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-medium text-sm">{claim.claimant?.fullName || 'Unknown'}</p>
                    <p className="text-xs text-muted-foreground">
                      {claim.claimant?.phoneNumber || 'No phone'}
                    </p>
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
                        <Badge
                          variant="info"
                          className="text-[10px] w-fit bg-blue-100 text-blue-700 hover:bg-blue-100 border-none"
                        >
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
                  <span className="font-medium text-uppercase">
                    {claim.vehicleChassisNumber || 'N/A'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Engine No:</span>
                  <span className="font-medium text-uppercase">
                    {claim.vehicleEngineNumber || 'N/A'}
                  </span>
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
          </div>
        </div>
      </div>
    </div>
  );
}
