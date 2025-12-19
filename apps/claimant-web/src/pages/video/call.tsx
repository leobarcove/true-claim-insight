import { useParams, useNavigate } from 'react-router-dom';
import { useState, useEffect, useRef } from 'react';
import { DailyVideoPlayer } from '@tci/ui-components';
import { useJoinVideoRoom } from '@/hooks/use-video';
import { useAuthStore } from '@/stores/auth-store';
import { Button } from '@/components/ui/button';
import { XCircle, Loader2, RefreshCw, ArrowLeft } from 'lucide-react';

export function ClaimantVideoCallPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  
  const [joinData, setJoinData] = useState<{ url: string; token: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const hasAttemptedJoin = useRef(false);
  
  const joinRoom = useJoinVideoRoom();

  useEffect(() => {
    // Check for NRIC verification in sessionStorage
    const isVerified = sessionStorage.getItem(`nric_verified_${sessionId}`) === 'true';
    
    if (!isVerified && sessionId) {
      console.log(`[ClaimantVideoCallPage] NRIC not verified for session ${sessionId}, redirecting...`);
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
          userId: user.id 
        });
        setJoinData({ url: result.roomUrl, token: result.token });
      } catch (err: any) {
        console.error('[ClaimantVideoCallPage] Join failed:', err);
        setError(err.message || 'Failed to join video room');
      }
    };

    doJoin();
  }, [sessionId, user?.id]);

  const attemptRetry = () => {
    hasAttemptedJoin.current = false;
    setJoinData(null);
    setError(null);
    // The effect will re-run as hasAttemptedJoin.current is now false
    // But since dependencies haven't changed, we might need to manually call doJoin or force a re-render.
    // Actually, setting joinData to null might not trigger the effect.
    // Let's use a trigger state or just call it.
    window.location.reload(); // Simple solution for dev-test reliability
  };

  const handleEndCall = () => {
    navigate('/tracker');
  };

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
    <div className="fixed inset-0 bg-black flex flex-col z-50">
      {/* Mobile Header */}
      <div className="bg-slate-900/80 backdrop-blur-md p-4 flex items-center justify-between border-b border-slate-800">
        <div>
          <h1 className="text-white font-semibold text-sm">Remote Assessment</h1>
          <p className="text-xs text-slate-400">Secure Professional Connection</p>
        </div>
        <Button variant="destructive" size="sm" onClick={handleEndCall}>
          Exit
        </Button>
      </div>

      {/* Fullscreen Video Area */}
      <div className="flex-1 relative overflow-hidden">
        <DailyVideoPlayer 
          url={joinData.url} 
          token={joinData.token} 
          onLeft={handleEndCall}
        />
      </div>

      {/* Mobile Footer / Info */}
      <div className="p-4 bg-slate-950 text-center">
        <p className="text-[10px] text-slate-500 uppercase tracking-widest">
          End-to-End Encrypted Session
        </p>
      </div>
    </div>
  );
}
