import { useParams, useNavigate } from 'react-router-dom';
import { useRef, useState, useEffect, useMemo, memo } from 'react';
import {
  ArrowLeft,
  Play,
  Pause,
  AlertCircle,
  CheckCircle2,
  ShieldAlert,
  ShieldCheck,
  ShieldMinus,
  Activity,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useClaim } from '@/hooks/use-claims';
import {
  useVideoUpload,
  useProcessVideoSegment,
  useGenerateVideoConsent,
  usePrepareVideo,
} from '@/hooks/use-video-upload';
import { Header } from '@/components/layout/header';
import { useRiskAssessments, useSessionDeceptionScore } from '@/hooks/use-video';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import { InfoTooltip } from '@/components/ui/tooltip';
import { convertToTitleCase } from '@/lib/utils';

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
  data: any;
  type: 'voice' | 'visual' | 'emotion';
  tooltip?: React.ReactNode;
}

const RiskAssessmentCard = memo(({ title, data, type, tooltip }: RiskAssessmentCardProps) => {
  const marker = data; // The raw data object itself contains risk_score and other fields
  const raw = marker;

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
          {marker?.risk_score === 'HIGH' ? (
            <ShieldAlert className="h-4 w-4 text-red-500" />
          ) : marker?.risk_score === 'MEDIUM' ? (
            <ShieldMinus className="h-4 w-4 text-amber-500" />
          ) : marker?.risk_score === 'LOW' ? (
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
              contentClassName="min-w-[450px]"
            />
          )}
        </div>
        {marker && (
          <Badge
            variant={
              marker.risk_score === 'HIGH'
                ? 'destructive'
                : marker.risk_score === 'MEDIUM'
                  ? 'secondary'
                  : 'default'
            }
            className="text-[9px] h-5 px-2"
          >
            {marker.risk_score || 'PENDING'}
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

export function VideoReviewPage() {
  const { id: claimId, uploadId } = useParams<{ id: string; uploadId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const videoRef = useRef<HTMLVideoElement>(null);
  const processingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [hasWatchedToEnd, setHasWatchedToEnd] = useState(false);
  const [metricsHistory, setMetricsHistory] = useState<any[]>([]);
  const [lastProcessedTime, setLastProcessedTime] = useState(0);
  const [currentMetrics, setCurrentMetrics] = useState<any>(null);

  const [hasInitiatedPreparation, setHasInitiatedPreparation] = useState(false);
  const hasAttemptedPreparation = useRef(false);
  const [isReady, setIsReady] = useState(false);
  const [videoSrc, setVideoSrc] = useState<string | undefined>(undefined);
  const lastProcessedTimeRef = useRef(0);
  const hasInitializedState = useRef(false);
  const pendingSeekRef = useRef<number | null>(null);
  const hasInitialSeek = useRef(false); // New: to prevent double seek on refresh
  const isSegmentProcessingRef = useRef(false); // New: explicit lock for segments

  const { data: claim, isLoading: isClaimLoading } = useClaim(claimId || '');

  const isFullyProcessed = useMemo(() => {
    return duration > 0 && lastProcessedTime >= duration;
  }, [duration, lastProcessedTime]);

  // 1. Hook declarations (Move up to avoid usage before declaration)
  const prepareVideo = usePrepareVideo(uploadId || '');
  const { data: videoUpload, isLoading: isLoadingUpload } = useVideoUpload(uploadId || '');

  const sessionId = (videoUpload as any)?.sessionId;

  const { data: deceptionData, refetch: refetchDeception } = useSessionDeceptionScore(
    sessionId || '',
    !!sessionId && !prepareVideo.isPending
  );
  const { data: assessments } = useRiskAssessments(sessionId || '', 5000);
  const processSegment = useProcessVideoSegment(uploadId || '');
  const generateConsent = useGenerateVideoConsent(uploadId || '');

  // 1.5. Video Source logic - Keep stable to prevent remounts
  useEffect(() => {
    if (videoUpload?.videoUrl && !videoSrc) {
      setVideoSrc(videoUpload.videoUrl);
    }
  }, [videoUpload?.videoUrl, videoSrc]);

  // Derived loading state - ONLY block for the initial metadata load
  const isActuallyPreparing = isLoadingUpload;

  // 2. Side effects

  // Initialize duration and processedUntil from DB as early as possible
  useEffect(() => {
    if (videoUpload && !hasInitializedState.current) {
      if (videoUpload.duration > 0) setDuration(videoUpload.duration);
      if (videoUpload.processedUntil > 0) {
        const capped =
          videoUpload.duration > 0
            ? Math.min(videoUpload.processedUntil, videoUpload.duration)
            : videoUpload.processedUntil;
        setLastProcessedTime(capped);
        lastProcessedTimeRef.current = capped;
        setCurrentTime(capped);
      }
      hasInitializedState.current = true;
    }
  }, [videoUpload]);

  // 2. Side effects
  // Update historical metrics from assessments (reconstructs timeline)
  useEffect(() => {
    if (assessments && assessments.length > 0) {
      const segments = new Map<number, any>();
      assessments.forEach((a: any) => {
        const { startTime, segmentDeception, segmentBreakdown } = a.rawResponse || {};
        if (startTime !== undefined && segmentDeception !== undefined) {
          if (!segments.has(startTime)) {
            segments.set(startTime, {
              time: formatTime(startTime),
              deception: (segmentDeception * 100).toFixed(2),
              voice: (segmentBreakdown?.voiceStress * 100).toFixed(2),
              visual: (segmentBreakdown?.visualBehavior * 100).toFixed(2),
              expression: (segmentBreakdown?.expressionMeasurement * 100).toFixed(2),
              startTime,
            });
          }
        }
      });

      const historicalPoints = Array.from(segments.values()).sort(
        (a, b) => a.startTime - b.startTime
      );
      if (historicalPoints.length > 0) {
        setMetricsHistory(historicalPoints);
      }
    } else if (deceptionData && metricsHistory.length === 0) {
      // Fallback for live sessions
      const initialPoint = {
        time: formatTime(currentTime),
        deception: ((deceptionData.deceptionScore || 0) * 100).toFixed(2),
        voice: ((deceptionData.breakdown?.voiceStress || 0) * 100).toFixed(2),
        visual: ((deceptionData.breakdown?.visualBehavior || 0) * 100).toFixed(2),
        expression: ((deceptionData.breakdown?.expressionMeasurement || 0) * 100).toFixed(2),
      };
      setMetricsHistory([initialPoint]);
    }
  }, [assessments, deceptionData, isFullyProcessed]);

  // Sync progress with deception score metadata
  useEffect(() => {
    if (deceptionData?.processedUntil > lastProcessedTime) {
      const capped = duration
        ? Math.min(deceptionData.processedUntil, duration)
        : deceptionData.processedUntil;
      setLastProcessedTime(capped);
      lastProcessedTimeRef.current = capped;
    }
  }, [deceptionData, duration, lastProcessedTime]);

  // Update current metrics based on currentTime (Temporal Lookup)
  useEffect(() => {
    if (assessments && assessments.length > 0) {
      const currentSegment = assessments.find((a: any) => {
        const { startTime, endTime } = a.rawResponse || {};
        return (
          startTime !== undefined &&
          endTime !== undefined &&
          currentTime >= startTime &&
          currentTime < endTime
        );
      });

      if (currentSegment) {
        const { segmentDeception, segmentBreakdown } = currentSegment.rawResponse;
        setCurrentMetrics({
          deceptionScore: segmentDeception,
          breakdown: segmentBreakdown,
          // Find specific metric details for this same time window
          voice: assessments.find(
            a =>
              a.assessmentType === 'VOICE_ANALYSIS' &&
              a.rawResponse?.startTime === currentSegment.rawResponse.startTime
          )?.rawResponse,
          visual: assessments.find(
            a =>
              a.assessmentType === 'ATTENTION_TRACKING' &&
              a.rawResponse?.startTime === currentSegment.rawResponse.startTime
          )?.rawResponse,
          expression: assessments.find(
            a =>
              (a.assessmentType === 'VISUAL_MODERATION' || a.provider?.includes('Hume')) &&
              a.rawResponse?.startTime === currentSegment.rawResponse.startTime
          )?.rawResponse,
        });
      }
    }
  }, [currentTime, assessments]);

  // Prepare video on mount - Following call.tsx pattern
  useEffect(() => {
    const doPrepare = async () => {
      if (!uploadId || hasAttemptedPreparation.current) return;

      console.log('[VideoReview] Initiating preparation for:', uploadId);
      hasAttemptedPreparation.current = true;
      setHasInitiatedPreparation(true);

      try {
        await prepareVideo.mutateAsync();
        console.log('[VideoReview] Preparation successful');
        setIsReady(true);
        toast({ title: 'Ready', description: 'Video prepared for analysis' });
      } catch (err: any) {
        console.error('[VideoReview] Preparation failed:', err);
        hasAttemptedPreparation.current = false;
        setHasInitiatedPreparation(false);
        toast({
          title: 'Preparation Error',
          description: err?.message || 'Failed to prepare video locally',
          variant: 'destructive',
        });
      }
    };

    if (uploadId) {
      doPrepare();
    }
  }, [uploadId]);

  // Initialize video
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !videoUpload) return;

    const handleLoadedMetadata = () => {
      console.log('Video loaded metadata', { duration: video.duration, videoUpload });
      if (video.duration > 0) setDuration(video.duration);

      // Restore position if we have a pending seek (e.g. after src change)
      if (pendingSeekRef.current !== null) {
        video.currentTime = pendingSeekRef.current;
        pendingSeekRef.current = null;
      } else if (lastProcessedTimeRef.current > 0 && !hasInitialSeek.current) {
        // Initial load or refresh - jump to last processed (ONLY ONCE)
        video.currentTime = lastProcessedTimeRef.current;
        hasInitialSeek.current = true;
      }
    };

    const handleTimeUpdate = () => {
      setCurrentTime(video.currentTime);
    };

    const handleEnded = async () => {
      setIsPlaying(false);
      setHasWatchedToEnd(true);

      if (!videoUpload) return;

      // Handle final segment if needed
      const MIN_FINAL_SEGMENT_THRESHOLD = 1.0; // Don't process final bits < 1s
      const remainingDuration = duration - lastProcessedTimeRef.current;

      if (remainingDuration > MIN_FINAL_SEGMENT_THRESHOLD) {
        console.log('VideoReview: Ended. Processing remaining segment...');
        try {
          await processSegment.mutateAsync({
            startTime: lastProcessedTimeRef.current,
            endTime: duration,
          });
          // After final segment, trigger consent
          generateConsent.mutate();
        } catch (e) {
          console.error('Final segment processing failed', e);
          toast({
            title: 'Processing Error',
            description: 'Failed to analyze the final video segment.',
            variant: 'destructive',
          });
        }
      } else {
        console.log('VideoReview: Ended. Remaining segment too small, finalizing...');
        // If already processed up to duration or near it, trigger consent
        if (videoUpload.status === 'PROCESSING' || videoUpload.status === 'PENDING') {
          generateConsent.mutate();
        }
      }
    };

    const handleError = async (e: any) => {
      console.error('Video error:', video.error, e);
      let errorMessage = 'Failed to load video';

      if (video.error) {
        switch (video.error.code) {
          case MediaError.MEDIA_ERR_ABORTED:
            errorMessage = 'Fetch aborted';
            break;
          case MediaError.MEDIA_ERR_NETWORK:
            errorMessage = 'Network error';
            break;
          case MediaError.MEDIA_ERR_DECODE:
            errorMessage = 'Decode error';
            break;
          case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
            errorMessage = 'Source not supported';
            break;
          default:
            errorMessage = 'Unknown error';
            break;
        }
      }

      toast({
        title: 'Video Error',
        description: `${errorMessage}. URL: ${videoUpload.videoUrl}`,
        variant: 'destructive',
      });
    };

    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('ended', handleEnded);
    video.addEventListener('error', handleError);

    // Initial check
    if (video.readyState >= 1) handleLoadedMetadata();

    return () => {
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('ended', handleEnded);
      video.removeEventListener('error', handleError);
    };
  }, [videoUpload?.id, videoSrc]); // Re-bind if ID or SRC changes, not on every property update

  // Capture currentTime on src change to prevent reset
  useEffect(() => {
    if (videoRef.current && videoRef.current.currentTime > 0) {
      pendingSeekRef.current = videoRef.current.currentTime;
    }
  }, [videoSrc]);

  // Handle processSegment success
  useEffect(() => {
    if (processSegment.isSuccess && processSegment.data) {
      const data = processSegment.data;
      const cappedTime = duration ? Math.min(data.processedUntil, duration) : data.processedUntil;
      setLastProcessedTime(cappedTime);
      lastProcessedTimeRef.current = cappedTime;
      refetchDeception();
      if (data.metrics?.details) {
        setCurrentMetrics(data.metrics.details);
      }

      // Update metrics history
      if (data.metrics) {
        setMetricsHistory((prev: any[]) => {
          const newPoint = {
            time: new Date().toLocaleTimeString(),
            deception: ((data.metrics.deceptionScore || 0) * 100).toFixed(2),
            voice: ((data.metrics.breakdown?.voiceStress || 0) * 100).toFixed(2),
            visual: ((data.metrics.breakdown?.visualBehavior || 0) * 100).toFixed(2),
            expression: ((data.metrics.breakdown?.expressionMeasurement || 0) * 100).toFixed(2),
          };
          const newHistory = [...prev, newPoint];
          if (newHistory.length > 30) return newHistory.slice(newHistory.length - 30);
          return newHistory;
        });
      }
    }
  }, [processSegment.isSuccess, processSegment.data]);

  // Process video segments as it plays
  useEffect(() => {
    if (!isPlaying || !videoRef.current || isFullyProcessed) {
      if (processingIntervalRef.current) {
        clearInterval(processingIntervalRef.current);
        processingIntervalRef.current = null;
      }
      return;
    }

    // Process every 5 seconds of video
    const SEGMENT_DURATION = 5;

    processingIntervalRef.current = setInterval(() => {
      const video = videoRef.current;
      if (!video) return;

      const currentPoint = video.currentTime;

      // If playback is way ahead of processing, it ensures the analysis catches up
      const SYNC_THRESHOLD = SEGMENT_DURATION * 1.5; // 7.5s (more than one segment + buffer)
      if (
        currentPoint - lastProcessedTimeRef.current > SYNC_THRESHOLD &&
        !isSegmentProcessingRef.current
      ) {
        const segmentStart = Math.floor(currentPoint / SEGMENT_DURATION) * SEGMENT_DURATION;
        const potentialEnd = segmentStart + SEGMENT_DURATION;
        const segmentEnd = duration ? Math.min(potentialEnd, duration) : potentialEnd;

        // Update markers so we don't trigger the old sequence
        lastProcessedTimeRef.current = segmentEnd;
        setLastProcessedTime(segmentEnd);

        // Trigger the latest segment
        isSegmentProcessingRef.current = true;
        processSegment.mutate(
          {
            startTime: segmentStart,
            endTime: segmentEnd,
          },
          {
            onSettled: () => {
              isSegmentProcessingRef.current = false;
              refetchDeception();
            },
          }
        );
      }

      const nextProcessPoint = lastProcessedTimeRef.current + SEGMENT_DURATION;

      // 1. Trigger Deception Calculation (Process Segment)
      // Check if we reached the next point AND we arent already processing
      if (
        currentPoint >= nextProcessPoint &&
        !isSegmentProcessingRef.current &&
        lastProcessedTimeRef.current < (duration || 1000000)
      ) {
        const potentialEnd = nextProcessPoint;
        const actualEnd = duration ? Math.min(potentialEnd, duration) : potentialEnd;

        processSegment.mutate(
          {
            startTime: lastProcessedTimeRef.current,
            endTime: actualEnd,
          },
          {
            onSettled: () => {
              isSegmentProcessingRef.current = false;
            },
          }
        );
      }

      // 2. Fetch latest data (matches call.tsx 2.5s retrieve logic)
      refetchDeception();
    }, 5000);

    return () => {
      if (processingIntervalRef.current) {
        clearInterval(processingIntervalRef.current);
      }
    };
  }, [isPlaying, duration, isFullyProcessed]);

  const handlePlayPause = async () => {
    const video = videoRef.current;
    if (!video) return;

    try {
      if (isPlaying) {
        video.pause();
        setIsPlaying(false);
      } else {
        // Look-ahead: Check if we need to process the current/upcoming segment immediately
        const current = video.currentTime;
        // Round down to nearest 5s to align with segment grid
        const segmentStart = Math.floor(current / 5) * 5;
        const potentialEnd = segmentStart + 5;
        const segmentEnd = duration ? Math.min(potentialEnd, duration) : potentialEnd;

        // If the upcoming segment hasn't been processed yet (and isn't currently being processed)
        if (segmentStart >= lastProcessedTimeRef.current && !isSegmentProcessingRef.current) {
          isSegmentProcessingRef.current = true;
          processSegment.mutate(
            {
              startTime: segmentStart,
              endTime: segmentEnd,
            },
            {
              onSettled: () => {
                isSegmentProcessingRef.current = false;
              },
            }
          );
        }

        await video.play();
        setIsPlaying(true);
      }
    } catch (error: any) {
      console.error('Playback error:', error);
      setIsPlaying(false);
      toast({
        title: 'Playback Error',
        description: error.message || 'Failed to play video',
        variant: 'destructive',
      });
    }
  };

  const handleComplete = async () => {
    // 1. If already completed, just navigate
    if (videoUpload?.status === 'COMPLETED') {
      navigate(`/claims/${claimId}`);
      return;
    }

    try {
      // 2. If there are unprocessed segments, process them
      const MIN_FINAL_SEGMENT_THRESHOLD = 1.0;
      const remainingDuration = duration - lastProcessedTimeRef.current;

      if (remainingDuration > MIN_FINAL_SEGMENT_THRESHOLD) {
        toast({
          title: 'Finalizing Analysis',
          description: 'Processing remaining video segment...',
        });
        await processSegment.mutateAsync({
          startTime: lastProcessedTimeRef.current,
          endTime: duration,
        });
      }

      // 3. Generate Consent / Report
      if (videoUpload) {
        toast({
          title: 'Generating Report',
          description: 'Creating consent form and finalizing assessment...',
        });
        await generateConsent.mutateAsync();
      }

      toast({
        title: 'Review Complete',
        description: 'Assessment successfully finalized.',
      });
      navigate(`/claims/${claimId}`);
    } catch (error: any) {
      console.error('Completion error:', error);
      toast({
        title: 'Error',
        description: 'Failed to complete review. Please try again.',
        variant: 'destructive',
      });
    }
  };

  const isCompleting = processSegment.isPending || generateConsent.isPending;

  const progressPercentage = duration > 0 ? Math.min((currentTime / duration) * 100, 100) : 0;
  const processedPercentage =
    duration > 0 ? Math.min((lastProcessedTime / duration) * 100, 100) : 0;

  if (isLoadingUpload || isActuallyPreparing) {
    return (
      <div className="flex h-full items-center justify-center bg-card">
        <div className="text-center text-foreground">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mb-4 mx-auto" />
          <p className="text-lg font-medium">
            {isActuallyPreparing ? 'Preparing video for analysis...' : 'Loading video details...'}
          </p>
          {isActuallyPreparing && (
            <p className="text-xs text-muted-foreground mt-2">
              Downloading and caching video for real-time assessment
            </p>
          )}
        </div>
      </div>
    );
  }

  if (!videoUpload) {
    return (
      <div className="flex h-full items-center justify-center bg-card">
        <div className="text-center text-foreground">
          <AlertCircle className="h-12 w-12 text-red-500 mb-4 mx-auto" />
          <p className="text-lg font-medium">Video not found</p>
          <Button variant="outline" className="mt-4" onClick={() => navigate(`/claims/${claimId}`)}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-background overflow-hidden animate-in fade-in duration-500">
      {/* Header */}
      <Header
        title="Manual Upload"
        description={`AI-Powered Risk Analysis • ${claim?.claimNumber || claimId}`}
      >
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate(`/claims/${claimId}`)}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          {(hasWatchedToEnd || isFullyProcessed) && (
            <Button variant="default" size="sm" onClick={handleComplete} disabled={isCompleting}>
              {isCompleting ? (
                <span className="animate-spin mr-2">⏳</span>
              ) : (
                <CheckCircle2 className="h-4 w-4 mr-2" />
              )}
              {isCompleting ? 'Finalizing...' : 'Complete Review'}
            </Button>
          )}
        </div>
      </Header>

      {/* Main Content */}
      <div className="flex-1 p-4 flex gap-4 overflow-hidden">
        {/* Video Player */}
        <div className="flex-1 flex flex-col gap-4">
          <div className="relative rounded-xl overflow-hidden shadow-2xl bg-black flex-1">
            <video
              ref={videoRef}
              src={videoSrc}
              className="w-full h-full object-contain"
              controlsList="nodownload nofullscreen noremoteplayback"
              disablePictureInPicture
              onContextMenu={e => e.preventDefault()}
            />
          </div>

          {/* Custom Controls */}
          <Card className="bg-card border-border p-4">
            <div className="space-y-3">
              {/* Progress Bar */}
              <div className="relative">
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  {/* Processed portion (green) */}
                  <div
                    className="absolute h-2 bg-green-500/50 transition-all rounded-sm"
                    style={{ width: `${processedPercentage}%` }}
                  />
                  {/* Current playback position (blue) */}
                  <div
                    className="absolute h-2 bg-primary transition-all rounded-sm"
                    style={{ width: `${progressPercentage}%` }}
                  />
                </div>
                <div className="flex justify-between text-xs text-muted-foreground mt-1">
                  <span>{formatTime(Math.min(currentTime, duration))}</span>
                  <span>{formatTime(duration)}</span>
                </div>
              </div>

              {/* Play/Pause Button */}
              <div className="flex items-center justify-center gap-4">
                <Button
                  variant="default"
                  size="icon"
                  onClick={handlePlayPause}
                  className="rounded-full h-12 w-12 bg-primary text-primary-foreground hover:bg-primary/90 transition-colors border-none"
                >
                  {isPlaying ? <Pause className="h-6 w-6" /> : <Play className="h-6 w-6 ml-1" />}
                </Button>
              </div>

              {/* Info */}
              <div className="text-center text-xs text-muted-foreground">
                <p>Video controls are limited. You must watch the entire video for processing.</p>
                <p className="mt-1">
                  Processed: {formatTime(lastProcessedTime)} / {formatTime(duration)}
                </p>
              </div>
            </div>
          </Card>
        </div>

        {/* Right Sidebar - Metrics & Risk */}
        <div className="flex flex-col gap-4 w-128 overflow-hidden">
          {/* Session Info */}
          <Card className="bg-card border-border p-2 shrink-0">
            <h3 className="text-xs font-semibold text-foreground mb-2 uppercase tracking-wider">
              Session Info
            </h3>
            <div className="flex items-center gap-8">
              <div>
                <p className="text-[10px] text-muted-foreground uppercase font-bold">Claim ID</p>
                <p className="text-xs text-muted-foreground">
                  {isClaimLoading ? 'Loading...' : claim?.id || 'N/A'}
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

          <div className="flex flex-1 gap-4 min-h-0">
            {/* Deception Score */}
            <div className="w-60 flex flex-col">
              <Card className="bg-card border-border p-4 flex-1 flex flex-col">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider">
                      Deception Score
                    </h3>
                    <InfoTooltip
                      title="Analysis Info"
                      content="Metrics are calculated from the uploaded video as it plays. Processing occurs in real-time."
                      direction="left"
                    />
                  </div>
                  <Badge
                    variant="outline"
                    className="text-[10px] h-5 border-primary text-primary animate-pulse"
                  >
                    {isPlaying ? 'LIVE' : 'PAUSED'}
                  </Badge>
                </div>

                <div className="flex items-end gap-2 mb-4">
                  <span className="text-2xl font-bold text-foreground">
                    {(
                      (currentMetrics?.deceptionScore || deceptionData?.deceptionScore || 0) * 100
                    ).toFixed(2)}
                  </span>
                  <span className="text-xs text-muted-foreground mb-1">/ 100.00</span>
                </div>

                {/* Metrics Graph */}
                <div className="flex-1 min-h-0">
                  <p className="text-[10px] text-muted-foreground font-bold mb-2 uppercase">
                    Real-time Metrics
                  </p>
                  <div className="h-40">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={metricsHistory}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.5} />
                        <XAxis dataKey="time" hide />
                        <YAxis domain={[0, 100]} hide />
                        <Tooltip
                          contentStyle={{
                            fontSize: '9px',
                            borderColor: 'hsl(var(--border))',
                            backgroundColor: 'hsl(var(--popover))',
                            color: 'hsl(var(--popover-foreground))',
                          }}
                          itemStyle={{ fontSize: '9px' }}
                          labelStyle={{
                            color: 'hsl(var(--muted-foreground))',
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
                </div>

                {/* Progress Bars */}
                <div className="mt-4 space-y-3">
                  {[
                    {
                      label: 'Deception Score',
                      value: (
                        (currentMetrics?.deceptionScore || deceptionData?.deceptionScore || 0) * 100
                      ).toFixed(2),
                      color: '#A855F7',
                    },
                    {
                      label: 'Voice Stress',
                      value: (
                        (currentMetrics?.breakdown?.voiceStress ||
                          deceptionData?.breakdown?.voiceStress ||
                          0) * 100
                      ).toFixed(2),
                      color: '#72B0F2',
                    },
                    {
                      label: 'Visual Behavior',
                      value: (
                        (currentMetrics?.breakdown?.visualBehavior ||
                          deceptionData?.breakdown?.visualBehavior ||
                          0) * 100
                      ).toFixed(2),
                      color: '#2EE797',
                    },
                    {
                      label: 'Expression Measurement',
                      value: (
                        (currentMetrics?.breakdown?.expressionMeasurement ||
                          deceptionData?.breakdown?.expressionMeasurement ||
                          0) * 100
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
              </Card>
            </div>

            {/* Risk Analysis Card */}
            <div className="w-60 flex flex-col overflow-hidden">
              <Card className="bg-card border-border p-4 flex-1 flex flex-col overflow-hidden">
                <div className="flex items-center justify-between mb-4 shrink-0">
                  <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider">
                    Risk Analysis
                  </h3>
                </div>

                <div className="flex-1 overflow-y-auto space-y-3 custom-scrollbar">
                  {(() => {
                    // 1. Try temporal match first
                    const temporalAssessments = assessments?.filter((a: any) => {
                      const { startTime, endTime } = a.rawResponse || {};
                      return (
                        startTime !== undefined &&
                        endTime !== undefined &&
                        currentTime >= startTime &&
                        currentTime < endTime
                      );
                    });

                    const getLatest = (type: string, filter?: (a: any) => boolean) => {
                      let found = temporalAssessments?.find(
                        a => a.assessmentType === type || (filter && filter(a))
                      );
                      if (found) return found;
                      return assessments?.find(
                        a => a.assessmentType === type || (filter && filter(a))
                      );
                    };

                    const latestVoice = getLatest('VOICE_ANALYSIS');

                    const latestEmotion = getLatest(
                      'VISUAL_MODERATION',
                      a => (a.rawResponse as any)?.top_emotions || a.provider?.includes('Hume')
                    );

                    const latestVisual = getLatest(
                      'ATTENTION_TRACKING',
                      a =>
                        (a.rawResponse as any)?.blink_rate_per_min !== undefined ||
                        a.provider?.includes('MediaPipe') ||
                        (a.assessmentType === 'VISUAL_MODERATION' &&
                          !(a.rawResponse as any)?.top_emotions)
                    );

                    const sections = [
                      {
                        id: 'voice',
                        title: 'Voice Stress',
                        data: latestVoice
                          ? {
                              ...latestVoice.rawResponse,
                              risk_score: latestVoice.riskScore,
                              provider: latestVoice.provider,
                            }
                          : currentMetrics?.voice,
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
                        data: latestVisual
                          ? {
                              ...latestVisual.rawResponse,
                              risk_score: latestVisual.riskScore,
                              provider: latestVisual.provider,
                            }
                          : currentMetrics?.visual,
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
                        data: latestEmotion
                          ? {
                              ...latestEmotion.rawResponse,
                              risk_score: latestEmotion.riskScore,
                              provider: latestEmotion.provider,
                            }
                          : currentMetrics?.expression,
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
              </Card>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}
