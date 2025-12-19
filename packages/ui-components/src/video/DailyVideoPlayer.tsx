import { useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react';
import DailyIframe, { DailyCall } from '@daily-co/daily-js';
import { Loader2, VideoOff } from 'lucide-react';

export interface DailyVideoPlayerProps {
  url: string;
  token?: string;
  onJoined?: () => void;
  onLeft?: () => void;
  onError?: (error: string) => void;
}

export interface DailyVideoPlayerRef {
  requestFullscreen: () => void;
  exitFullscreen: () => void;
}

// Track global destruction promise to handle React Strict Mode async cleanup race conditions
let dailyDestroyPromise: Promise<void> | null = null;

export const DailyVideoPlayer = forwardRef<DailyVideoPlayerRef, DailyVideoPlayerProps>(({
  url,
  token,
  onJoined,
  onLeft,
  onError,
}, ref) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const callRef = useRef<DailyCall | null>(null);
  const [status, setStatus] = useState<'loading' | 'joined' | 'error'>('loading');

  // Expose methods to parent via ref
  useImperativeHandle(ref, () => ({
    requestFullscreen: () => {
      if (callRef.current) {
        try {
          callRef.current.requestFullscreen();
        } catch (e) {
          console.error('[DailyVideoPlayer] Daily requestFullscreen failed:', e);
          // Fallback to browser native fullscreen on the container
          containerRef.current?.requestFullscreen?.();
        }
      } else {
        // Direct fallback if call isn't ready
        containerRef.current?.requestFullscreen?.();
      }
    },
    exitFullscreen: () => {
      if (callRef.current) {
        try {
          callRef.current.exitFullscreen();
        } catch (e) {
          document.exitFullscreen?.();
        }
      } else {
        document.exitFullscreen?.();
      }
    },
  }));

  useEffect(() => {
    if (!containerRef.current || callRef.current) return;

    const initCall = async () => {
      try {
        
        let callFrame: DailyCall | null = null;
        let retryCount = 0;
        const maxRetries = 3;

        while (retryCount < maxRetries) {
          try {
            // 1. Check for global instance and destroy if it exists
            const existingCall = DailyIframe.getCallInstance();
            if (existingCall) {
              await existingCall.destroy();
              // Small pause to let Daily JS internal state update
              await new Promise(r => setTimeout(r, 200));
            }

            // 2. Wait for any pending local destroy promise
            if (dailyDestroyPromise) {
              const timeoutPromise = new Promise<void>((_, reject) => 
                setTimeout(() => reject(new Error('Destroy timeout')), 2000)
              );
              try {
                await Promise.race([dailyDestroyPromise, timeoutPromise]);
              } catch (e) {
                console.warn('[DailyVideoPlayer] Wait for destroy timed out, proceeding...');
              }
              dailyDestroyPromise = null;
            }

            // 3. Clear container to ensure fresh start
            if (containerRef.current) {
              containerRef.current.innerHTML = '';
            } else {
              return; // Unmounted
            }

            // 4. Attempt to create the frame
            callFrame = DailyIframe.createFrame(containerRef.current!, {
              iframeStyle: {
                width: '100%',
                height: '100%',
                border: '0',
                borderRadius: '8px',
              },
              showLeaveButton: true,
              showFullscreenButton: true,
            });
            
            // Success! Break out of retry loop
            break;
          } catch (e: any) {
            const isDuplicate = e.message?.includes('Duplicate') || e.toString().includes('Duplicate');
            if (isDuplicate && retryCount < maxRetries - 1) {
              console.warn(`[DailyVideoPlayer] Duplicate error on attempt ${retryCount + 1}, retrying...`);
              retryCount++;
              await new Promise(r => setTimeout(r, 500));
            } else {
              throw e;
            }
          }
        }

        if (!callFrame) throw new Error('Failed to create Daily call frame');
        callRef.current = callFrame;

        callFrame.on('joined-meeting', () => {
          setStatus('joined');
          onJoined?.();
        });

        callFrame.on('left-meeting', () => {
          onLeft?.();
        });

        callFrame.on('error', (e) => {
          console.error('[DailyVideoPlayer] Daily event error:', e);
          setStatus('error');
          onError?.(e.errorMsg || 'An unknown error occurred');
        });

        // Use 'joined' status to remove our loader once we are ready to show the iframe
        // Daily pre-join UI needs to be visible for the user to click 'Join'
        setStatus('joined'); 
        
        await callFrame.join({ url, token });
        onJoined?.();
      } catch (err: any) {
        console.error('[DailyVideoPlayer] Initialization failed:', err);
        setStatus('error');
        onError?.(err.message || 'Failed to initialize video call');
      }
    };

    initCall();

    return () => {
      if (callRef.current) {
        dailyDestroyPromise = callRef.current.destroy()
          .then(() => {
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
});

DailyVideoPlayer.displayName = 'DailyVideoPlayer';
