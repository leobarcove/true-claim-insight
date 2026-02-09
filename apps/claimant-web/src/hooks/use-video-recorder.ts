import { useState, useRef, useEffect, useCallback } from 'react';
import { useDevices } from '@daily-co/daily-react';

interface VideoRecorderOptions {
  bufferDurationMs?: number; // Target duration for segments
}

/**
 * useVideoRecorder - Captures video in clean segments to avoid corruption and duration metadata issues
 */
export function useVideoRecorder({ bufferDurationMs = 5000 }: VideoRecorderOptions = {}) {
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const currentChunksRef = useRef<Blob[]>([]);
  const lastCompleteBlobRef = useRef<Blob | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const cycleTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const devices = useDevices();

  const stopRecording = useCallback(() => {
    if (cycleTimeoutRef.current) {
      clearTimeout(cycleTimeoutRef.current);
      cycleTimeoutRef.current = null;
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }

    setIsRecording(false);
    console.log('[useVideoRecorder] Recording stopped and cleaned up');
  }, []);

  const startRecording = useCallback(async () => {
    try {
      // Cleanup any existing recording first
      stopRecording();

      let deviceId = devices.currentCam?.device?.deviceId;
      if (!deviceId) {
        const allDevices = await navigator.mediaDevices.enumerateDevices();
        const cameras = allDevices.filter(d => d.kind === 'videoinput');
        if (cameras.length > 0) {
          const frontCam = cameras.find(
            c => c.label.toLowerCase().includes('front') || c.label.toLowerCase().includes('user')
          );
          deviceId = frontCam ? frontCam.deviceId : cameras[0].deviceId;
        }
      }

      const constraints: MediaStreamConstraints = {
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          ...(deviceId ? { deviceId: { ideal: deviceId } } : { facingMode: 'user' }),
        },
        audio: true,
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      const options = { mimeType: 'video/webm;codecs=vp8,opus' };
      if (!MediaRecorder.isTypeSupported(options.mimeType)) {
        options.mimeType = 'video/webm';
      }

      const runCycle = () => {
        if (!streamRef.current) return;

        const recorder = new MediaRecorder(streamRef.current, options);
        const cycleChunks: Blob[] = [];

        recorder.ondataavailable = e => {
          if (e.data.size > 0) {
            cycleChunks.push(e.data);
            currentChunksRef.current = [...cycleChunks];
          }
        };

        recorder.onstop = () => {
          // Only save to lastCompleteBlob if it's a significant recording (> 1s)
          if (cycleChunks.length > 0) {
            const finalBlob = new Blob(cycleChunks, { type: 'video/webm' });
            if (finalBlob.size > 1000) {
              // arbitrary small size check
              lastCompleteBlobRef.current = finalBlob;
            }
          }
        };

        mediaRecorderRef.current = recorder;
        recorder.start(1000); // 1s chunks

        cycleTimeoutRef.current = setTimeout(() => {
          if (recorder.state === 'recording') {
            recorder.stop();
            runCycle(); // Start next segment
          }
        }, bufferDurationMs);
      };

      runCycle();
      setIsRecording(true);
      console.log('[useVideoRecorder] Segmented recording started');
    } catch (error) {
      console.error('[useVideoRecorder] Error starting video recording:', error);
    }
  }, [devices.currentCam, bufferDurationMs, stopRecording]);

  const getVideoBlob = useCallback(async (): Promise<Blob | null> => {
    // If the current recorder has significant data, use it for the freshest view
    if (currentChunksRef.current.length >= 3) {
      console.log('[useVideoRecorder] Providing current active chunks');
      return new Blob(currentChunksRef.current, { type: 'video/webm' });
    }

    // Otherwise use the last fully completed segment
    if (lastCompleteBlobRef.current) {
      console.log('[useVideoRecorder] Providing last complete segment');
      return lastCompleteBlobRef.current;
    }

    return null;
  }, []);

  useEffect(() => {
    return () => {
      stopRecording();
    };
  }, [stopRecording]);

  return {
    isRecording,
    startRecording,
    stopRecording,
    getVideoBlob,
    stream: streamRef.current,
    takeSnapshot: async (): Promise<Blob | null> => {
      if (!streamRef.current) return null;
      const videoTrack = streamRef.current.getVideoTracks()[0];
      if (!videoTrack) return null;

      const imageCapture = new (window as any).ImageCapture(videoTrack);
      try {
        const blob = await imageCapture.takePhoto();
        return blob;
      } catch (e) {
        // Fallback to canvas method if ImageCapture fails or is not supported
        try {
          const video = document.createElement('video');
          video.srcObject = new MediaStream([videoTrack]);
          video.muted = true;
          video.playsInline = true;
          await video.play();

          const canvas = document.createElement('canvas');
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          const ctx = canvas.getContext('2d');
          if (!ctx) return null;

          ctx.drawImage(video, 0, 0);

          return new Promise(resolve => {
            canvas.toBlob(blob => {
              video.srcObject = null;
              video.remove();
              canvas.remove();
              resolve(blob);
            }, 'image/png');
          });
        } catch (e2) {
          console.error('Snapshot failed', e2);
          return null;
        }
      }
    },
  };
}
