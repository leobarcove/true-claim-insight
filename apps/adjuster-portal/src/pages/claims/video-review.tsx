import { useParams, useNavigate } from 'react-router-dom';
import { useState, useEffect, useRef, useCallback } from 'react';
import { ArrowLeft, Play, Pause, AlertCircle, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useClaim } from '@/hooks/use-claims';
import {
  useVideoUpload,
  useVideoUploadDeception,
  useProcessVideoSegment,
  useGenerateVideoConsent,
} from '@/hooks/use-video-upload';
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

  const { data: claim } = useClaim(claimId || '');

  // Use new hooks
  const { data: videoUpload, isLoading: isLoadingUpload } = useVideoUpload(uploadId || '');
  const { data: deceptionData, refetch: refetchDeception } = useVideoUploadDeception(
    uploadId || '',
    isPlaying
  );
  const processSegment = useProcessVideoSegment(uploadId || '');
  const generateConsent = useGenerateVideoConsent(uploadId || '');

  // Initialize video
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !videoUpload) return;

    const handleLoadedMetadata = () => {
      setDuration(video.duration);
      // Resume from last processed time
      if (videoUpload.processedUntil > 0) {
        video.currentTime = videoUpload.processedUntil;
        setCurrentTime(videoUpload.processedUntil);
        setLastProcessedTime(videoUpload.processedUntil);
      }
    };

    const handleTimeUpdate = () => {
      setCurrentTime(video.currentTime);
    };

    const handleEnded = () => {
      setIsPlaying(false);
      setHasWatchedToEnd(true);

      // Generate consent form
      if (videoUpload.status === 'PROCESSING') {
        generateConsent.mutate();
      }
    };

    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('ended', handleEnded);

    return () => {
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('ended', handleEnded);
    };
  }, [videoUpload]);

  // Handle processSegment success
  useEffect(() => {
    if (processSegment.isSuccess && processSegment.data) {
      const data = processSegment.data;
      setLastProcessedTime(data.processedUntil);
      refetchDeception();

      // Update metrics history
      if (data.metrics) {
        setMetricsHistory(prev => {
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
    if (!isPlaying || !videoRef.current) {
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

      const currentSegmentEnd = Math.floor(video.currentTime);
      const nextProcessPoint = lastProcessedTime + SEGMENT_DURATION;

      // Only process if we've moved forward enough
      if (currentSegmentEnd >= nextProcessPoint) {
        processSegment.mutate({
          startTime: lastProcessedTime,
          endTime: currentSegmentEnd,
        });
      }
    }, 2500); // Check every 2.5 seconds

    return () => {
      if (processingIntervalRef.current) {
        clearInterval(processingIntervalRef.current);
      }
    };
  }, [isPlaying, lastProcessedTime]);

  const handlePlayPause = () => {
    const video = videoRef.current;
    if (!video) return;

    if (isPlaying) {
      video.pause();
      setIsPlaying(false);
    } else {
      video.play();
      setIsPlaying(true);
    }
  };

  const handleComplete = () => {
    navigate(`/claims/${claimId}`);
  };

  const progressPercentage = duration > 0 ? (currentTime / duration) * 100 : 0;
  const processedPercentage = duration > 0 ? (lastProcessedTime / duration) * 100 : 0;

  if (isLoadingUpload) {
    return (
      <div className="flex h-full items-center justify-center bg-slate-950">
        <div className="text-center text-slate-200">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mb-4 mx-auto" />
          <p className="text-lg font-medium">Loading video...</p>
        </div>
      </div>
    );
  }

  if (!videoUpload) {
    return (
      <div className="flex h-full items-center justify-center bg-slate-950">
        <div className="text-center text-slate-200">
          <AlertCircle className="h-12 w-12 text-red-500 mb-4 mx-auto" />
          <p className="text-lg font-medium">Video not found</p>
          <Button variant="outline" className="mt-4" onClick={() => navigate(`/claims/${claimId}`)}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Claim
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-slate-950">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-slate-800 bg-slate-900/50">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            className="text-slate-400 hover:text-white"
            onClick={() => navigate(`/claims/${claimId}`)}
            disabled={isPlaying}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <div>
            <h1 className="text-md font-semibold text-white">Video Assessment Review</h1>
            <div className="flex items-center gap-2 mt-0.5">
              <Badge
                variant="outline"
                className="text-[10px] uppercase tracking-wider bg-primary/10 text-primary border-primary/20"
              >
                {videoUpload.status}
              </Badge>
              <span className="text-xs text-slate-500">Claim: {claim?.claimNumber || claimId}</span>
            </div>
          </div>
        </div>

        {hasWatchedToEnd && (
          <Button variant="default" size="sm" onClick={handleComplete}>
            <CheckCircle2 className="h-4 w-4 mr-2" />
            Complete Review
          </Button>
        )}
      </div>

      {/* Main Content */}
      <div className="flex-1 p-4 flex gap-4 overflow-hidden">
        {/* Video Player */}
        <div className="flex-1 flex flex-col gap-4">
          <div className="relative rounded-xl overflow-hidden shadow-2xl bg-black flex-1">
            <video
              ref={videoRef}
              src={videoUpload.videoUrl}
              className="w-full h-full object-contain"
              controlsList="nodownload nofullscreen noremoteplayback"
              disablePictureInPicture
              onContextMenu={e => e.preventDefault()}
            />
          </div>

          {/* Custom Controls */}
          <Card className="bg-slate-900 border-slate-800 p-4">
            <div className="space-y-3">
              {/* Progress Bar */}
              <div className="relative">
                <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                  {/* Processed portion (green) */}
                  <div
                    className="absolute h-full bg-green-600/50 transition-all"
                    style={{ width: `${processedPercentage}%` }}
                  />
                  {/* Current playback position (blue) */}
                  <div
                    className="absolute h-full bg-primary transition-all"
                    style={{ width: `${progressPercentage}%` }}
                  />
                </div>
                <div className="flex justify-between text-xs text-slate-400 mt-1">
                  <span>{formatTime(currentTime)}</span>
                  <span>{formatTime(duration)}</span>
                </div>
              </div>

              {/* Play/Pause Button */}
              <div className="flex items-center justify-center gap-4">
                <Button
                  variant="outline"
                  size="lg"
                  onClick={handlePlayPause}
                  className="bg-slate-800 border-slate-700"
                >
                  {isPlaying ? (
                    <>
                      <Pause className="h-5 w-5 mr-2" />
                      Pause
                    </>
                  ) : (
                    <>
                      <Play className="h-5 w-5 mr-2" />
                      Play
                    </>
                  )}
                </Button>
              </div>

              {/* Info */}
              <div className="text-center text-xs text-slate-500">
                <p>Video controls are limited. You must watch the entire video for processing.</p>
                <p className="mt-1">
                  Processed: {formatTime(lastProcessedTime)} / {formatTime(duration)}
                </p>
              </div>
            </div>
          </Card>
        </div>

        {/* Right Sidebar - Metrics */}
        <div className="w-96 flex flex-col gap-4">
          {/* Deception Score */}
          <Card className="bg-slate-900 border-slate-800 p-4 flex-1 flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <h3 className="text-xs font-semibold text-slate-200 uppercase tracking-wider">
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
                className="text-[10px] h-5 border-emerald-700 text-emerald-400"
              >
                {isPlaying ? 'PROCESSING' : 'PAUSED'}
              </Badge>
            </div>

            <div className="flex items-end gap-2 mb-4">
              <span className="text-2xl font-bold text-white">
                {((deceptionData?.deceptionScore || 0) * 100).toFixed(2)}
              </span>
              <span className="text-xs text-slate-500 mb-1">/ 100.00</span>
            </div>

            {/* Metrics Graph */}
            <div className="flex-1 min-h-0">
              <p className="text-[10px] text-slate-500 font-bold mb-2 uppercase">
                Real-time Metrics
              </p>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={metricsHistory}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.5} />
                  <XAxis dataKey="time" hide />
                  <YAxis domain={[0, 100]} hide />
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
            <div className="mt-4 space-y-3">
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
                  value: ((deceptionData?.breakdown?.expressionMeasurement || 0) * 100).toFixed(2),
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
      </div>
    </div>
  );
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}
