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

// Track global destruction promise to handle React Strict Mode async cleanup race conditions
let dailyDestroyPromise: Promise<void> | null = null;

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
        // Validation: Check for ANY existing global instance and destroy it
        const existingCall = DailyIframe.getCallInstance();
        if (existingCall) {
          console.log('[DailyVideoPlayer] Found orphan Daily instance. Destroying...');
          try {
            await existingCall.destroy();
            console.log('[DailyVideoPlayer] Orphan instance destroyed.');
          } catch (e) {
            console.warn('[DailyVideoPlayer] Failed to destroy orphan instance:', e);
          }
        }

        // Validation: If a local destroy is pending, wait for it with timeout
        if (dailyDestroyPromise) {
          console.log('[DailyVideoPlayer] Waiting for previous instance to destroy...');
          const timeoutPromise = new Promise<void>((_, reject) => 
            setTimeout(() => reject(new Error('Destroy timeout')), 2000)
          );
          
          try {
            await Promise.race([dailyDestroyPromise, timeoutPromise]);
            console.log('[DailyVideoPlayer] Previous instance destroyed.');
          } catch (e) {
            console.warn('[DailyVideoPlayer] Wait for destroy timed out or failed, proceeding anyway:', e);
          }
          dailyDestroyPromise = null;
        }

         // Double check after await
        if (!containerRef.current) return;
        
        // Final sanity check before creating
        if (DailyIframe.getCallInstance()) {
           console.warn('[DailyVideoPlayer] Instance still exists after cleanup! Waiting 500ms...');
           await new Promise(r => setTimeout(r, 500));
        }

        console.log('[DailyVideoPlayer] Creating new Daily frame...');
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
          console.log('[DailyVideoPlayer] Joined meeting');
          setStatus('joined');
          onJoined?.();
        });

        callFrame.on('left-meeting', () => {
          console.log('[DailyVideoPlayer] Left meeting');
          onLeft?.();
        });

        callFrame.on('error', (e) => {
          console.error('Daily error:', e);
          setStatus('error');
          onError?.(e.errorMsg || 'An unknown error occurred');
        });

        // Hide loader immediately before join to allow pre-join UI interactions
        console.log('[DailyVideoPlayer] Hiding loader and joining room...');
        setStatus('joined'); 
        
        await callFrame.join({ url, token });
        console.log('[DailyVideoPlayer] Join resolved');
        onJoined?.();
      } catch (err: any) {
        console.error('Failed to join Daily room:', err);
        setStatus('error');
        onError?.(err.message || 'Failed to initialize video call');
      }
    };

    initCall();

    return () => {
      if (callRef.current) {
        console.log('[DailyVideoPlayer] Destroying instance...');
        dailyDestroyPromise = callRef.current.destroy()
          .then(() => {
             console.log('[DailyVideoPlayer] Instance destroyed successfully');
          })
          .catch(err => {
             console.error('[DailyVideoPlayer] Error destroying instance:', err);
          });
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
