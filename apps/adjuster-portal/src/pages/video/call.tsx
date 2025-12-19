import { useParams, useNavigate } from 'react-router-dom';
import { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Maximize2, XCircle, AlertCircle } from 'lucide-react';
import { DailyVideoPlayer } from '@tci/ui-components';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { useVideoSession, useJoinVideoRoom, useEndVideoSession } from '@/hooks/use-video';
import { useAuthStore } from '@/stores/auth-store';
import { useToast } from '@/hooks/use-toast';

export function VideoCallPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { toast } = useToast();
  
  const [joinData, setJoinData] = useState<{ url: string; token: string } | null>(null);
  const hasAttemptedJoin = useRef(false);
  
  const { data: session, isLoading: isSessionLoading } = useVideoSession(sessionId || '');
  const joinRoom = useJoinVideoRoom();
  const endSession = useEndVideoSession(sessionId || '');

  useEffect(() => {
    // Only attempt to join once - prevent infinite loop on error
    if (sessionId && user && !joinData && !hasAttemptedJoin.current && !joinRoom.isPending) {
      hasAttemptedJoin.current = true;
      joinRoom.mutate(
        { sessionId, userId: user.id, role: 'ADJUSTER' },
        {
          onSuccess: (data) => {
            setJoinData({ url: data.roomUrl, token: data.token });
          },
          onError: (error: any) => {
            toast({
              title: 'Connection Error',
              description: error.message || 'Failed to join the video room.',
              variant: 'destructive',
            });
          },
        }
      );
    }
  }, [sessionId, user, joinData, joinRoom.isPending, toast]);

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

  if (isSessionLoading || !joinData) {
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
          <Button variant="outline" size="sm" className="bg-slate-800 border-slate-700 text-slate-300">
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
            url={joinData.url} 
            token={joinData.token} 
            onLeft={() => navigate(`/claims/${session?.claimId || ''}`)}
          />
        </div>

        {/* Sidebar Info/Tools */}
        <div className="w-80 flex flex-col gap-4">
          <Card className="bg-slate-900 border-slate-800 p-4">
            <h3 className="text-sm font-semibold text-slate-200 mb-3 uppercase tracking-wider">Session Info</h3>
            <div className="space-y-3">
              <div>
                <p className="text-[10px] text-slate-500 uppercase font-bold">Claimant</p>
                <p className="text-sm text-slate-300">Tan Wei Ming</p>
              </div>
              <div>
                <p className="text-[10px] text-slate-500 uppercase font-bold">Location</p>
                <p className="text-sm text-slate-300 truncate">Petaling Jaya, Selangor</p>
              </div>
            </div>
          </Card>

          <Card className="bg-slate-900 border-slate-800 p-4 flex-1">
            <h3 className="text-sm font-semibold text-slate-200 mb-3 uppercase tracking-wider">Risk Markers</h3>
            <div className="flex flex-col items-center justify-center h-full text-slate-600 text-center px-4">
              <AlertCircle className="h-8 w-8 mb-2 opacity-20" />
              <p className="text-xs">Risk engine will analyze the stream in real-time once the call is fully established.</p>
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
