import React, { useEffect, useRef, useState } from 'react';
import DailyIframe, { DailyCall } from '@daily-co/daily-js';
import { Loader2, VideoOff } from 'lucide-react';

interface DailyVideoPlayerProps {
  url: string;
  token?: string;
  onJoined?: () => void;
  onLeft?: () => void;
  onError?: (error: string) => void;
}

export const DailyVideoPlayer: React.FC<DailyVideoPlayerProps> = ({
  url,
  token,
  onJoined,
  onLeft,
  onError,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const callRef = useRef<DailyCall | null>(null);
  const [status, setStatus] = useState<'loading' | 'joined' | 'error'>('loading');

  useEffect(() => {
    if (!containerRef.current || callRef.current) return;

    const initCall = async () => {
      try {
        const callFrame = DailyIframe.createFrame(containerRef.current!, {
          iframeStyle: {
            width: '100%',
            height: '100%',
            border: '0',
            borderRadius: '8px',
          },
          showLeaveButton: true,
          showFullscreenButton: true,
        });

        callRef.current = callFrame;

        callFrame.on('joined-meeting', () => {
          setStatus('joined');
          onJoined?.();
        });

        callFrame.on('left-meeting', () => {
          onLeft?.();
        });

        callFrame.on('error', (e) => {
          console.error('Daily error:', e);
          setStatus('error');
          onError?.(e.errorMsg || 'An unknown error occurred');
        });

        await callFrame.join({ url, token });
      } catch (err: any) {
        console.error('Failed to join Daily room:', err);
        setStatus('error');
        onError?.(err.message || 'Failed to initialize video call');
      }
    };

    initCall();

    return () => {
      if (callRef.current) {
        callRef.current.destroy();
        callRef.current = null;
      }
    };
  }, [url, token, onJoined, onLeft, onError]);

  return (
    <div className="relative w-full h-full bg-slate-900 rounded-lg overflow-hidden border border-slate-800">
      {status === 'loading' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 bg-slate-900/80 z-10">
          <Loader2 className="h-8 w-8 animate-spin mb-2" />
          <p className="text-sm font-medium">Connecting to secure video session...</p>
        </div>
      )}

      {status === 'error' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-red-400 bg-slate-900 z-10 p-6 text-center">
          <VideoOff className="h-12 w-12 mb-4" />
          <h3 className="text-lg font-semibold mb-2">Video Connection Failed</h3>
          <p className="text-sm text-slate-400 max-w-xs">
            We couldn't establish a connection to the video room. Please check your internet and try again.
          </p>
        </div>
      )}

      <div ref={containerRef} className="w-full h-full" />
    </div>
  );
};
