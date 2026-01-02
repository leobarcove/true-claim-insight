import { useParams, useNavigate } from 'react-router-dom';
import { useState, useEffect, useRef, useCallback } from 'react';
import { DailyVideoPlayer, DailyVideoPlayerRef } from '@tci/ui-components';
import { useJoinVideoRoom, useAnalyzeExpression } from '@/hooks/use-video';
import { useAuthStore } from '@/stores/auth-store';
import { Button } from '@/components/ui/button';
import { XCircle, Loader2, RefreshCw, ArrowLeft, Mic } from 'lucide-react';
import { useAudioRecorder } from '@/hooks/use-audio-recorder';
import { useVideoRecorder } from '@/hooks/use-video-recorder';
import { DailyProvider } from '@daily-co/daily-react';

export function ClaimantVideoCallPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const { user } = useAuthStore();

  const [joinData, setJoinData] = useState<{ url: string; token: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [callObject, setCallObject] = useState<any>(null);
  const hasAttemptedJoin = useRef(false);

  const joinRoom = useJoinVideoRoom();
  const analyzeExpression = useAnalyzeExpression();
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
    isRecording: isVideoRecording,
  } = useVideoRecorder({ bufferDurationMs: 5000 });
  const playerRef = useRef<DailyVideoPlayerRef>(null);

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

    if (!isVerified && sessionId) {
      console.log(
        `[ClaimantVideoCallPage] NRIC not verified for session ${sessionId}, redirecting...`
      );
      navigate(`/video/${sessionId}/verify-nric`);
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
        setJoinData({ url: result.roomUrl, token: result.token });

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

  // Handle Daily app messages (signaling)
  const handleAppMessage = useCallback(
    async (e: any) => {
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
    },
    [handleUploadAudio, sessionId, analyzeExpression, getVideoBlob]
  );

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-6 text-center bg-slate-950 text-slate-200">
        <XCircle className="h-16 w-16 text-red-500 mb-4" />
        <h2 className="text-xl font-bold mb-2">Connection Failed</h2>
        <p className="text-slate-400 mb-6 max-w-xs">{error}</p>
        <div className="flex flex-col gap-3 w-full max-w-xs">
          <Button onClick={attemptRetry} className="w-full">
            <RefreshCw className="h-4 w-4 mr-2" />
            Try Again
          </Button>
          <Button onClick={() => navigate('/tracker')} variant="outline" className="w-full">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Tracker
          </Button>
        </div>
      </div>
    );
  }

  if (!joinData) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-950 text-slate-200">
        <Loader2 className="h-10 w-10 animate-spin text-primary mb-4" />
        <p className="text-lg font-medium">Entering video room...</p>
      </div>
    );
  }

  return (
    <DailyProvider callObject={callObject}>
      <div className="fixed inset-0 bg-black flex flex-col z-50">
        {/* Mobile Header */}
        <div className="bg-slate-900/80 backdrop-blur-md p-4 flex items-center justify-between border-b border-slate-800">
          <div>
            <h1 className="text-white font-semibold text-sm">Remote Assessment</h1>
            <div className="flex items-center gap-2">
              <p className="text-xs text-slate-400">Secure Professional Connection</p>
              {(isAudioRecording || isVideoRecording) && (
                <span className="flex items-center text-[10px] text-red-400 gap-1 bg-red-900/20 px-1.5 py-0.5 rounded-full animate-pulse">
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
        <div className="p-4 bg-slate-950 text-center">
          {/* <div className="absolute top-4 left-4 z-50 bg-black/50 p-2 rounded text-white text-left">
            <p>Audio: {isAudioRecording ? '🔴' : '⚪'}</p>
            <p>Video: {isVideoRecording ? '🔴' : '⚪'}</p>
            <button
              className="mt-2 bg-blue-500 px-3 py-1 rounded hover:bg-blue-600 font-bold"
              onClick={handleUploadAudio}
            >
              🐞 Test Upload
            </button>
            <button
              className="mt-2 ml-2 bg-purple-500 px-3 py-1 rounded hover:bg-purple-600 font-bold"
              onClick={async () => {
                try {
                  const blob = await getVideoBlob();
                  if (blob) {
                    await analyzeExpression.mutateAsync({
                      sessionId: sessionId || '',
                      videoBlob: blob,
                    });
                    console.log('Expression analysis triggered manually');
                  }
                } catch (err) {
                  console.error('Expression analysis failed:', err);
                }
              }}
              disabled={analyzeExpression.isPending}
            >
              {analyzeExpression.isPending ? 'Analyzing...' : '🐞 Analyze Expression'}
            </button>
          </div> */}
          <p className="text-[10px] text-slate-500 uppercase tracking-widest">
            End-to-End Encrypted Session
          </p>
        </div>
      </div>
    </DailyProvider>
  );
}
