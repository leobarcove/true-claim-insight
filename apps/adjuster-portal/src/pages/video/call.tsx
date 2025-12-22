import { useParams, useNavigate } from 'react-router-dom';
import { useState, useEffect, useRef, useCallback } from 'react';
import { ArrowLeft, Maximize2, XCircle, AlertCircle, RefreshCw } from 'lucide-react';
import { DailyVideoPlayer, DailyVideoPlayerRef } from '@tci/ui-components';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { useVideoSession, useJoinVideoRoom, useEndVideoSession, useRiskAssessments, useTriggerAssessment } from '@/hooks/use-video';
import { useClaim } from '@/hooks/use-claims';
import { useAuthStore } from '@/stores/auth-store';
import { useToast } from '@/hooks/use-toast';
import { ShieldAlert, ShieldCheck, ShieldMinus, Zap } from 'lucide-react';

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
  
  // Ref to prevent navigation during analysis
  const isAnalyzingRef = useRef(false);


  // Effect to trigger join and set data directly
  useEffect(() => {
    const doJoin = async () => {
      if (!sessionId || !user?.id || hasAttemptedJoin.current) return;
      
      hasAttemptedJoin.current = true;
      
      try {
        const result = await joinRoom.mutateAsync({ 
          sessionId, 
          userId: user.id, 
          role: 'ADJUSTER' 
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
    console.log('[VideoCallPage] onLeft triggered, isAnalyzing:', isAnalyzingRef.current);
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
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-slate-950 overflow-hidden">
      {/* Video Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/50">
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
            <h1 className="text-lg font-semibold text-white">
              Video Assessment: {session?.claimId || 'Loading...'}
            </h1>
            <div className="flex items-center gap-2 mt-0.5">
              <Badge variant="outline" className="text-[10px] uppercase tracking-wider bg-primary/10 text-primary border-primary/20">
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
            className="bg-slate-800 border-slate-700 text-slate-300"
            onClick={() => playerRef.current?.requestFullscreen()}
          >
            <Maximize2 className="h-4 w-4 mr-2" />
            Fullscreen
          </Button>
          <Button variant="destructive" size="sm" onClick={handleEndCall}>
            <XCircle className="h-4 w-4 mr-2" />
            End Assessment
          </Button>
        </div>
      </div>

      {/* Main Video Area */}
      <div className="flex-1 p-4 flex gap-4 overflow-hidden">
        {/* Remote/Main Video */}
        <div className="flex-1 relative rounded-xl overflow-hidden shadow-2xl bg-slate-900 border border-slate-800">
          <DailyVideoPlayer 
            key={`daily-${joinData.url}`}
            ref={playerRef}
            url={joinData.url} 
            token={joinData.token} 
            onLeft={handleVideoLeft}
          />
        </div>

        {/* Sidebar Info/Tools */}
        <div className="w-80 flex flex-col gap-4">
          <Card className="bg-slate-900 border-slate-800 p-4">
            <h3 className="text-sm font-semibold text-slate-200 mb-3 uppercase tracking-wider">Session Info</h3>
            <div className="space-y-3">
              <div>
                <p className="text-[10px] text-slate-500 uppercase font-bold">Claimant</p>
                <p className="text-sm text-slate-300">
                  {isClaimLoading ? 'Loading...' : claim?.claimant?.fullName || 'N/A'}
                </p>
              </div>
              <div>
                <p className="text-[10px] text-slate-500 uppercase font-bold">Location</p>
                <p className="text-sm text-slate-300 truncate">
                  {isClaimLoading ? 'Loading...' : claim?.incidentLocation?.address || 'N/A'}
                </p>
              </div>
            </div>
          </Card>

          <Card className="bg-slate-900 border-slate-800 p-4 flex-1 flex flex-col">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-slate-200 uppercase tracking-wider">Risk Analysis</h3>
              <Badge variant="outline" className="text-[10px] h-5 border-emerald-700 text-emerald-400 animate-pulse">
                LIVE
              </Badge>
            </div>
            
            <div className="flex-1 overflow-auto space-y-3 min-h-0">
              {assessments && assessments.length > 0 ? (
                assessments.map((marker) => {
                  const raw = marker.rawResponse as any;
                  const isVoice = marker.assessmentType === 'VOICE_ANALYSIS';
                  
                  return (
                    <div key={marker.id} className="p-3 rounded-lg bg-slate-800/70 border border-slate-700/50 animate-in fade-in slide-in-from-right-2">
                      {/* Header */}
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          {marker.riskScore === 'HIGH' && <ShieldAlert className="h-4 w-4 text-red-500" />}
                          {marker.riskScore === 'MEDIUM' && <ShieldMinus className="h-4 w-4 text-amber-500" />}
                          {marker.riskScore === 'LOW' && <ShieldCheck className="h-4 w-4 text-emerald-500" />}
                          <span className="text-xs font-semibold text-slate-200">
                            {isVoice ? 'Voice Stress' : 'Visual Behavior'}
                          </span>
                        </div>
                        <Badge 
                          variant={
                            marker.riskScore === 'HIGH' ? 'destructive' : 
                            marker.riskScore === 'MEDIUM' ? 'secondary' : 'default'
                          }
                          className="text-[9px] h-5 px-2"
                        >
                          {marker.riskScore || 'PENDING'}
                        </Badge>
                      </div>
                      
                      {/* Metrics Grid */}
                      <div className="grid grid-cols-2 gap-2 text-[10px]">
                        {isVoice ? (
                          <>
                            <div className="bg-slate-900/50 rounded p-2">
                              <p className="text-slate-500 uppercase font-bold">Jitter</p>
                              <p className={`text-sm font-mono ${(raw?.jitter_percent ?? 0) > 1.5 ? 'text-red-400' : 'text-slate-200'}`}>
                                {raw?.jitter_percent?.toFixed(2) ?? '—'}%
                              </p>
                            </div>
                            <div className="bg-slate-900/50 rounded p-2">
                              <p className="text-slate-500 uppercase font-bold">Shimmer</p>
                              <p className={`text-sm font-mono ${(raw?.shimmer_percent ?? 0) > 3 ? 'text-amber-400' : 'text-slate-200'}`}>
                                {raw?.shimmer_percent?.toFixed(2) ?? '—'}%
                              </p>
                            </div>
                            <div className="bg-slate-900/50 rounded p-2">
                              <p className="text-slate-500 uppercase font-bold">Pitch SD</p>
                              <p className={`text-sm font-mono ${(raw?.pitch_sd_hz ?? 0) > 40 ? 'text-amber-400' : 'text-slate-200'}`}>
                                {raw?.pitch_sd_hz?.toFixed(1) ?? '—'} Hz
                              </p>
                            </div>
                            <div className="bg-slate-900/50 rounded p-2">
                              <p className="text-slate-500 uppercase font-bold">HNR</p>
                              <p className="text-sm font-mono text-slate-200">
                                {raw?.hnr_db?.toFixed(1) ?? '—'} dB
                              </p>
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="bg-slate-900/50 rounded p-2">
                              <p className="text-slate-500 uppercase font-bold">Blink Rate</p>
                              <p className={`text-sm font-mono ${
                                ((raw?.blink_rate_per_min ?? 17) < 10 || (raw?.blink_rate_per_min ?? 17) > 25) 
                                  ? 'text-amber-400' : 'text-slate-200'
                              }`}>
                                {raw?.blink_rate_per_min?.toFixed(1) ?? '—'}/min
                              </p>
                            </div>
                            <div className="bg-slate-900/50 rounded p-2">
                              <p className="text-slate-500 uppercase font-bold">Lip Tension</p>
                              <p className={`text-sm font-mono ${(raw?.avg_lip_tension ?? 1) < 0.7 ? 'text-amber-400' : 'text-slate-200'}`}>
                                {raw?.avg_lip_tension?.toFixed(3) ?? '—'}
                              </p>
                            </div>
                            <div className="bg-slate-900/50 rounded p-2">
                              <p className="text-slate-500 uppercase font-bold">Blink Dur.</p>
                              <p className="text-sm font-mono text-slate-200">
                                {raw?.avg_blink_duration_ms?.toFixed(0) ?? '—'} ms
                              </p>
                            </div>
                            <div className="bg-slate-900/50 rounded p-2">
                              <p className="text-slate-500 uppercase font-bold">Frames</p>
                              <p className="text-sm font-mono text-slate-200">
                                {raw?.frames_analyzed ?? '—'}
                              </p>
                            </div>
                          </>
                        )}
                      </div>
                      
                      {/* Footer */}
                      <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-700/50">
                        <span className="text-[9px] text-slate-500">{marker.provider}</span>
                        <span className="text-[9px] text-slate-500">
                          Conf: {((marker.confidence ?? 0) * 100).toFixed(0)}%
                        </span>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-slate-600 text-center px-4 py-8">
                  <AlertCircle className="h-8 w-8 mb-2 opacity-20" />
                  <p className="text-xs">Click below to trigger an analysis.</p>
                </div>
              )}
            </div>

            <div className="mt-4 pt-4 border-t border-slate-800 space-y-2">
              <Button 
                type="button"
                variant="outline" 
                size="sm" 
                className="w-full text-[11px] h-8 border-primary/30 text-primary hover:bg-primary/10"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  
                  if (playerRef.current) {
                    console.log('[VideoCallPage] Sending voice analysis request to claimant');
                    playerRef.current.sendAppMessage({ type: 'request-voice-analysis' });
                    toast({
                      title: 'Request Sent',
                      description: 'Asking claimant device to send audio sample...',
                    });
                    
                    // Simulate "pending" state or just wait for polling
                    isAnalyzingRef.current = true;
                    setTimeout(() => {
                      isAnalyzingRef.current = false;
                    }, 5000); 
                  } else {
                    toast({
                      title: 'Error',
                      description: 'Video connection not ready.',
                      variant: 'destructive',
                    });
                  }
                }}
                disabled={false} // Always enable if connected
              >
                <Zap className="h-3 w-3 mr-2" />
                Analyze Voice Stress (Live)
              </Button>
              <Button 
                type="button"
                variant="outline" 
                size="sm" 
                className="w-full text-[11px] h-8 border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/10"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  isAnalyzingRef.current = true;
                  console.log('[VideoCallPage] Starting visual analysis, isAnalyzing set to true');
                  triggerAssessment.mutate(
                    { sessionId: sessionId || '', assessmentType: 'VISUAL' },
                    {
                      onSettled: () => {
                        setTimeout(() => {
                          isAnalyzingRef.current = false;
                          console.log('[VideoCallPage] Visual analysis settled, isAnalyzing set to false');
                        }, 1000);
                      }
                    }
                  );
                }}
                disabled={triggerAssessment.isPending}
              >
                <ShieldCheck className="h-3 w-3 mr-2" />
                Analyze Visual Behavior
              </Button>
            </div>
          </Card>
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
