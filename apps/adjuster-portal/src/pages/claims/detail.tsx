import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Video,
  Car,
  FileText,
  AlertTriangle,
  Download,
  Image,
  User,
  Eye,
  Activity,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  Upload,
  Loader2,
  Play,
  ExternalLink,
  Brain,
} from 'lucide-react';

import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ConfirmationDialog } from '@/components/ui/confirmation-dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import {
  formatDate,
  getInitials,
  cn,
  formatDateTime,
  formatFileSize,
  downloadFile,
  convertToTitleCase,
} from '@/lib/utils';
import { useClaim, useUpdateClaimStatus } from '@/hooks/use-claims';
import { useTriggerTrinityCheck } from '@/hooks/use-trinity';
import { useCreateVideoRoom, useSessionDeceptionScore } from '@/hooks/use-video';
import { useToast } from '@/hooks/use-toast';
import { InfoTooltip } from '@/components/ui/tooltip';
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

const SessionChart = ({
  sessionId,
  deceptionData,
  summary,
}: {
  sessionId: string;
  deceptionData: any[];
  summary?: any;
}) => {
  const { data: remoteSummary, isLoading: isDeceptionLoading } = useSessionDeceptionScore(
    sessionId,
    !summary // Only enable query if summary is missing
  );

  const deception = summary || remoteSummary;

  const chartData = useMemo(() => {
    if (!deceptionData || deceptionData.length === 0) return [];

    return [...deceptionData]
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
      .map(d => ({
        time: new Date(d.createdAt).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        }),
        deception: d.deception,
        voice: d.voice,
        visual: d.visual,
        expression: d.expression,
      }));
  }, [deceptionData]);

  if (isDeceptionLoading && !deception) {
    return (
      <div className="h-40 flex items-center justify-center text-xs text-slate-500">
        Loading metrics...
      </div>
    );
  }

  if (!deceptionData || deceptionData.length === 0) {
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
  const triggerTrinity = useTriggerTrinityCheck();
  const [isTrinityConfirmOpen, setIsTrinityConfirmOpen] = useState(false);

  const [expandedSessions, setExpandedSessions] = useState<Set<string>>(new Set());

  // Pagination states
  const [docPage, setDocPage] = useState(1);
  const [timelinePage, setTimelinePage] = useState(1);
  const ITEMS_PER_PAGE = 5;

  const [modifier, setModifier] = useState<string>('Ctrl');

  // Detect OS for modifier key
  useEffect(() => {
    if (typeof window !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform)) {
      setModifier('⌘');
    } else {
      setModifier('Ctrl');
    }
  }, []);

  // Reset pagination when claim changes
  useEffect(() => {
    setDocPage(1);
    setTimelinePage(1);
  }, [claimId]);

  // Shortcut key controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Check if Ctrl or Command key is pressed
      if (e.ctrlKey || e.metaKey) {
        if (e.key === 'Enter') {
          e.preventDefault();
          if (claim?.status !== 'APPROVED' && claim?.status !== 'REJECTED') {
            handleUpdateStatus('APPROVED');
          }
        } else if (e.key === 'Backspace') {
          e.preventDefault();
          if (claim?.status !== 'APPROVED' && claim?.status !== 'REJECTED') {
            handleUpdateStatus('REJECTED');
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [claim?.status, claimId]);

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
    if (!claimId || updateStatus.isPending) return;

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
        title: 'Live Session Started',
        description: 'Magic link copied to clipboard! Joining video room...',
      });

      // Small delay to show the magic link before navigating
      await new Promise(resolve => setTimeout(resolve, 500));

      // Navigate adjuster to video call
      navigate(`/video/${sessionId}`);
    } catch (error: any) {
      toast({
        title: 'Error',
        description: 'Failed to start live session. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsNotifying(false);
    }
  };

  const handleTriggerTrinity = async () => {
    if (!claimId || triggerTrinity.isPending) return;

    try {
      await triggerTrinity.mutateAsync(claimId);
      setIsTrinityConfirmOpen(false);
      toast({
        title: 'Analysis Triggered',
        description: 'AI extraction and cross-check analysis have been queued for all documents.',
      });
    } catch (error: any) {
      toast({
        title: 'Trigger Failed',
        description: error.response?.data?.message || 'Failed to trigger document analysis.',
        variant: 'destructive',
      });
    }
  };

  if (isLoading || !claim) {
    return (
      <div className="flex flex-col h-full space-y-6 p-6">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-64" />
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-9 w-24" />
            <Skeleton className="h-9 w-24" />
          </div>
        </div>
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-6">
            <Skeleton className="h-64 w-full" />
            <Skeleton className="h-48 w-full" />
            <Skeleton className="h-48 w-full" />
          </div>
          <div className="space-y-6">
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-96 w-full" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <Header
        title={
          <span className="flex items-center gap-3">
            {claim.claimNumber}
            <Badge variant={statusConfig[claim.status].variant}>
              {convertToTitleCase(statusConfig[claim.status].label)}
            </Badge>
          </span>
        }
        description={`${claim.claimant?.fullName || claim.claimantId} • ${convertToTitleCase(claim.claimType)}`}
      >
        <div className="flex items-center gap-3">
          <Button
            size="sm"
            className="bg-emerald-600 hover:bg-emerald-700 h-10 px-4 flex-col items-center justify-center min-w-[120px]"
            onClick={() => handleUpdateStatus('APPROVED')}
            disabled={
              claim.status === 'APPROVED' || claim.status === 'REJECTED' || updateStatus.isPending
            }
          >
            {updateStatus.isPending && updateStatus.variables === 'APPROVED' ? (
              <div className="flex items-center gap-2">
                <Loader2 className="h-3 w-3 animate-spin" />
                <span className="font-bold">Approving...</span>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <span className="font-bold">Approve</span>
                </div>
                <span className="text-[9px] opacity-80 font-normal leading-none font-mono tracking-tight">
                  {modifier} + Enter
                </span>
              </>
            )}
          </Button>

          <Button
            variant="destructive"
            size="sm"
            className="h-10 px-4 flex-col items-center justify-center min-w-[120px]"
            onClick={() => handleUpdateStatus('REJECTED')}
            disabled={
              claim.status === 'APPROVED' || claim.status === 'REJECTED' || updateStatus.isPending
            }
          >
            {updateStatus.isPending && updateStatus.variables === 'REJECTED' ? (
              <div className="flex items-center gap-2">
                <Loader2 className="h-3 w-3 animate-spin" />
                <span className="font-bold">Rejecting...</span>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <span className="font-bold">Reject</span>
                </div>
                <span className="text-[9px] opacity-80 font-normal leading-none font-mono tracking-tight">
                  {modifier} + Backspace
                </span>
              </>
            )}
          </Button>
        </div>
      </Header>

      <div className="flex-1 overflow-auto p-6">
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Incident Details */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-3">
                <CardTitle>Incident Details</CardTitle>
                <span className="text-xs text-muted-foreground">
                  Updated: {formatDate(claim.updatedAt)}
                </span>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="flex items-start gap-3">
                    <div>
                      <p className="text-xs font-medium">Incident Date</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(claim.incidentDate)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div>
                      <p className="text-xs font-medium">Location</p>
                      <p className="text-xs text-muted-foreground">
                        {claim.incidentLocation.address}
                      </p>
                    </div>
                  </div>
                </div>
                <p className="text-sm">{claim.description}</p>

                {/* Police Report */}
                {claim.policeReportDate && (
                  <div className="pt-4 border-t">
                    <div className="flex flex-row items-center justify-between">
                      <p className="text-lg font-medium mb-2">Police Report</p>
                      <span className="text-xs text-muted-foreground mb-3">
                        Reported: {formatDate(claim.updatedAt)}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div className="flex flex-col justify-between">
                        <span className="text-xs font-medium">Report Number:</span>
                        <span className="text-xs text-muted-foreground">
                          {claim?.policeReportNumber || 'N/A'}
                        </span>
                      </div>
                      <div className="flex flex-col justify-between">
                        <span className="text-xs font-medium">Police Station:</span>
                        <span className="text-xs text-muted-foreground">
                          {claim?.policeStation || 'N/A'}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Other Party Details (for TPPD claims) */}
                {claim.otherParty && Object.keys(claim.otherParty).length > 0 && (
                  <div className="pt-4 border-t">
                    <p className="text-sm font-medium mb-2">Other Party Details</p>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      {(claim.otherParty as any).name && (
                        <div className="flex justify-between">
                          <span className="text-xs font-medium">Name:</span>
                          <span className="text-xs text-muted-foreground">
                            {String((claim.otherParty as any).name)}
                          </span>
                        </div>
                      )}
                      {(claim.otherParty as any).vehiclePlate && (
                        <div className="flex justify-between">
                          <span className="text-xs font-medium">Vehicle:</span>
                          <span className="text-xs text-muted-foreground">
                            {String((claim.otherParty as any).vehiclePlate)}
                          </span>
                        </div>
                      )}
                      {(claim.otherParty as any).insurerName && (
                        <div className="flex justify-between col-span-2">
                          <span className="text-xs font-medium">Insurer:</span>
                          <span className="text-xs text-muted-foreground">
                            {String((claim.otherParty as any).insurerName)}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Financials (New: Compliance) */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">Financials & Estimates</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-1">
                    <p className="text-sm font-medium">Estimated Loss</p>
                    <p className="text-xl font-bold">
                      {claim.estimatedLossAmount
                        ? `RM ${claim.estimatedLossAmount.toLocaleString()}`
                        : 'Pending'}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-medium">Repair Cost (Final)</p>
                    <p className="text-xl font-bold text-muted-foreground">
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
                <CardTitle className="flex items-center gap-2">
                  Documents
                  <InfoTooltip
                    content="View"
                    direction="top"
                    fontSize="text-[11px]"
                    trigger={
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7"
                        onClick={() => navigate(`/documents/${claimId}`)}
                      >
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                    }
                  />
                </CardTitle>
                <div className="flex items-center gap-2">
                  {claim.documents && claim.documents.length > 0 && (
                    <InfoTooltip
                      content="Rerun Analysis"
                      direction="top"
                      fontSize="text-[11px]"
                      trigger={
                        <Button
                          variant="ghost"
                          size="sm"
                          className={cn(
                            'h-6 w-6 p-0 rounded-full bg-muted hover:bg-emerald-50 hover:text-primary transition-colors',
                            triggerTrinity.isPending && 'animate-pulse text-primary bg-emerald-50'
                          )}
                          onClick={e => {
                            e.stopPropagation();
                            setIsTrinityConfirmOpen(true);
                          }}
                          disabled={triggerTrinity.isPending}
                        >
                          {triggerTrinity.isPending ? (
                            <Loader2 className="h-2.5 w-2.5 animate-spin" />
                          ) : (
                            <Play className="h-2.5 w-2.5 fill-current" />
                          )}
                        </Button>
                      }
                    />
                  )}
                  {claim.trinityChecks && claim.trinityChecks.length > 0 && (
                    <InfoTooltip
                      content={
                        <div className="space-y-2 max-w-[450px]">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-base">True Claim Intelligence</span>
                            <Badge
                              variant={
                                claim.trinityChecks[0].score > 70
                                  ? 'destructive'
                                  : claim.trinityChecks[0].score > 30
                                    ? 'warning'
                                    : 'success'
                              }
                            >
                              {claim.trinityChecks[0].score || 0}%
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {(claim.trinityChecks[0] as any)?.reasoning ||
                              'No detailed reasoning available.'}
                          </p>
                        </div>
                      }
                      direction="top"
                      fontSize="text-[11px]"
                      trigger={
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0 rounded-full bg-muted hover:bg-emerald-50 text-emerald-600 hover:text-primary transition-colors"
                          onClick={() => navigate(`/documents/${claimId}`)}
                        >
                          <Brain className="h-4 w-4" />
                        </Button>
                      }
                    />
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {claim.documents && claim.documents.length > 0 ? (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      {claim.documents
                        .slice()
                        .sort(
                          (a: any, b: any) =>
                            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
                        )
                        .slice((docPage - 1) * ITEMS_PER_PAGE, docPage * ITEMS_PER_PAGE)
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
                                  <span>{doc.type.replace(/_/gi, ' ')}</span>
                                  <span>•</span>
                                  <span>{formatFileSize(doc.fileSize)}</span>
                                  <span>•</span>
                                  <span>{formatDateTime(doc.createdAt)}</span>
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-1">
                              <InfoTooltip
                                content="View"
                                direction="top"
                                fontSize="text-[11px]"
                                trigger={
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 w-8 p-0"
                                    onClick={() => {
                                      if (doc.storageUrl) {
                                        window.open(doc.storageUrl, '_blank');
                                      }
                                    }}
                                  >
                                    <Eye className="h-4 w-4" />
                                  </Button>
                                }
                              />
                              <InfoTooltip
                                content="Download"
                                direction="top"
                                fontSize="text-[11px]"
                                trigger={
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 w-8 p-0"
                                    onClick={() => {
                                      if (doc.storageUrl) {
                                        downloadFile(doc.storageUrl, doc.filename);
                                      }
                                    }}
                                  >
                                    <Download className="h-4 w-4" />
                                  </Button>
                                }
                              />
                            </div>
                          </div>
                        ))}
                    </div>

                    {/* Documents Pagination Controls */}
                    {claim.documents.length > ITEMS_PER_PAGE && (
                      <div className="flex items-center justify-center gap-3 pt-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 w-8 p-0"
                          onClick={() => setDocPage(p => Math.max(1, p - 1))}
                          disabled={docPage === 1}
                        >
                          <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <span className="text-xs text-muted-foreground font-medium">
                          Page {docPage} of{' '}
                          {Math.ceil((claim.documents?.length || 0) / ITEMS_PER_PAGE)}
                        </span>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 w-8 p-0"
                          onClick={() =>
                            setDocPage(p =>
                              Math.min(
                                Math.ceil((claim.documents?.length || 0) / ITEMS_PER_PAGE),
                                p + 1
                              )
                            )
                          }
                          disabled={
                            docPage >= Math.ceil((claim.documents?.length || 0) / ITEMS_PER_PAGE)
                          }
                        >
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
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
                  Timeline
                  <InfoTooltip
                    content="View"
                    direction="top"
                    fontSize="text-[11px]"
                    trigger={
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7"
                        onClick={() => navigate(`/sessions`)}
                      >
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                    }
                  />
                </CardTitle>
                <InfoTooltip
                  title="Metrics Analysis"
                  direction="top"
                  variant="light"
                  iconSize={4}
                  fontSize="text-xs"
                  className="scale-110 mt-1"
                  contentClassName="max-w-[450px]"
                  content={
                    <div className="flex gap-8 items-start">
                      <section className="flex-1 space-y-3 p-2">
                        <p className="text-muted-foreground font-medium mb-3">
                          This section shows a timeline of past sessions with their deception
                          metrics.
                        </p>
                        <ul className="space-y-2.5 mt-2 text-muted-foreground">
                          <li>
                            <strong className="text-foreground block mb-0.5">Voice Stress</strong>
                            Analyzes vocal patterns that may indicate stress, tension, or emotional
                            load during speech. The scoring is calculated by normalizing
                            measurements against industry baselines:
                            <div className="space-y-3 font-mono text-[11px] bg-muted p-3 rounded-lg border border-border shadow-sm text-foreground/80 leading-relaxed pt-1 pb-3">
                              <p className="mt-2 text-primary font-semibold">
                                Score = (0.25×Jitter + 0.25×Shimmer + 0.2×PitchSD + 0.1×HNR)²
                              </p>
                            </div>
                          </li>
                          <li>
                            <strong className="text-foreground block mb-0.5">
                              Visual Behavior:
                            </strong>
                            Tracks facial and eye-related behaviors that can reflect attention,
                            comfort, or cognitive effort. The scoring is calculated by aggregate
                            risk points:
                            <div className="space-y-3 font-mono text-[11px] bg-muted p-3 rounded-lg border border-border shadow-sm text-foreground/80 leading-relaxed pt-1 pb-3">
                              <p className="mt-2 text-primary font-semibold">
                                Score = BlinkRateDev(40%) + LipTension(40%) + BlinkDurDev(20%)
                              </p>
                            </div>
                          </li>
                          <li>
                            <strong className="text-foreground block mb-0.5">
                              Expression Measurement:
                            </strong>
                            Detects emotional and cognitive states based on facial expressions. The
                            scoring is calculated by peak fraud-linked emotion with baseline
                            correction:
                            <div className="space-y-3 font-mono text-[11px] bg-muted p-3 rounded-lg border border-border shadow-sm text-foreground/80 leading-relaxed pt-1 pb-3">
                              <p className="mt-2 text-primary font-semibold">
                                Score = Max(FraudEmotions) - 10% Noise Threshold
                              </p>
                            </div>
                          </li>
                        </ul>

                        <div className="pt-2 mt-5 border-t border-border">
                          <p className="text-foreground leading-normal">
                            The <span className="font-semibold">Deception Score</span> is the
                            balanced average of the three pillars above, with each category weighted
                            equally at one-third.
                          </p>
                        </div>
                      </section>
                    </div>
                  }
                />
              </CardHeader>

              <CardContent className="space-y-8">
                {claim.sessions && claim.sessions.length > 0 ? (
                  <div className="space-y-6">
                    <div className="space-y-8">
                      {/* Sort and paginate sessions */}
                      {[...claim.sessions]
                        .sort(
                          (a: any, b: any) =>
                            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
                        )
                        .slice((timelinePage - 1) * ITEMS_PER_PAGE, timelinePage * ITEMS_PER_PAGE)
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
                                    session.status === 'COMPLETED'
                                      ? 'bg-emerald-500'
                                      : 'bg-blue-500'
                                  )}
                                />
                                <h4 className="text-sm font-semibold transition-colors">
                                  Session: {formatDateTime(session.createdAt)}
                                </h4>
                              </div>
                              <div className="flex items-center gap-3">
                                <Badge
                                  variant="outline"
                                  className={cn(
                                    'text-[10px]',
                                    session.roomUrl
                                      ? 'border-indigo-200 bg-indigo-50 text-indigo-700'
                                      : 'border-slate-200 bg-slate-50 text-slate-600'
                                  )}
                                >
                                  {session.roomUrl ? 'Live' : 'Upload'}
                                </Badge>
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
                                  deceptionData={session.deceptionData || []}
                                  summary={session.summary}
                                />
                              </div>
                            )}
                          </div>
                        ))}
                    </div>

                    {/* Timeline Pagination Controls */}
                    {claim.sessions.length > ITEMS_PER_PAGE && (
                      <div className="flex items-center justify-center gap-3 pt-4 border-t">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 w-8 p-0"
                          onClick={() => setTimelinePage(p => Math.max(1, p - 1))}
                          disabled={timelinePage === 1}
                        >
                          <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <span className="text-xs text-muted-foreground font-medium">
                          Page {timelinePage} of{' '}
                          {Math.ceil((claim.sessions?.length || 0) / ITEMS_PER_PAGE)}
                        </span>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 w-8 p-0"
                          onClick={() =>
                            setTimelinePage(p =>
                              Math.min(
                                Math.ceil((claim.sessions?.length || 0) / ITEMS_PER_PAGE),
                                p + 1
                              )
                            )
                          }
                          disabled={
                            timelinePage >=
                            Math.ceil((claim.sessions?.length || 0) / ITEMS_PER_PAGE)
                          }
                        >
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </div>
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
            {/* Session button */}
            <Card>
              <CardHeader>
                <CardTitle>Session</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <Button
                    className="w-full"
                    onClick={handleStartVideoAssessment}
                    disabled={
                      createVideoRoom.isPending ||
                      isNotifying ||
                      claim.status === 'APPROVED' ||
                      claim.status === 'REJECTED'
                    }
                  >
                    <Video className="h-4 w-4 mr-2" />
                    {createVideoRoom.isPending || isNotifying
                      ? 'Starting...'
                      : 'Start Live Session'}
                  </Button>

                  <Button
                    className="w-full"
                    variant="outline"
                    onClick={() => navigate(`/claims/${claimId}/upload-video`)}
                    disabled={claim.status === 'APPROVED' || claim.status === 'REJECTED'}
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    Manual Upload
                  </Button>

                  <p className="text-xs text-muted-foreground text-center mt-5">
                    Creates room and notifies claimant via SMS
                  </p>

                  {/* DEV ONLY: Show Magic Link */}
                  {/* {magicLink && (
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
                  )} */}
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

            {/* Policy Information */}
            <Card>
              <CardHeader className="py-4">
                <CardTitle className="text-base flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Policy Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Policy No:</span>
                  <span className="font-medium">{claim.policyNumber || 'N/A'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Policy Type:</span>
                  <span className="font-medium text-uppercase">
                    {convertToTitleCase(claim.claimType)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Sum Insured:</span>
                  <span className="font-medium text-uppercase">
                    {claim.sumInsured ? `RM ${claim.sumInsured.toLocaleString()}` : 'N/A'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">NCD Rate:</span>
                  <span className="font-medium">
                    {claim.ncdRate ? `${(claim.ncdRate * 100).toFixed(0)}%` : 'N/A'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Panel Workshop:</span>
                  <span className="font-medium">{claim.workshopName || 'Not Assigned'}</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      <ConfirmationDialog
        open={isTrinityConfirmOpen}
        onOpenChange={setIsTrinityConfirmOpen}
        title="Rerun Trinity Analysis"
        description="This will re-trigger AI extraction and cross-check analysis for all documents in this claim. This process may take a minute. Are you sure you want to proceed?"
        confirmText="Confirm"
        onConfirm={handleTriggerTrinity}
        isLoading={triggerTrinity.isPending}
      />
    </div>
  );
}
