import { useState, useRef, useEffect, useCallback } from 'react';

interface AudioRecorderOptions {
  bufferDurationMs?: number; // Duration to keep in buffer (e.g. 10000ms)
}

export function useAudioRecorder({ bufferDurationMs = 10000 }: AudioRecorderOptions = {}) {
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  /**
   * Start recording audio from microphone
   */
  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      // Collect data in small chunks (e.g. 1s) to manage buffer size
      mediaRecorder.ondataavailable = event => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);

          // We DO NOT prune old chunks anymore.
          // Slicing WebM chunks validation creates invalid files (timestamp gaps).
          // Memory usage is low enough to keep full session.
          // If lengthy sessions become common, we should implement proper server-side streaming or client-side re-muxing.
        }
      };

      // Request data every 1 second (sufficient for full session recording)
      mediaRecorder.start(1000);
      setIsRecording(true);
      console.log('Audio recording started');
    } catch (error) {
      console.error('Error starting audio recording:', error);
    }
  }, [bufferDurationMs]);

  /**
   * Stop recording and cleanup
   */
  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      setIsRecording(false);
      console.log('Audio recording stopped');
    }
  }, [isRecording]);

  /**
   * Get the current audio blob from the buffer
   */
  const getAudioBlob = useCallback(async (): Promise<Blob | null> => {
    if (chunksRef.current.length === 0) return null;

    const header = chunksRef.current[0];
    const recentChunks = chunksRef.current.slice(-20);
    
    // If the recording is shorter than 20s, just return everything once
    if (chunksRef.current.length <= 20) {
      return new Blob(chunksRef.current, { type: 'audio/webm' });
    }

    // Combine header with last 20s
    return new Blob([header, ...recentChunks], { type: 'audio/webm' });
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopRecording();
    };
  }, [stopRecording]);

  return {
    isRecording,
    startRecording,
    stopRecording,
    getAudioBlob,
  };
}
