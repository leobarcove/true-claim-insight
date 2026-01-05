import { useParams, useNavigate } from 'react-router-dom';
import { useState, useEffect, useRef, useCallback, useMemo, memo } from 'react';
import { ArrowLeft, Maximize2, XCircle, AlertCircle, RefreshCw, HelpCircle } from 'lucide-react';
import { DailyVideoPlayer, DailyVideoPlayerRef } from '@tci/ui-components';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import {
  useVideoSession,
  useJoinVideoRoom,
  useEndVideoSession,
  useRiskAssessments,
  useTriggerAssessment,
  useAnalyzeExpression,
  RiskAssessment,
} from '@/hooks/use-video';
import { useClaim } from '@/hooks/use-claims';
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
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { Switch } from '@/components/ui/switch';

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
}

const RiskAssessmentCard = memo(({ title, data, type }: RiskAssessmentCardProps) => {
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
    <div className="p-2 rounded-lg bg-slate-800/70 border border-slate-700/50 animate-in fade-in">
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
            <Activity className="h-4 w-4 text-slate-500 opacity-50" />
          )}
          <span className="text-xs font-semibold text-slate-200">{title}</span>
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
            <div className="bg-slate-900/50 rounded p-2">
              <p className="text-slate-500 uppercase font-bold text-[9px]">Jitter</p>
              <p
                className={`text-sm font-mono ${(raw?.jitter_percent ?? 0) > 1.5 ? 'text-red-400' : 'text-slate-200'}`}
              >
                {raw?.jitter_percent !== undefined ? `${raw.jitter_percent.toFixed(2)}%` : '—'}
              </p>
            </div>
            <div className="bg-slate-900/50 rounded p-2">
              <p className="text-slate-500 uppercase font-bold text-[9px]">Shimmer</p>
              <p
                className={`text-sm font-mono ${(raw?.shimmer_percent ?? 0) > 3 ? 'text-amber-400' : 'text-slate-200'}`}
              >
                {raw?.shimmer_percent !== undefined ? `${raw.shimmer_percent.toFixed(2)}%` : '—'}
              </p>
            </div>
            <div className="bg-slate-900/50 rounded p-2">
              <p className="text-slate-500 uppercase font-bold text-[9px]">Pitch SD</p>
              <p
                className={`text-sm font-mono ${(raw?.pitch_sd_hz ?? 0) > 40 ? 'text-amber-400' : 'text-slate-200'}`}
              >
                {raw?.pitch_sd_hz !== undefined ? `${raw.pitch_sd_hz.toFixed(1)} Hz` : '—'}
              </p>
            </div>
            <div className="bg-slate-900/50 rounded p-2">
              <p className="text-slate-500 uppercase font-bold text-[9px]">HNR</p>
              <p className="text-sm font-mono text-slate-200">
                {raw?.hnr_db !== undefined ? `${raw.hnr_db.toFixed(1)} dB` : '—'}
              </p>
            </div>
          </>
        )}

        {type === 'visual' && (
          <>
            <div className="bg-slate-900/50 rounded p-2">
              <p className="text-slate-500 uppercase font-bold text-[9px]">Blink Rate</p>
              <p
                className={`text-sm font-mono ${
                  raw?.blink_rate_per_min !== undefined &&
                  (raw.blink_rate_per_min < 10 || raw.blink_rate_per_min > 25)
                    ? 'text-amber-400'
                    : 'text-slate-200'
                }`}
              >
                {raw?.blink_rate_per_min !== undefined
                  ? `${raw.blink_rate_per_min.toFixed(1)}/min`
                  : '—'}
              </p>
            </div>
            <div className="bg-slate-900/50 rounded p-2">
              <p className="text-slate-500 uppercase font-bold text-[9px]">Lip Tension</p>
              <p
                className={`text-sm font-mono ${raw?.avg_lip_tension !== undefined && raw.avg_lip_tension < 0.7 ? 'text-amber-400' : 'text-slate-200'}`}
              >
                {raw?.avg_lip_tension !== undefined ? raw.avg_lip_tension.toFixed(3) : '—'}
              </p>
            </div>
            <div className="bg-slate-900/50 rounded p-2">
              <p className="text-slate-500 uppercase font-bold text-[9px]">Blink Dur.</p>
              <p className="text-sm font-mono text-slate-200">
                {raw?.avg_blink_duration_ms !== undefined
                  ? `${raw.avg_blink_duration_ms.toFixed(0)} ms`
                  : '—'}
              </p>
            </div>
            <div className="bg-slate-900/50 rounded p-2">
              <p className="text-slate-500 uppercase font-bold text-[9px]">Frames</p>
              <p className="text-sm font-mono text-slate-200">
                {raw?.frames_analyzed !== undefined ? raw.frames_analyzed : '—'}
              </p>
            </div>
          </>
        )}

        {type === 'emotion' && (
          <>
            {topEmotions.map((emotion: any, idx: number) => (
              <div key={idx} className="bg-slate-900/50 rounded p-2">
                <p className="text-slate-500 uppercase font-bold text-[9px]">{emotion.name}</p>
                <p className="text-sm font-mono text-slate-200">
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
      <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-700/50">
        <span className="text-[9px] text-slate-500">
          {marker?.provider
            ? `Conf: ${((marker.confidence ?? 0) * 100).toFixed(0)}%`
            : 'Awaiting Data...'}
        </span>
      </div>
    </div>
  );
});

export function VideoCallPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { toast } = useToast();
  const playerRef = useRef<DailyVideoPlayerRef>(null);

  const [joinData, setJoinData] = useState<{ url: string; token: string } | null>(null);
  const [joinError, setJoinError] = useState<string | null>(null);
  const hasAttemptedJoin = useRef(false);

  const { data: session } = useVideoSession(sessionId || '');
  const { data: claim, isLoading: isClaimLoading } = useClaim(session?.claimId || '');
  const { data: assessments } = useRiskAssessments(sessionId || '');

  const joinRoom = useJoinVideoRoom();
  const endSession = useEndVideoSession(sessionId || '');
  const triggerAssessment = useTriggerAssessment();
  const analyzeExpression = useAnalyzeExpression();

  // Ref to prevent navigation during analysis
  const isAnalyzingRef = useRef(false);

  const [analysisMode, setAnalysisMode] = useState<'manual' | 'auto' | 'off'>('off');
  const [isJoined, setIsJoined] = useState(false);
  const [isClaimantInRoom, setIsClaimantInRoom] = useState(false);
  const [metricsHistory, setMetricsHistory] = useState<any[]>([]);

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
        if (showToast) {
          toast({
            title: 'Request Sent',
            description: 'Asking claimant device to send audio sample...',
          });
        }

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

  const triggerVisualAnalysis = useCallback(() => {
    if (!isJoined) return;

    isAnalyzingRef.current = true;
    triggerAssessment.mutate(
      { sessionId: sessionId || '', assessmentType: 'VISUAL' },
      {
        onSettled: () => {
          setTimeout(() => {
            isAnalyzingRef.current = false;
          }, 1000);
        },
      }
    );
  }, [isJoined, sessionId, triggerAssessment]);

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
        description: 'The video assessment has been successfully completed.',
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
    if (!isAnalyzingRef.current) {
      navigate(`/claims/${session?.claimId || ''}`);
    } else {
      console.log('[VideoCallPage] Blocked navigation due to analysis in progress');
    }
  }, [navigate, session?.claimId]);

  // Show error state with retry option
  if (joinError && !joinRoom.isPending) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-slate-950 text-slate-200">
        <AlertCircle className="h-12 w-12 text-red-500 mb-4" />
        <p className="text-lg font-medium mb-2">Failed to Join Video Room</p>
        <p className="text-sm text-slate-400 mb-6 max-w-md text-center">{joinError}</p>
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
      <div className="flex flex-col items-center justify-center h-full bg-slate-950 text-slate-200">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mb-4" />
        <p className="text-lg font-medium">Preparing your secure video room...</p>
        <p className="text-xs text-slate-500 mt-2">
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
    <div className="flex flex-col h-full bg-slate-950 overflow-hidden">
      {/* Video Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-slate-800 bg-slate-900/50">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            className="text-slate-400 hover:text-white"
            onClick={() => navigate(-1)}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <div>
            <h1 className="text-md font-semibold text-white">
              Video Assessment: {session?.claimId || 'Loading...'}
            </h1>
            <div className="flex items-center gap-2 mt-0.5">
              <Badge
                variant="outline"
                className="text-[10px] uppercase tracking-wider bg-primary/10 text-primary border-primary/20"
              >
                Live Session
              </Badge>
              <span className="text-xs text-slate-500">Secure • Encrypted</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            className="bg-slate-800 border-slate-700 text-slate-300 text-xs"
            onClick={() => playerRef.current?.requestFullscreen()}
          >
            <Maximize2 className="h-4 w-4 mr-2" />
            Fullscreen
          </Button>
          <Button variant="destructive" size="sm" onClick={handleEndCall} className="text-xs">
            <XCircle className="h-4 w-4 mr-2" />
            End Assessment
          </Button>
        </div>
      </div>

      {/* Main Video Area */}
      <div className="flex-1 p-4 flex gap-4 overflow-hidden">
        {/* Left Column: Remote/Main Video */}
        <div className="flex-1 relative rounded-xl overflow-hidden shadow-2xl bg-slate-900 border border-slate-800">
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
          />
        </div>

        {/* Right Sidebar */}
        <div className="flex flex-col gap-4 w-128">
          {/* Session Info */}
          <Card className="bg-slate-900 border-slate-800 p-2 shrink-0">
            <h3 className="text-xs font-semibold text-slate-200 mb-2 uppercase tracking-wider">
              Session Info
            </h3>
            <div className="flex items-center gap-8">
              <div>
                <p className="text-[10px] text-slate-500 uppercase font-bold">Claim ID</p>
                <p className="text-xs text-slate-300">
                  {isClaimLoading ? 'Loading...' : claim?.id || 'N/A'}
                </p>
              </div>
              <div>
                <p className="text-[10px] text-slate-500 uppercase font-bold">Claimant</p>
                <p className="text-xs text-slate-300">
                  {isClaimLoading ? 'Loading...' : claim?.claimant?.fullName || 'N/A'}
                </p>
              </div>
              <div>
                <p className="text-[10px] text-slate-500 uppercase font-bold">Policy Number</p>
                <p className="text-xs text-slate-300">{claim?.policyNumber || 'N/A'}</p>
              </div>
            </div>
          </Card>

          {/* Analysis Columns */}
          <div className="flex flex-1 gap-4 min-h-0">
            {/* Deception Score */}
            <div className="w-60 flex flex-col">
              <Card className="bg-slate-900 border-slate-800 p-2 flex-1 flex flex-col">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <h3 className="text-xs font-semibold text-slate-200 uppercase tracking-wider">
                      Deception Score
                    </h3>
                    {/* Custom Styled Tooltip */}
                    <div className="group relative flex items-center">
                      <HelpCircle className="h-3 w-3 text-slate-500 cursor-help" />
                      <div className="invisible group-hover:visible absolute right-full mr-2 z-50 w-64 p-3 text-[10px] leading-relaxed text-slate-200 bg-slate-900 border border-slate-700 rounded-md shadow-xl whitespace-normal pointer-events-none transition-opacity duration-200 opacity-0 group-hover:opacity-100">
                        <p className="font-semibold mb-1 text-slate-100">Analysis Info</p>
                        Metrics are calculated only from claimant footage. Use the toggle to turn
                        analysis on or off.
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={analysisMode !== 'off'}
                      onCheckedChange={checked => setAnalysisMode(checked ? 'auto' : 'off')}
                      className="scale-75 origin-right"
                    />
                  </div>
                </div>

                <div className="flex items-end gap-2 mb-4">
                  <span className="text-md font-bold text-white">
                    {((deceptionData?.deceptionScore || 0) * 100).toFixed(2)}
                  </span>
                  <span className="text-xs text-slate-500 mb-1">/ 100.00</span>
                </div>

                {/* Metrics Graph */}
                <div className="pt-4 border-t border-slate-800 h-40">
                  <p className="text-[10px] text-slate-500 font-bold mb-2 uppercase">Metrics</p>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={metricsHistory}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.5} />
                      <XAxis dataKey="time" hide />
                      <YAxis domain={[0, 1]} hide />
                      <Tooltip
                        contentStyle={{
                          fontSize: '9px',
                          borderColor: '#334155',
                          backgroundColor: '#1e293b',
                        }}
                        itemStyle={{ fontSize: '9px' }}
                        labelStyle={{ color: '#FBFAF2', textAlign: 'center', marginBottom: '4px' }}
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
                      value: ((deceptionData?.breakdown?.expressionMeasurement || 0) * 100).toFixed(
                        2
                      ),
                      color: '#E884B6',
                    },
                  ].map(metric => (
                    <div key={metric.label} className="mb-2">
                      <div className="flex justify-between text-[10px] mb-1">
                        <span className="text-slate-400">{metric.label}</span>
                        <span className="text-slate-200 font-mono">{metric.value}%</span>
                      </div>
                      <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
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
              </Card>
            </div>

            {/* Risk Analysis */}
            <div className="w-60 flex flex-col overflow-hidden">
              <Card className="bg-slate-900 border-slate-800 p-2 flex-1 flex flex-col overflow-hidden">
                <div className="flex items-center justify-between mb-4 shrink-0">
                  <h3 className="text-xs font-semibold text-slate-200 uppercase tracking-wider">
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
                      { id: 'voice', title: 'Voice Stress', data: latestVoice, type: 'voice' },
                      {
                        id: 'visual',
                        title: 'Visual Behavior',
                        data: latestVisual,
                        type: 'visual',
                      },
                      { id: 'emotion', title: 'Expression', data: latestEmotion, type: 'emotion' },
                    ];

                    return sections.map(section => (
                      <RiskAssessmentCard
                        key={section.id}
                        title={section.title}
                        data={section.data}
                        type={section.type as any}
                      />
                    ));
                  })()}
                </div>

                {analysisMode === 'manual' && (
                  <div className="mt-4 pt-4 border-t border-slate-800 space-y-2 shrink-0">
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
                      className="w-full text-[10px] h-8 border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/10"
                      onClick={e => {
                        e.preventDefault();
                        triggerVisualAnalysis();
                      }}
                      disabled={triggerAssessment.isPending}
                    >
                      <ShieldCheck className="h-3 w-3 mr-2" />
                      Visual Behavior
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="w-full text-[10px] h-8 border-purple-500/30 text-purple-400 hover:bg-purple-500/10"
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

      {/* Control Bar (Mobile Style or Bottom Controls) */}
      <div className="bg-slate-900/80 backdrop-blur-md border-t border-slate-800 px-6 py-3 flex justify-center gap-4">
        {/* Daily.co handles most controls, but we can add custom ones here if needed */}
        <p className="text-xs text-slate-500 py-2">
          Assessment session is being recorded for quality and compliance.
        </p>
      </div>
    </div>
  );
}
