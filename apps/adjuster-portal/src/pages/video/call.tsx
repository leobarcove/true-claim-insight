import { useParams, useNavigate } from 'react-router-dom';
import { useState, useEffect, useRef, useCallback, useMemo, memo } from 'react';
import {
  ArrowLeft,
  Maximize2,
  XCircle,
  AlertCircle,
  RefreshCw,
  Camera,
  ChevronLeft,
  ChevronRight,
  X,
} from 'lucide-react';
import { format } from 'date-fns';
import { DailyVideoPlayer, DailyVideoPlayerRef } from '@tci/ui-components';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import {
  useVideoSession,
  useJoinVideoRoom,
  useEndVideoSession,
  useRiskAssessments,
  useAnalyzeExpression,
  useAnalyzeVisualBehavior,
  RiskAssessment,
} from '@/hooks/use-video';
import { Header } from '@/components/layout/header';
import { useClaim, claimKeys } from '@/hooks/use-claims';
import { useAuthStore } from '@/stores/auth-store';
import { useToast } from '@/hooks/use-toast';
import { ShieldAlert, ShieldCheck, ShieldMinus, Zap, Activity } from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { Switch } from '@/components/ui/switch';
import { InfoTooltip } from '@/components/ui/tooltip';

const DEFAULT_EMOTIONS = [
  'Admiration',
  'Adoration',
  'Aesthetic Appreciation',
  'Amusement',
  'Anger',
  'Anxiety',
  'Awe',
  'Awkwardness',
  'Boredom',
  'Calmness',
  'Concentration',
  'Contemplation',
  'Confusion',
  'Contempt',
  'Contentment',
  'Craving',
  'Determination',
  'Disappointment',
  'Disgust',
  'Distress',
  'Doubt',
  'Ecstasy',
  'Embarrassment',
  'Empathic Pain',
  'Entrancement',
  'Envy',
  'Excitement',
  'Fear',
  'Guilt',
  'Horror',
  'Interest',
  'Joy',
  'Love',
  'Nostalgia',
  'Pain',
  'Pride',
  'Realization',
  'Relief',
  'Romance',
  'Sadness',
  'Satisfaction',
  'Desire',
  'Shame',
  'Surprise (negative)',
  'Surprise (positive)',
  'Sympathy',
  'Tiredness',
  'Triumph',
];

interface RiskAssessmentCardProps {
  title: string;
  data: RiskAssessment | undefined;
  type: 'voice' | 'visual' | 'emotion';
  tooltip?: string;
}

const RiskAssessmentCard = memo(({ title, data, type, tooltip }: RiskAssessmentCardProps) => {
  const marker = data;
  const raw = marker?.rawResponse as any;

  const topEmotions = useMemo(() => {
    if (type !== 'emotion') return [];

    const provided = raw?.top_emotions ?? [];
    const used = new Set(provided.map((e: any) => e.name));
    return [
      ...provided,
      ...DEFAULT_EMOTIONS.filter(n => !used.has(n))
        .sort(() => 0.5 - Math.random())
        .slice(0, 4 - provided.length)
        .map((name: string) => ({ name, score: null })),
    ].slice(0, 4);
  }, [type, raw?.top_emotions]);

  return (
    <div className="p-2 rounded-lg bg-muted/50 border border-border animate-in fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {marker?.riskScore === 'HIGH' ? (
            <ShieldAlert className="h-4 w-4 text-red-500" />
          ) : marker?.riskScore === 'MEDIUM' ? (
            <ShieldMinus className="h-4 w-4 text-amber-500" />
          ) : marker?.riskScore === 'LOW' ? (
            <ShieldCheck className="h-4 w-4 text-blue-500" />
          ) : (
            <Activity className="h-4 w-4 text-muted-foreground opacity-50" />
          )}
          <span className="text-xs font-semibold">{title}</span>
          {tooltip && (
            <InfoTooltip
              title={title}
              content={tooltip}
              direction="left"
              fontSize="text-[11px]"
              contentClassName="min-w-[450px]"
            />
          )}
        </div>
        {marker && (
          <Badge
            variant={
              marker.riskScore === 'HIGH'
                ? 'destructive'
                : marker.riskScore === 'MEDIUM'
                  ? 'secondary'
                  : 'default'
            }
            className="text-[9px] h-5 px-2"
          >
            {marker.riskScore || 'PENDING'}
          </Badge>
        )}
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 gap-2 text-[10px]">
        {type === 'voice' && (
          <>
            <div className="bg-card/50 rounded p-2">
              <p className="text-muted-foreground uppercase font-bold text-[9px]">Jitter</p>
              <p
                className={`text-sm font-mono ${(raw?.jitter_percent ?? 0) > 1.5 ? 'text-red-400' : 'text-foreground'}`}
              >
                {raw?.jitter_percent !== undefined ? `${raw.jitter_percent.toFixed(2)}%` : '—'}
              </p>
            </div>
            <div className="bg-card/50 rounded p-2">
              <p className="text-muted-foreground uppercase font-bold text-[9px]">Shimmer</p>
              <p
                className={`text-sm font-mono ${(raw?.shimmer_percent ?? 0) > 3 ? 'text-amber-400' : 'text-foreground'}`}
              >
                {raw?.shimmer_percent !== undefined ? `${raw.shimmer_percent.toFixed(2)}%` : '—'}
              </p>
            </div>
            <div className="bg-card/50 rounded p-2">
              <p className="text-muted-foreground uppercase font-bold text-[9px]">Pitch SD</p>
              <p
                className={`text-sm font-mono ${(raw?.pitch_sd_hz ?? 0) > 40 ? 'text-amber-400' : 'text-foreground'}`}
              >
                {raw?.pitch_sd_hz !== undefined ? `${raw.pitch_sd_hz.toFixed(1)} Hz` : '—'}
              </p>
            </div>
            <div className="bg-card/50 rounded p-2">
              <p className="text-muted-foreground uppercase font-bold text-[9px]">HNR</p>
              <p className="text-sm font-mono text-foreground">
                {raw?.hnr_db !== undefined ? `${raw.hnr_db.toFixed(1)} dB` : '—'}
              </p>
            </div>
          </>
        )}

        {type === 'visual' && (
          <>
            <div className="bg-card/50 rounded p-2">
              <p className="text-muted-foreground uppercase font-bold text-[9px]">Blink Rate</p>
              <p
                className={`text-sm font-mono ${
                  raw?.blink_rate_per_min !== undefined &&
                  (raw.blink_rate_per_min < 10 || raw.blink_rate_per_min > 25)
                    ? 'text-amber-400'
                    : 'text-foreground'
                }`}
              >
                {raw?.blink_rate_per_min !== undefined
                  ? `${raw.blink_rate_per_min.toFixed(1)}/min`
                  : '—'}
              </p>
            </div>
            <div className="bg-card/50 rounded p-2">
              <p className="text-muted-foreground uppercase font-bold text-[9px]">Lip Tension</p>
              <p
                className={`text-sm font-mono ${raw?.avg_lip_tension !== undefined && raw.avg_lip_tension < 0.7 ? 'text-amber-400' : 'text-foreground'}`}
              >
                {raw?.avg_lip_tension !== undefined ? raw.avg_lip_tension.toFixed(3) : '—'}
              </p>
            </div>
            <div className="bg-card/50 rounded p-2">
              <p className="text-muted-foreground uppercase font-bold text-[9px]">Blink Dur.</p>
              <p className="text-sm font-mono text-foreground">
                {raw?.avg_blink_duration_ms !== undefined
                  ? `${raw.avg_blink_duration_ms.toFixed(0)} ms`
                  : '—'}
              </p>
            </div>
            <div className="bg-card/50 rounded p-2">
              <p className="text-muted-foreground uppercase font-bold text-[9px]">Frames</p>
              <p className="text-sm font-mono text-foreground">
                {raw?.frames_analyzed !== undefined ? raw.frames_analyzed : '—'}
              </p>
            </div>
          </>
        )}

        {type === 'emotion' && (
          <>
            {topEmotions.map((emotion: any, idx: number) => (
              <div key={idx} className="bg-card/50 rounded p-2">
                <p className="text-muted-foreground uppercase font-bold text-[9px]">
                  {emotion.name}
                </p>
                <p className="text-sm font-mono text-foreground">
                  {emotion.score !== null && emotion.score !== undefined
                    ? `${(emotion.score * 100).toFixed(1)}%`
                    : '—'}
                </p>
              </div>
            ))}
          </>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between mt-2 pt-2 border-t border-border/50">
        <span className="text-[9px] text-muted-foreground">
          {marker?.provider
            ? `Conf: ${((marker.confidence ?? 0) * 100).toFixed(0)}%`
            : 'Awaiting Data...'}
        </span>
      </div>
    </div>
  );
});

export function VideoCallPage() {
  const { id: claimId, sessionId } = useParams<{ id: string; sessionId: string }>();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const playerRef = useRef<DailyVideoPlayerRef>(null);

  const [joinData, setJoinData] = useState<{ url: string; token: string } | null>(null);
  const [joinError, setJoinError] = useState<string | null>(null);
  const hasAttemptedJoin = useRef(false);

  const { data: session } = useVideoSession(sessionId || '');
  const { data: claim, isLoading: isClaimLoading } = useClaim(claimId || '');
  const { data: assessments } = useRiskAssessments(sessionId || '');

  const joinRoom = useJoinVideoRoom();
  const endSession = useEndVideoSession(sessionId || '');

  const analyzeExpression = useAnalyzeExpression();
  const analyzeVisualBehavior = useAnalyzeVisualBehavior();

  // Ref to prevent navigation during analysis
  const isAnalyzingRef = useRef(false);

  const [analysisMode, setAnalysisMode] = useState<'manual' | 'auto' | 'off'>('off');
  const [isJoined, setIsJoined] = useState(false);
  const [isClaimantInRoom, setIsClaimantInRoom] = useState(false);
  const [isScreenshotting, setIsScreenshotting] = useState(false);
  const [metricsHistory, setMetricsHistory] = useState<any[]>([]);

  // Screenshot Gallery state
  const [screenshotIndex, setScreenshotIndex] = useState(0);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  const screenshots = useMemo(() => {
    return (
      claim?.documents
        ?.filter((d: any) => d.type === 'CLAIMANT_SCREENSHOT')
        ?.sort((a: any, b: any) => {
          const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return dateB - dateA;
        }) || []
    );
  }, [claim?.documents]);

  const handleNextScreenshot = useCallback(() => {
    if (screenshots.length === 0) return;
    setScreenshotIndex(prev => (prev + 1) % screenshots.length);
  }, [screenshots.length]);

  const handlePrevScreenshot = useCallback(() => {
    if (screenshots.length === 0) return;
    setScreenshotIndex(prev => (prev - 1 + screenshots.length) % screenshots.length);
  }, [screenshots.length]);

  // Reset index if screenshots change to empty or out of bounds
  useEffect(() => {
    if (screenshots.length > 0 && screenshotIndex >= screenshots.length) {
      setScreenshotIndex(0);
    }
  }, [screenshots.length, screenshotIndex]);

  // Modal keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!previewImage) return;

      if (e.key === 'Escape') setPreviewImage(null);
      if (e.key === 'ArrowRight') handleNextScreenshot();
      if (e.key === 'ArrowLeft') handlePrevScreenshot();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [previewImage, handleNextScreenshot, handlePrevScreenshot]);

  // Deception Score Query
  const { data: deceptionData, refetch: refetchDeception } = useQuery({
    queryKey: ['deception-score', sessionId],
    queryFn: async () => {
      const { data: response } = await apiClient.get(`/risk/session/${sessionId}/deception-score`);
      return response.data;
    },
    enabled: !!sessionId && isJoined && analysisMode !== 'off' && isClaimantInRoom,
  });

  // Update history when new data arrives
  useEffect(() => {
    if (deceptionData) {
      setMetricsHistory(prev => {
        const newPoint = {
          time: new Date().toLocaleTimeString(),
          deception: ((deceptionData.deceptionScore || 0) * 100).toFixed(2),
          voice: ((deceptionData.breakdown?.voiceStress || 0) * 100).toFixed(2),
          visual: ((deceptionData.breakdown?.visualBehavior || 0) * 100).toFixed(2),
          expression: ((deceptionData.breakdown?.expressionMeasurement || 0) * 100).toFixed(2),
        };
        const newHistory = [...prev, newPoint];
        if (newHistory.length > 20) return newHistory.slice(newHistory.length - 20); // Keep last 20
        return newHistory;
      });
    }
  }, [deceptionData]);

  const handleCallFrameCreated = useCallback((callFrame: any) => {
    const checkParticipants = () => {
      const participants = callFrame.participants();
      const remote = Object.values(participants).find((p: any) => !p.local);
      setIsClaimantInRoom(!!remote);
    };

    callFrame.on('participant-joined', checkParticipants);
    callFrame.on('participant-left', checkParticipants);
    callFrame.on('joined-meeting', checkParticipants);
    checkParticipants();
  }, []);

  // Trigger functions
  const triggerVoiceAnalysis = useCallback(
    (showToast: boolean = false) => {
      if (!playerRef.current) return;

      if (!isJoined) {
        if (showToast) {
          toast({
            title: 'Not Ready',
            description: 'Waiting for video connection to be established...',
            variant: 'destructive',
          });
        }
        return;
      }

      try {
        playerRef.current.sendAppMessage({ type: 'request-voice-analysis' });
        isAnalyzingRef.current = true;
        setTimeout(() => {
          isAnalyzingRef.current = false;
        }, 2500);
      } catch (e) {
        console.error('Failed to trigger voice analysis:', e);
      }
    },
    [isJoined, toast]
  );

  const triggerVisualAnalysis = useCallback(async () => {
    if (!playerRef.current) return;

    if (!isJoined) return;

    try {
      playerRef.current.sendAppMessage({ type: 'request-visual-analysis' });
      isAnalyzingRef.current = true;
      setTimeout(() => {
        isAnalyzingRef.current = false;
      }, 5000);
    } catch (error) {
      console.error('Failed to trigger visual analysis:', error);
    }
  }, [isJoined]);

  const triggerExpressionAnalysis = useCallback(
    (showToast: boolean = false) => {
      if (!playerRef.current) return;

      if (!isJoined) {
        if (showToast) {
          toast({
            title: 'Not Ready',
            description: 'Waiting for video connection to be established...',
            variant: 'destructive',
          });
        }
        return;
      }

      try {
        isAnalyzingRef.current = true;
        playerRef.current.sendAppMessage({ type: 'request-expression-analysis' });
      } catch (error: any) {
        console.error('[VideoCallPage] Expression analysis request failed:', error);
        if (showToast) {
          toast({
            title: 'Error',
            description: 'Failed to send analysis request.',
            variant: 'destructive',
          });
        }
        isAnalyzingRef.current = false;
      }
    },
    [isJoined, toast]
  );

  const handleCaptureScreenshot = useCallback(() => {
    if (!playerRef.current) return;

    if (isScreenshotting) {
      return;
    }

    if (!isClaimantInRoom) {
      toast({
        title: 'Claimant Not Available',
        description: 'The claimant must be in the room to capture a screenshot.',
        variant: 'destructive',
      });
      return;
    }

    setIsScreenshotting(true);

    // Fallback: Re-enable button after 10s if no response received
    setTimeout(() => {
      setIsScreenshotting(prev => {
        if (prev) {
          console.log('Screenshot timeout reached, resetting state');
          return false;
        }
        return prev;
      });
    }, 10000);

    try {
      playerRef.current.sendAppMessage({ type: 'request-screenshot' });
    } catch (e) {
      console.error('Failed to request screenshot:', e);
      setIsScreenshotting(false);
      toast({
        title: 'Error',
        description: 'Failed to send screenshot request.',
        variant: 'destructive',
      });
    }
  }, [isClaimantInRoom, isScreenshotting, toast]);

  const handleAppMessage = useCallback(
    (e: any) => {
      if (e?.data?.type === 'screenshot-uploaded') {
        setIsScreenshotting(false);
        if (e.data.success) {
          toast({
            title: 'Screenshot Captured',
            description: 'Image has been successfully uploaded.',
            variant: 'default',
          });

          // Manually append the latest document into cache for immediate view
          if (e.data.document && claimId) {
            const newDoc = {
              ...e.data.document,
              createdAt: e.data.document.createdAt || new Date().toISOString(),
            };

            queryClient.setQueryData(claimKeys.detail(claimId), (oldData: any) => {
              if (!oldData) return oldData;
              const safeDocuments = oldData.documents || [];
              // Prevent duplicates if server already pushed update
              if (safeDocuments.some((d: any) => d.id === newDoc.id)) return oldData;
              return {
                ...oldData,
                documents: [newDoc, ...safeDocuments],
              };
            });

            // Fallback: Invalidate to ensure consistency with server state
            queryClient.invalidateQueries({ queryKey: claimKeys.detail(claimId) });

            setScreenshotIndex(0);
          }
        } else {
          toast({
            title: 'Capture Failed',
            description: 'Failed to upload screenshot from claimant device.',
            variant: 'destructive',
          });
        }
      }
    },
    [toast, queryClient, claimId, setScreenshotIndex]
  );

  // Auto-analysis effect
  useEffect(() => {
    if (analysisMode === 'auto' && isJoined) {
      const interval = setInterval(() => {
        if (isClaimantInRoom) {
          triggerVoiceAnalysis(false);
          triggerVisualAnalysis();
          triggerExpressionAnalysis(false);
          refetchDeception();
        }
      }, 2500);

      return () => clearInterval(interval);
    }
  }, [
    analysisMode,
    isJoined,
    isClaimantInRoom,
    triggerVoiceAnalysis,
    triggerVisualAnalysis,
    triggerExpressionAnalysis,
    refetchDeception,
  ]);

  // Effect to trigger join and set data directly
  useEffect(() => {
    const doJoin = async () => {
      if (!sessionId || !user?.id || hasAttemptedJoin.current) {
        return;
      }

      hasAttemptedJoin.current = true;

      try {
        const result = await joinRoom.mutateAsync({
          sessionId,
          userId: user.id,
          role: 'ADJUSTER',
        });
        setJoinData({ url: result.roomUrl, token: result.token });
      } catch (error: any) {
        console.error('[VideoCallPage] Join failed:', error);
        setJoinError(error.message || 'Failed to join the video room.');
        toast({
          title: 'Connection Error',
          description: error.message || 'Failed to join the video room.',
          variant: 'destructive',
        });
      }
    };

    doJoin();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, user?.id]);

  const handleEndCall = async () => {
    if (!sessionId) return;

    try {
      await endSession.mutateAsync('Adjuster ended the session');
      toast({
        title: 'Session Ended',
        description: 'The live session has been successfully completed.',
      });
      navigate(`/claims/${session?.claimId || ''}`);
    } catch (error: any) {
      toast({
        title: 'Error',
        description: 'Failed to end the session properly.',
        variant: 'destructive',
      });
    }
  };

  const attemptJoin = () => {
    hasAttemptedJoin.current = false;
    // The effect will trigger doJoin
  };

  // Memoized callback to prevent component remount
  const handleVideoLeft = useCallback(() => {
    // Only navigate if we're not middle-of-analysis and we have a target claim
    if (!isAnalyzingRef.current && session?.claimId) {
      console.log('[VideoCallPage] Navigating to claim detail:', session.claimId);
      navigate(`/claims/${session.claimId}`);
    } else if (!session?.claimId) {
      console.warn('[VideoCallPage] Blocked navigation: No claimId available');
    } else {
      console.log('[VideoCallPage] Blocked navigation: Analysis in progress');
    }
  }, [navigate, session?.claimId]);

  // Show error state with retry option
  if (joinError && !joinRoom.isPending) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-background text-foreground">
        <AlertCircle className="h-12 w-12 text-red-500 mb-4" />
        <p className="text-lg font-medium mb-2">Failed to Join Video Room</p>
        <p className="text-sm text-muted-foreground mb-6 max-w-md text-center">{joinError}</p>
        <div className="flex gap-4">
          <Button onClick={() => navigate(-1)} variant="outline">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Go Back
          </Button>
          <Button onClick={attemptJoin}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Try Again
          </Button>
        </div>
      </div>
    );
  }

  if (!joinData) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-background text-foreground">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mb-4" />
        <p className="text-lg font-medium">Preparing your secure video room...</p>
        <p className="text-xs text-muted-foreground mt-2">
          {joinRoom.isPending ? 'Requesting room access...' : 'Initializing...'}
        </p>
        {joinRoom.isError && (
          <p className="text-xs text-red-400 mt-2">
            Error: {joinRoom.error?.message || 'Unknown error'}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-background overflow-hidden">
      {/* Video Header */}
      <Header
        title="Live Session"
        description={`Secure • Encrypted • ${claim?.claimNumber || claim?.id || 'Loading...'}`}
      >
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          {/* <Button
            variant="outline"
            size="sm"
            onClick={() => playerRef.current?.requestFullscreen()}
          >
            <Maximize2 className="h-4 w-4 mr-2" />
            Fullscreen
          </Button> */}
          <Button variant="destructive" size="sm" onClick={handleEndCall}>
            <XCircle className="h-4 w-4 mr-2" />
            End Assessment
          </Button>
        </div>
      </Header>

      {/* Main Video Area */}
      <div className="flex-1 p-4 flex gap-4 overflow-hidden">
        {/* Left Column: Remote/Main Video */}
        <div className="flex-1 relative rounded-xl overflow-hidden shadow-2xl">
          <DailyVideoPlayer
            key={`daily-${joinData.url}`}
            ref={playerRef}
            url={joinData.url}
            token={joinData.token}
            onLeft={() => {
              setIsJoined(false);
              setIsClaimantInRoom(false);
              handleVideoLeft();
            }}
            onJoined={() => setIsJoined(true)}
            onCallFrameCreated={handleCallFrameCreated}
            onAppMessage={handleAppMessage}
          />
        </div>

        {/* Right Sidebar */}
        <div className="flex flex-col gap-4 w-128">
          {/* Session Info */}
          <Card className="bg-card border-border p-2 shrink-0">
            <h3 className="text-xs font-semibold mb-2 uppercase tracking-wider">Session Info</h3>
            <div className="flex items-center gap-8">
              <div>
                <p className="text-[10px] text-muted-foreground uppercase font-bold">Claim ID</p>
                <p className="text-xs text-muted-foreground">
                  {isClaimLoading ? 'Loading...' : claim?.claimNumber || claim?.id || 'N/A'}
                </p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground uppercase font-bold">Claimant</p>
                <p className="text-xs text-muted-foreground">
                  {isClaimLoading ? 'Loading...' : claim?.claimant?.fullName || 'N/A'}
                </p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground uppercase font-bold">
                  Policy Number
                </p>
                <p className="text-xs text-muted-foreground">{claim?.policyNumber || 'N/A'}</p>
              </div>
            </div>
          </Card>

          {/* Analysis Columns */}
          <div className="flex flex-1 gap-4 min-h-0">
            {/* Deception Score */}
            <div className="w-60 flex flex-col overflow-hidden">
              <Card className="bg-card border-border p-2 flex-1 flex flex-col overflow-hidden">
                <div className="flex items-center justify-between mb-4 shrink-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider">
                      Deception Score
                    </h3>
                    <InfoTooltip
                      title="Analysis Info"
                      content="Metrics are calculated only from claimant footage. Use the toggle to turn analysis on or off."
                      direction="top"
                      fontSize="text-[11px]"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <InfoTooltip
                      content="Toggle"
                      direction="top"
                      fontSize="text-[11px]"
                      trigger={
                        <Switch
                          checked={analysisMode !== 'off'}
                          onCheckedChange={checked => setAnalysisMode(checked ? 'auto' : 'off')}
                          className="scale-75 origin-right"
                        />
                      }
                    />
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar">
                  <div className="flex items-end gap-2 mb-4">
                    <span className="text-md font-bold text-foreground">
                      {((deceptionData?.deceptionScore || 0) * 100).toFixed(2)}
                    </span>
                    <span className="text-xs text-muted-foreground mb-1">/ 100.00</span>
                  </div>

                  {/* Metrics Graph */}
                  <div className="pt-4 border-t border-border h-44 mb-8">
                    <p className="text-[10px] text-muted-foreground font-bold mb-2 uppercase">
                      Metrics
                    </p>
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={metricsHistory}>
                        <CartesianGrid
                          strokeDasharray="3 3"
                          stroke="currentColor"
                          className="text-muted-foreground/20"
                        />
                        <XAxis dataKey="time" hide />
                        <YAxis domain={[0, 1]} hide />
                        <Tooltip
                          contentStyle={{
                            fontSize: '9px',
                            borderRadius: '8px',
                            borderColor: 'hsl(var(--border))',
                            backgroundColor: 'hsl(var(--card))',
                            color: 'hsl(var(--card-foreground))',
                          }}
                          itemStyle={{ fontSize: '9px' }}
                          labelStyle={{
                            color: 'hsl(var(--foreground))',
                            textAlign: 'center',
                            marginBottom: '4px',
                          }}
                        />
                        <Line
                          type="monotone"
                          dataKey="deception"
                          name="Deception Score"
                          stroke="#A855F7"
                          strokeWidth={2}
                          dot={false}
                        />
                        <Line
                          type="monotone"
                          dataKey="voice"
                          name="Voice Stress"
                          stroke="#72B0F2"
                          strokeWidth={1}
                          dot={false}
                          strokeOpacity={0.5}
                        />
                        <Line
                          type="monotone"
                          dataKey="visual"
                          name="Visual Behavior"
                          stroke="#2EE797"
                          strokeWidth={1}
                          dot={false}
                          strokeOpacity={0.5}
                        />
                        <Line
                          type="monotone"
                          dataKey="expression"
                          name="Expression Measurement"
                          stroke="#E884B6"
                          strokeWidth={1}
                          dot={false}
                          strokeOpacity={0.5}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Progress Bars */}
                  <div className="mt-auto space-y-3">
                    {[
                      {
                        label: 'Deception Score',
                        value: ((deceptionData?.deceptionScore || 0) * 100).toFixed(2),
                        color: '#A855F7',
                      },
                      {
                        label: 'Voice Stress',
                        value: ((deceptionData?.breakdown?.voiceStress || 0) * 100).toFixed(2),
                        color: '#72B0F2',
                      },
                      {
                        label: 'Visual Behavior',
                        value: ((deceptionData?.breakdown?.visualBehavior || 0) * 100).toFixed(2),
                        color: '#2EE797',
                      },
                      {
                        label: 'Expression Measurement',
                        value: (
                          (deceptionData?.breakdown?.expressionMeasurement || 0) * 100
                        ).toFixed(2),
                        color: '#E884B6',
                      },
                    ].map(metric => (
                      <div key={metric.label} className="mb-2">
                        <div className="flex justify-between text-[10px] mb-1">
                          <span className="text-muted-foreground">{metric.label}</span>
                          <span className="text-foreground font-mono">{metric.value}%</span>
                        </div>
                        <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full transition-all duration-500"
                            style={{
                              width: `${metric.value}%`,
                              backgroundColor: metric.color,
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Remote Screenshot */}
                  <div className="pt-4 mt-4 border-t border-border flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider">
                        Remote Screenshot
                      </h3>
                      <InfoTooltip
                        title="Remote Screenshot"
                        content="Captures a snapshot from the claimant's active camera."
                        direction="top"
                        fontSize="text-[11px]"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <InfoTooltip
                        content="Capture"
                        direction="top"
                        fontSize="text-[11px]"
                        className={`${!isClaimantInRoom || isScreenshotting ? 'cursor-not-allowed' : ''}`}
                        trigger={
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 rounded-md bg-background shadow-sm"
                            onClick={handleCaptureScreenshot}
                            disabled={!isClaimantInRoom || isScreenshotting}
                          >
                            {isScreenshotting ? (
                              <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                            ) : (
                              <Camera className="h-4 w-4" />
                            )}
                          </Button>
                        }
                      />
                    </div>
                  </div>

                  {/* Screenshot Gallery Carousel */}
                  {screenshots.length > 0 && (
                    <div className="mt-1 relative group h-[7.7rem] bg-black/5 rounded-md overflow-hidden border border-border/50">
                      <img
                        key={screenshotIndex}
                        src={screenshots[screenshotIndex]?.storageUrl}
                        alt={`Screenshot ${screenshotIndex + 1}`}
                        className="w-full h-full object-contain bg-black/90 cursor-pointer animate-in fade-in slide-in-from-right-2 duration-300"
                        onClick={() => setPreviewImage(screenshots[screenshotIndex]?.storageUrl)}
                      />

                      {/* Controls overlay */}
                      <div className="absolute inset-0 flex items-center justify-between p-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 rounded-full bg-black/50 text-white hover:bg-black/70 hover:text-white pointer-events-auto"
                          onClick={e => {
                            e.stopPropagation();
                            handlePrevScreenshot();
                          }}
                        >
                          <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 rounded-full bg-black/50 text-white hover:bg-black/70 hover:text-white pointer-events-auto"
                          onClick={e => {
                            e.stopPropagation();
                            handleNextScreenshot();
                          }}
                        >
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      </div>

                      {/* Date display */}
                      <div className="absolute bottom-0 w-full flex flex-col items-center pb-1 pt-4 bg-gradient-to-t from-black/80 to-transparent pointer-events-none">
                        <span className="text-[10px] text-white/90 font-mono">
                          {screenshots[screenshotIndex]?.createdAt
                            ? format(
                                new Date(screenshots[screenshotIndex].createdAt),
                                'MMM dd, yyyy - hh:mm a'
                              )
                            : '-'}
                        </span>
                      </div>

                      {/* Counter badge */}
                      <div className="absolute top-2 left-1/2 -translate-x-1/2 bg-black/60 text-white text-[9px] px-2 py-0.5 rounded-full backdrop-blur-sm pointer-events-none z-10">
                        {screenshotIndex + 1} / {screenshots.length}
                      </div>
                    </div>
                  )}
                </div>
              </Card>
            </div>

            {/* Risk Analysis */}
            <div className="w-60 flex flex-col overflow-hidden">
              <Card className="bg-card border-border p-2 flex-1 flex flex-col overflow-hidden">
                <div className="flex items-center justify-between mb-4 shrink-0">
                  <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider">
                    Risk Analysis
                  </h3>
                  <Badge
                    variant="outline"
                    className="text-[10px] h-5 border-emerald-700 text-emerald-400 animate-pulse"
                  >
                    LIVE
                  </Badge>
                </div>

                <div className="flex-1 overflow-y-auto space-y-3 custom-scrollbar">
                  {(() => {
                    const latestVoice = isClaimantInRoom
                      ? assessments?.find(a => a.assessmentType === 'VOICE_ANALYSIS')
                      : undefined;

                    const latestEmotion = isClaimantInRoom
                      ? assessments?.find(a => (a.rawResponse as any)?.top_emotions)
                      : undefined;

                    const latestVisual = isClaimantInRoom
                      ? assessments?.find(
                          a =>
                            a.assessmentType === 'ATTENTION_TRACKING' ||
                            (a.rawResponse as any)?.blink_rate_per_min !== undefined ||
                            a.provider?.includes('MediaPipe') ||
                            (a.assessmentType === 'VISUAL_MODERATION' &&
                              !(a.rawResponse as any)?.top_emotions)
                        )
                      : undefined;

                    const sections = [
                      {
                        id: 'voice',
                        title: 'Voice Stress',
                        data: latestVoice,
                        type: 'voice',
                        tooltip: (
                          <div className="space-y-2">
                            <p>
                              Analyzes vocal patterns that may indicate stress, tension, or
                              emotional load during speech.
                            </p>
                            <ul className="list-disc pl-3 space-y-1">
                              <li>
                                <span className="font-semibold text-foreground">Jitter (%):</span>{' '}
                                Measures small, rapid variations in voice pitch. Higher values may
                                indicate vocal instability or stress.
                              </li>
                              <li>
                                <span className="font-semibold text-foreground">Shimmer (%):</span>{' '}
                                Measures variations in voice loudness. Elevated shimmer can be
                                linked to tension or fatigue.
                              </li>
                              <li>
                                <span className="font-semibold text-foreground">
                                  Pitch SD (Hz):
                                </span>{' '}
                                Shows how much the speaker's pitch varies. Low variation may
                                indicate monotone delivery; high variation may signal emotional
                                arousal.
                              </li>
                              <li>
                                <span className="font-semibold text-foreground">HNR (dB):</span>{' '}
                                Harmonics-to-Noise Ratio. Indicates voice clarity—lower values
                                suggest more noise or strain in the voice.
                              </li>
                              <li>
                                <span className="font-semibold text-foreground">
                                  Confidence (%):
                                </span>{' '}
                                System confidence in the accuracy of the voice stress analysis based
                                on audio quality and signal consistency.
                              </li>
                            </ul>
                          </div>
                        ),
                      },
                      {
                        id: 'visual',
                        title: 'Visual Behavior',
                        data: latestVisual,
                        type: 'visual',
                        tooltip: (
                          <div className="space-y-2">
                            <p>
                              Tracks facial and eye-related behaviors that can reflect attention,
                              comfort, or cognitive effort.
                            </p>
                            <ul className="list-disc pl-3 space-y-1">
                              <li>
                                <span className="font-semibold text-foreground">
                                  Blink Rate (per min):
                                </span>{' '}
                                Number of blinks per minute. Changes may be associated with stress,
                                fatigue, or focus level.
                              </li>
                              <li>
                                <span className="font-semibold text-foreground">
                                  Blink Duration (ms):
                                </span>{' '}
                                Average length of each blink. Longer blinks may suggest tiredness or
                                disengagement.
                              </li>
                              <li>
                                <span className="font-semibold text-foreground">Lip Tension:</span>{' '}
                                Measures tightness around the mouth. Higher values can indicate
                                stress, suppression, or concentration.
                              </li>
                              <li>
                                <span className="font-semibold text-foreground">Frames:</span>{' '}
                                Number of video frames analyzed for this segment. Higher counts
                                generally improve reliability.
                              </li>
                              <li>
                                <span className="font-semibold text-foreground">
                                  Confidence (%):
                                </span>{' '}
                                System confidence in visual behavior detection based on lighting,
                                face visibility, and tracking quality.
                              </li>
                            </ul>
                          </div>
                        ),
                      },
                      {
                        id: 'emotion',
                        title: 'Expression',
                        data: latestEmotion,
                        type: 'emotion',
                        tooltip:
                          'Detects emotional and cognitive states based on facial expressions and micro-expressions.',
                      },
                    ];

                    return sections.map(section => (
                      <RiskAssessmentCard
                        key={section.id}
                        title={section.title}
                        data={section.data}
                        type={section.type as any}
                        tooltip={(section as any).tooltip}
                      />
                    ));
                  })()}
                </div>

                {analysisMode === 'manual' && (
                  <div className="mt-4 pt-4 border-t border-border space-y-2 shrink-0">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="w-full text-[10px] h-8 border-primary/30 text-primary hover:bg-primary/10"
                      onClick={e => {
                        e.preventDefault();
                        triggerVoiceAnalysis(true);
                      }}
                    >
                      <Zap className="h-3 w-3 mr-2" />
                      Voice Stress
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="w-full text-[10px] h-8 border-primary/30 text-primary hover:bg-primary/10"
                      onClick={e => {
                        e.preventDefault();
                        triggerVisualAnalysis();
                      }}
                      disabled={analyzeVisualBehavior.isPending}
                    >
                      <ShieldCheck className="h-3 w-3 mr-2" />
                      Visual Behavior
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="w-full text-[10px] h-8 border-primary/30 text-primary hover:bg-primary/10"
                      onClick={e => {
                        e.preventDefault();
                        triggerExpressionAnalysis(true);
                      }}
                      disabled={analyzeExpression.isPending}
                    >
                      <Activity className="h-3 w-3 mr-2" />
                      Expression
                    </Button>
                  </div>
                )}
              </Card>
            </div>
          </div>
        </div>
      </div>

      {/* Control Bar */}
      <div className="bg-card/80 backdrop-blur-md border-t border-border px-6 py-3 flex justify-center gap-4">
        <p className="text-xs text-muted-foreground py-2">
          Assessment session is being recorded for quality and compliance.
        </p>
      </div>

      {/* Image Preview Modal */}
      {previewImage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300"
            onClick={e => {
              if (e.target === e.currentTarget) setPreviewImage(null);
            }}
          />
          <div
            className="relative max-w-[95vw] max-h-[90vh] bg-black rounded-lg overflow-hidden shadow-2xl border border-white/10 flex items-center justify-center animate-in zoom-in-95 duration-300"
            onClick={e => e.stopPropagation()}
          >
            <img
              key={screenshotIndex}
              src={screenshots[screenshotIndex]?.storageUrl || undefined}
              alt="Preview"
              className="max-w-full max-h-[90vh] object-contain block mx-auto animate-in fade-in slide-in-from-right-5 duration-500"
            />

            {/* Internal Overlay Controls */}
            <div className="absolute inset-0 pointer-events-none">
              {/* Close Button */}
              <Button
                variant="ghost"
                size="icon"
                className="absolute top-3 right-3 text-white/50 hover:text-white hover:bg-white/20 rounded-full h-10 w-10 z-[60] pointer-events-auto backdrop-blur-sm shadow-lg transition-all"
                onClick={e => {
                  e.stopPropagation();
                  setPreviewImage(null);
                }}
              >
                <X className="h-6 w-6" />
              </Button>

              {/* Index Badge */}
              <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-black/60 text-white text-sm px-3 py-1 rounded-full backdrop-blur-md border border-white/10 z-[60] font-mono tracking-wide shadow-lg">
                {screenshotIndex + 1} / {screenshots.length}
              </div>

              {/* Navigation Arrows */}
              <div className="absolute inset-y-0 left-0 right-0 flex items-center justify-between px-3">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-10 w-10 rounded-full bg-black/40 text-white/60 hover:bg-black/60 hover:text-white pointer-events-auto transition-all backdrop-blur-md border border-white/5 shadow-xl active:scale-95"
                  onClick={e => {
                    e.preventDefault();
                    e.stopPropagation();
                    handlePrevScreenshot();
                  }}
                >
                  <ChevronLeft className="h-6 w-6" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-10 w-10 rounded-full bg-black/40 text-white/60 hover:bg-black/60 hover:text-white pointer-events-auto transition-all backdrop-blur-md border border-white/5 shadow-xl active:scale-95"
                  onClick={e => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleNextScreenshot();
                  }}
                >
                  <ChevronRight className="h-6 w-6" />
                </Button>
              </div>

              {/* Date display */}
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/60 backdrop-blur-lg px-4 py-1.5 rounded-full border border-white/10 pointer-events-none shadow-xl border-t border-white/20">
                <span className="text-sm text-white/70 font-mono tracking-tight uppercase whitespace-nowrap">
                  {screenshots[screenshotIndex]?.createdAt
                    ? format(
                        new Date(screenshots[screenshotIndex].createdAt),
                        'MMM dd, yyyy - hh:mm a'
                      )
                    : '-'}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
