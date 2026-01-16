import { useState, forwardRef, useImperativeHandle, useEffect, useRef, useMemo } from 'react';
import { useCallFrame } from '@daily-co/daily-react';
import { Loader2, VideoOff } from 'lucide-react';

export interface DailyVideoPlayerProps {
  url: string;
  token?: string;
  onJoined?: () => void;
  onLeft?: () => void;
  onError?: (error: string) => void;
  onAppMessage?: (ev: any) => void;
  onCallFrameCreated?: (callFrame: any) => void;
}

export interface DailyVideoPlayerRef {
  requestFullscreen: () => void;
  exitFullscreen: () => void;
  sendAppMessage: (data: any, to?: string) => void;
  getCallInstance: () => any;
  captureVideoBuffer: (durationMs?: number, participantId?: string) => Promise<Blob>;
}

export const DailyVideoPlayer = forwardRef<DailyVideoPlayerRef, DailyVideoPlayerProps>(
  ({ url, token, onJoined, onLeft, onError, onAppMessage, onCallFrameCreated }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null!);
    const [status, setStatus] = useState<'loading' | 'ready' | 'joined' | 'error'>('loading');
    const [isDark, setIsDark] = useState(() => document.documentElement.classList.contains('dark'));

    // Observe theme changes
    useEffect(() => {
      const observer = new MutationObserver(() => {
        setIsDark(document.documentElement.classList.contains('dark'));
      });
      observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['class'],
      });
      return () => observer.disconnect();
    }, []);

    // Daily theme configuration
    const dailyTheme = useMemo(
      () => ({
        colors: isDark
          ? {
              accent: '#0D8A63',
              accentText: '#FFFFFF',
              background: '#09090b',
              backgroundAccent: '#18181b',
              baseText: '#fafafa',
              border: '#27272a',
              mainAreaBg: '#09090b',
              mainAreaBgAccent: '#18181b',
              mainAreaText: '#fafafa',
              supportiveText: '#a1a1aa',
            }
          : {
              accent: '#0B6E4F',
              accentText: '#FFFFFF',
              background: '#ffffff',
              backgroundAccent: '#f4f4f5',
              baseText: '#09090b',
              border: '#e4e4e7',
              mainAreaBg: '#ffffff',
              mainAreaBgAccent: '#f4f4f5',
              mainAreaText: '#09090b',
              supportiveText: '#71717a',
            },
      }),
      [isDark]
    );

    // Memoize options to ensure stability
    const callOptions = useMemo(
      () => ({
        parentElRef: containerRef,
        options: {
          url,
          token,
          iframeStyle: {
            width: '100%',
            height: '100%',
            border: '0',
            borderRadius: '12px',
          },
          showLeaveButton: true,
          showFullscreenButton: true,
        },
      }),
      [url, token]
    );

    const callFrame = useCallFrame(callOptions);

    // Update theme dynamically
    useEffect(() => {
      if (callFrame) {
        callFrame.setTheme(dailyTheme);
      }
    }, [callFrame, dailyTheme]);

    // Pass the call instance back to the parent for DailyProvider
    useEffect(() => {
      if (callFrame && onCallFrameCreated) {
        onCallFrameCreated(callFrame);
      }
    }, [callFrame, onCallFrameCreated]);

    const tracksRef = useRef<Record<string, MediaStreamTrack>>({});

    // Handle events via the callFrame instance
    useEffect(() => {
      if (!callFrame) return;

      const handleAppMessage = (e: any) => {
        onAppMessage?.(e);
      };

      const syncTracks = () => {
        const participants = callFrame.participants();
        Object.entries(participants).forEach(([id, p]) => {
          const track =
            (p as any).videoTrack ||
            (p as any).tracks?.video?.track ||
            (p as any).tracks?.video?.persistentTrack;
          if (track) {
            tracksRef.current[id] = track;
          }
        });
      };

      const handleTrackStarted = (e: any) => {
        if (e.participant && e.track.kind === 'video') {
          const id = e.participant.local ? 'local' : e.participant.session_id;
          tracksRef.current[id] = e.track;
        }
      };

      const handleTrackStopped = (e: any) => {
        if (e.participant && e.track.kind === 'video') {
          const id = e.participant.local ? 'local' : e.participant.session_id;
          delete tracksRef.current[id];
        }
      };

      const updateStatus = () => {
        const state = callFrame.meetingState();
        if (state === 'joined-meeting') {
          setStatus('joined');
          syncTracks();
          onJoined?.();
        } else if (state === 'loaded' || state === 'joining-meeting') {
          setStatus('ready');
          syncTracks();
        } else if (state === 'error') {
          setStatus('error');
        }

        // Auto-join if in a joinable state
        if (url && (state === 'new' || state === 'loaded')) {
          callFrame
            .join({
              url,
              token,
              // Initial theme is handled by the setTheme effect once joined
            })
            .catch(e => {
              console.error('[DailyVideoPlayer] join() failed:', e);
              setStatus('error');
            });
        }
      };

      const handleLeft = () => {
        tracksRef.current = {};
        onLeft?.();
      };

      const handleError = (e: any) => {
        setStatus('error');
        onError?.(e.errorMsg || 'An unknown error occurred');
      };

      callFrame.on('loading', updateStatus);
      callFrame.on('loaded', updateStatus);
      callFrame.on('joining-meeting', updateStatus);
      callFrame.on('joined-meeting', updateStatus);
      callFrame.on('left-meeting', handleLeft);
      callFrame.on('error', handleError);
      callFrame.on('app-message', handleAppMessage);
      callFrame.on('track-started', handleTrackStarted);
      callFrame.on('track-stopped', handleTrackStopped);

      // Initial check
      syncTracks();
      updateStatus();

      // Timeout detection - if stuck in loading for too long
      const loadingTimeout = setTimeout(() => {
        const currentState = callFrame.meetingState();
        if (currentState === 'loading' || currentState === 'new') {
          console.error('[DailyVideoPlayer] Stuck in loading state, forcing error');
          setStatus('error');
          onError?.('Connection timeout - please try again');
        }
      }, 15000); // 15 second timeout

      return () => {
        clearTimeout(loadingTimeout);
        callFrame.off('loading', updateStatus);
        callFrame.off('loaded', updateStatus);
        callFrame.off('joining-meeting', updateStatus);
        callFrame.off('joined-meeting', updateStatus);
        callFrame.off('left-meeting', handleLeft);
        callFrame.off('error', handleError);
        callFrame.off('app-message', handleAppMessage);
        callFrame.off('track-started', handleTrackStarted);
        callFrame.off('track-stopped', handleTrackStopped);
      };
    }, [callFrame, url, token, onJoined, onLeft, onError, onAppMessage]);

    useImperativeHandle(ref, () => ({
      requestFullscreen: () => {
        try {
          callFrame?.requestFullscreen();
        } catch (e) {
          console.error('[DailyVideoPlayer] requestFullscreen failed:', e);
        }
      },
      exitFullscreen: () => {
        try {
          callFrame?.exitFullscreen();
        } catch (e) {
          console.error('[DailyVideoPlayer] exitFullscreen failed:', e);
        }
      },
      sendAppMessage: (data: any, to?: string) => {
        try {
          callFrame?.sendAppMessage(data, to || '*');
        } catch (e) {
          console.error('[DailyVideoPlayer] sendAppMessage failed:', e);
        }
      },
      getCallInstance: () => callFrame,
      captureVideoBuffer: async (
        durationMs: number = 5000,
        participantId?: string
      ): Promise<Blob> => {
        if (!callFrame) throw new Error('Call frame not initialized');

        const participants = callFrame.participants();
        const targetId =
          participantId || Object.keys(participants).find(id => id !== 'local') || 'local';
        const participant = (participants as any)[targetId];

        let videoTrack =
          (targetId === 'local' ? participant?.videoTrack : tracksRef.current[targetId]) ||
          participant?.videoTrack ||
          participant?.tracks?.video?.track;

        if (!videoTrack && targetId === 'local') {
          videoTrack = participant?.tracks?.video?.persistentTrack;
        }

        if (!videoTrack) {
          console.error(
            `[DailyVideoPlayer] Failed to find video track for participant: ${targetId}`,
            {
              participant,
              tracks: Object.keys(tracksRef.current),
            }
          );
          throw new Error('Video track not available for analysis');
        }

        const stream = new MediaStream([videoTrack]);
        const mediaRecorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
        const chunks: Blob[] = [];

        return new Promise((resolve, reject) => {
          mediaRecorder.ondataavailable = e => {
            if (e.data.size > 0) chunks.push(e.data);
          };
          mediaRecorder.onstop = () => {
            const blob = new Blob(chunks, { type: 'video/webm' });
            resolve(blob);
          };
          mediaRecorder.onerror = e => reject(e);

          mediaRecorder.start();
          setTimeout(() => {
            if (mediaRecorder.state === 'recording') {
              mediaRecorder.stop();
            }
          }, durationMs);
        });
      },
    }));

    return (
      <div className="relative w-full h-full bg-background rounded-xl overflow-hidden border border-border">
        {status === 'loading' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground bg-background/80 z-10 transition-colors">
            <Loader2 className="h-8 w-8 animate-spin mb-3 text-primary" />
            <p className="text-sm font-semibold tracking-tight">
              Connecting to secure video session...
            </p>
          </div>
        )}

        {status === 'error' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-destructive bg-background z-10 p-8 text-center transition-colors">
            <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
              <VideoOff className="h-8 w-8" />
            </div>
            <h3 className="text-xl font-bold mb-2">Video Connection Failed</h3>
            <p className="text-sm text-muted-foreground max-w-xs leading-relaxed">
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
