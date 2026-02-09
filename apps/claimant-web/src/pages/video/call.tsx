import { useParams, useNavigate } from 'react-router-dom';
import { useState, useEffect, useRef, useCallback } from 'react';
import { DailyVideoPlayer, DailyVideoPlayerRef } from '@tci/ui-components';
import {
  useJoinVideoRoom,
  useAnalyzeExpression,
  useAnalyzeVisualBehavior,
} from '@/hooks/use-video';
import { useAuthStore } from '@/stores/auth-store';
import { Button } from '@/components/ui/button';
import { XCircle, Loader2, Mic } from 'lucide-react';
import { useAudioRecorder } from '@/hooks/use-audio-recorder';
import { useVideoRecorder } from '@/hooks/use-video-recorder';
import { DailyProvider } from '@daily-co/daily-react';

export function ClaimantVideoCallPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const { user } = useAuthStore();

  const [joinData, setJoinData] = useState<{ url: string; token: string; claimId: string } | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);
  const [callObject, setCallObject] = useState<any>(null);
  const hasAttemptedJoin = useRef(false);

  const joinRoom = useJoinVideoRoom();
  const analyzeExpression = useAnalyzeExpression();
  const analyzeVisualBehavior = useAnalyzeVisualBehavior();
  const {
    startRecording: startAudioRecording,
    stopRecording: stopAudioRecording,
    getAudioBlob,
    isRecording: isAudioRecording,
  } = useAudioRecorder();
  const {
    startRecording: startVideoRecording,
    stopRecording: stopVideoRecording,
    getVideoBlob,
    takeSnapshot,
    isRecording: isVideoRecording,
  } = useVideoRecorder({ bufferDurationMs: 5000 });
  const playerRef = useRef<DailyVideoPlayerRef>(null);

  // Ensure user has completed the verification wizard
  useEffect(() => {
    if (!sessionId) return;
    const nricVerified = sessionStorage.getItem(`nric_verified_${sessionId}`);
    const locationVerified = sessionStorage.getItem(`location_verified_${sessionId}`);

    if (!nricVerified || !locationVerified) {
      navigate(`/video/${sessionId}/join`, { replace: true });
    }
  }, [sessionId, navigate]);

  // Handle uploading audio for analysis
  const handleUploadAudio = useCallback(async () => {
    try {
      const blob = await getAudioBlob();
      if (!blob || blob.size === 0) {
        console.error('No audio blob available (recording too short?)');
        return;
      }

      if (!sessionId) {
        console.error('Session ID is missing, cannot upload audio.');
        return;
      }

      const formData = new FormData();
      formData.append('file', blob, 'claimant-audio.webm');
      formData.append('sessionId', sessionId);
      const response = await fetch('http://localhost:3000/api/v1/risk/upload-audio', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
    } catch (err) {
      console.error('Failed to upload audio:', err);
    }
  }, [getAudioBlob, sessionId]);

  useEffect(() => {
    return () => {
      stopAudioRecording();
      stopVideoRecording();
    };
  }, [stopAudioRecording, stopVideoRecording]);

  useEffect(() => {
    // Check for NRIC verification in sessionStorage
    const isVerified = sessionStorage.getItem(`nric_verified_${sessionId}`) === 'true';
    const locationVerified = sessionStorage.getItem(`location_verified_${sessionId}`) === 'true';

    if (!isVerified && sessionId) {
      console.log(
        `[ClaimantVideoCallPage] NRIC not verified for session ${sessionId}, redirecting...`
      );
      navigate(`/video/${sessionId}/join`);
      return;
    }

    if (!locationVerified && sessionId) {
      navigate(`/video/${sessionId}/join`);
      return;
    }

    const doJoin = async () => {
      if (!sessionId || !user?.id || hasAttemptedJoin.current) return;

      hasAttemptedJoin.current = true;
      setError(null);

      try {
        const result = await joinRoom.mutateAsync({
          sessionId,
          userId: user.id,
        });
        setJoinData({
          url: result.roomUrl,
          token: result.token,
          claimId: result.claimId,
        });

        // Start recording immediately when joining
        startAudioRecording();
        startVideoRecording();
      } catch (err: any) {
        console.error('[ClaimantVideoCallPage] Join failed:', err);
        setError(err.message || 'Failed to join video room');
      }
    };

    doJoin();
  }, [sessionId, user?.id, joinRoom, startAudioRecording, startVideoRecording]);

  const attemptRetry = () => {
    hasAttemptedJoin.current = false;
    setJoinData(null);
    setError(null);
    window.location.reload();
  };

  const handleEndCall = () => {
    stopAudioRecording();
    stopVideoRecording();
    navigate('/tracker');
  };

  // Handle uploading screenshot
  const handleUploadScreenshot = useCallback(async () => {
    if (!sessionId || !joinData?.claimId) {
      return;
    }

    try {
      const blob = await takeSnapshot();
      if (!blob) {
        playerRef.current?.sendAppMessage({ type: 'screenshot-uploaded', success: false });
        return;
      }

      console.log(`[VideoCallPage] Screenshot captured: ${blob.size} bytes`);
      const formData = new FormData();
      formData.append('type', 'CLAIMANT_SCREENSHOT');
      formData.append('file', blob, `screenshot-${Date.now()}.png`);
      const uploadUrl = `/claims/${joinData.claimId}/documents/upload`;
      const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000/api/v1';
      const response = await fetch(`${baseUrl}${uploadUrl}`, {
        method: 'POST',
        body: formData,
        headers: {
          Authorization: `Bearer ${useAuthStore.getState().accessToken}`,
        },
      });

      if (response.ok) {
        playerRef.current?.sendAppMessage({ type: 'screenshot-uploaded', success: true });
      } else {
        const errText = await response.text();
        console.error('[VideoCallPage] Screenshot upload failed', response.status, errText);
        playerRef.current?.sendAppMessage({ type: 'screenshot-uploaded', success: false });
      }
    } catch (error) {
      console.error('[VideoCallPage] Failed to capture/upload screenshot:', error);
      playerRef.current?.sendAppMessage({ type: 'screenshot-uploaded', success: false });
    }
  }, [sessionId, joinData?.claimId, takeSnapshot]);

  // Handle Daily app messages (signaling)
  const handleAppMessage = useCallback(
    async (e: any) => {
      if (e?.data?.type === 'request-screenshot') {
        console.log('[VideoCallPage] Triggering screenshot capture');
        handleUploadScreenshot();
        return;
      }

      if (e?.data?.type === 'request-voice-analysis') {
        console.log('[VideoCallPage] Triggering audio upload from signal');
        try {
          handleUploadAudio();
        } catch (err) {
          console.error('[VideoCallPage] Error calling handleUploadAudio:', err);
        }
      }

      if (e?.data?.type === 'request-expression-analysis') {
        console.log('[VideoCallPage] Triggering expression analysis from signal');
        try {
          // Get the most recent 5 seconds from our rolling buffer
          const blob = await getVideoBlob();
          if (blob && blob.size > 0) {
            await analyzeExpression.mutateAsync({
              sessionId: sessionId || '',
              videoBlob: blob,
            });
            console.log('[VideoCallPage] Expression analysis complete (signal-driven)');
          } else {
            console.warn('[VideoCallPage] No video blob available in buffer');
          }
        } catch (err) {
          console.error('[VideoCallPage] Error during signal-driven expression analysis:', err);
        }
      }

      if (e?.data?.type === 'request-visual-analysis') {
        console.log('[VideoCallPage] Triggering visual behavior analysis from signal');
        try {
          const blob = await getVideoBlob();
          if (blob && blob.size > 0) {
            await analyzeVisualBehavior.mutateAsync({
              sessionId: sessionId || '',
              videoBlob: blob,
            });
            console.log('[VideoCallPage] Visual analysis uploaded (signal-driven)');
          }
        } catch (err) {
          console.error('[VideoCallPage] Error during signal-driven visual analysis:', err);
        }
      }
    },
    [
      handleUploadAudio,
      handleUploadScreenshot,
      sessionId,
      analyzeExpression,
      analyzeVisualBehavior,
      getVideoBlob,
    ]
  );

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-6 text-center bg-background text-foreground">
        <XCircle className="h-16 w-16 text-destructive mb-4" />
        <h2 className="text-xl font-bold mb-2">Connection Failed</h2>
        <p className="text-muted-foreground mb-6 max-w-xs">{error}</p>
        <div className="flex flex-col gap-3 w-full max-w-xs">
          <Button onClick={attemptRetry} className="w-full">
            Try Again
          </Button>
          <Button onClick={() => navigate('/tracker')} variant="outline" className="w-full">
            Back
          </Button>
        </div>
      </div>
    );
  }

  if (!joinData) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background text-foreground">
        <Loader2 className="h-10 w-10 animate-spin text-primary mb-4" />
        <p className="text-lg font-medium">Entering video room...</p>
      </div>
    );
  }

  return (
    <DailyProvider callObject={callObject}>
      <div className="absolute inset-0 bg-background flex flex-col z-50">
        {/* Mobile Header */}
        <div className="bg-card/80 backdrop-blur-md p-4 flex items-center justify-between border-b border-border">
          <div>
            <h1 className="text-foreground font-semibold text-sm">Remote Assessment</h1>
            <div className="flex items-center gap-2">
              <p className="text-xs text-muted-foreground">Secure Professional Connection</p>
              {(isAudioRecording || isVideoRecording) && (
                <span className="flex items-center text-[10px] text-red-500 gap-1 bg-red-500/10 px-1.5 py-0.5 rounded-full animate-pulse">
                  <Mic className="h-3 w-3" /> REC {isVideoRecording && 'VIDEO'}
                </span>
              )}
            </div>
          </div>
          <Button variant="destructive" size="sm" onClick={handleEndCall}>
            Exit
          </Button>
        </div>

        {/* Fullscreen Video Area */}
        <div className="flex-1 relative overflow-hidden">
          <DailyVideoPlayer
            ref={playerRef}
            url={joinData.url}
            token={joinData.token}
            onLeft={handleEndCall}
            onAppMessage={handleAppMessage}
            onCallFrameCreated={setCallObject}
          />
        </div>

        {/* Mobile Footer / Info */}
        <div className="p-4 bg-background text-center border-t border-border">
          <p className="text-[10px] text-muted-foreground uppercase tracking-widest">
            End-to-End Encrypted Session
          </p>
        </div>
      </div>
    </DailyProvider>
  );
}
