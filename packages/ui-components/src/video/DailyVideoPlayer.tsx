import { useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react';
import DailyIframe, { DailyCall } from '@daily-co/daily-js';
import { Loader2, VideoOff } from 'lucide-react';

export interface DailyVideoPlayerProps {
  url: string;
  token?: string;
  onJoined?: () => void;
  onLeft?: () => void;
  onError?: (error: string) => void;
  onAppMessage?: (ev: any) => void;
}

export interface DailyVideoPlayerRef {
  requestFullscreen: () => void;
  exitFullscreen: () => void;
  sendAppMessage: (data: any, to?: string) => void;
}

// Track global destruction promise to handle React Strict Mode async cleanup race conditions
let dailyDestroyPromise: Promise<void> | null = null;

export const DailyVideoPlayer = forwardRef<DailyVideoPlayerRef, DailyVideoPlayerProps>(
  ({ url, token, onJoined, onLeft, onError, onAppMessage }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const callRef = useRef<DailyCall | null>(null);
    const hasJoinedMeeting = useRef(false); // Track if user has actually joined the meeting
    const [status, setStatus] = useState<'loading' | 'joined' | 'error'>('loading');

    // Use refs for callbacks to avoid re-initializing the call when parents re-render
    const onJoinedRef = useRef(onJoined);
    const onLeftRef = useRef(onLeft);
    const onErrorRef = useRef(onError);
    const onAppMessageRef = useRef(onAppMessage);

    // Keep refs up to date
    useEffect(() => {
      onJoinedRef.current = onJoined;
      onLeftRef.current = onLeft;
      onErrorRef.current = onError;
      onAppMessageRef.current = onAppMessage;
    }, [onJoined, onLeft, onError, onAppMessage]);

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
      sendAppMessage: (data: any, to?: string) => {
        const callInstance = callRef.current || DailyIframe.getCallInstance();

        if (callInstance) {
          try {
            console.log(
              '[DailyVideoPlayer] Sending app message via instance:',
              callInstance === callRef.current ? 'ref' : 'global lookup'
            );
            callInstance.sendAppMessage(data, to || '*');
          } catch (e) {
            console.error('[DailyVideoPlayer] Failed to send app message:', e);
          }
        } else {
          console.warn(
            '[DailyVideoPlayer] Cannot send message, call not ready (ref is null, global is null)'
          );
          console.warn('[DailyVideoPlayer] Current status:', status);
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
              const isDuplicate =
                e.message?.includes('Duplicate') || e.toString().includes('Duplicate');
              if (isDuplicate && retryCount < maxRetries - 1) {
                console.warn(
                  `[DailyVideoPlayer] Duplicate error on attempt ${retryCount + 1}, retrying...`
                );
                retryCount++;
                await new Promise(r => setTimeout(r, 500));
              } else {
                throw e;
              }
            }
          }

          if (!callFrame) throw new Error('Failed to create Daily call frame');
          console.log('[DailyVideoPlayer] callFrame created successfully');
          callRef.current = callFrame;

          callFrame.on('joined-meeting', () => {
            console.log('[DailyVideoPlayer] joined-meeting event');
            hasJoinedMeeting.current = true;
            setStatus('joined');
            onJoinedRef.current?.();
          });

          // Wire up app-message event
          callFrame.on('app-message', ev => {
            if (onAppMessageRef.current) {
              onAppMessageRef.current(ev);
            }
          });

          callFrame.on('left-meeting', () => {
            console.log(
              '[DailyVideoPlayer] left-meeting event, hasJoined:',
              hasJoinedMeeting.current
            );
            if (hasJoinedMeeting.current) {
              onLeftRef.current?.();
            }
          });

          callFrame.on('error', e => {
            console.error('[DailyVideoPlayer] Daily event error:', e);
            setStatus('error');
            onErrorRef.current?.(e.errorMsg || 'An unknown error occurred');
          });

          // Use 'joined' status to remove our loader once we are ready to show the iframe
          setStatus('joined');

          await callFrame.join({ url, token });
          console.log('[DailyVideoPlayer] callFrame.join() completed');
          hasJoinedMeeting.current = true;
          onJoinedRef.current?.();
        } catch (err: any) {
          console.error('[DailyVideoPlayer] Initialization failed:', err);
          setStatus('error');
          onErrorRef.current?.(err.message || 'Failed to initialize video call');
        }
      };

      initCall();

      return () => {
        if (callRef.current) {
          dailyDestroyPromise = callRef.current
            .destroy()
            .then(() => {})
            .catch(err => {
              console.error('[DailyVideoPlayer] Error destroying instance:', err);
            });
          callRef.current = null;
        }
      };
    }, [url, token]); // Only re-run if URL or token changes

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
              We couldn't establish a connection to the video room. Please check your internet and
              try again.
            </p>
          </div>
        )}

        <div ref={containerRef} className="w-full h-full" />
      </div>
    );
  }
);

DailyVideoPlayer.displayName = 'DailyVideoPlayer';
