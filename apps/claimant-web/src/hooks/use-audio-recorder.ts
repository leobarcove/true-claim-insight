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
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
          
          // Prune old chunks to keep buffer continuously fresh (~10s)
          // Rough estimate: we can't easily measure time of blobs without storing metadata
          // But since we request data every 1s, limiting array length works
          const maxChunks = Math.ceil(bufferDurationMs / 1000); 
          if (chunksRef.current.length > maxChunks * 2) {
             // Keep last N chunks. bufferDurationMs / 1000 (timeslice)
             chunksRef.current = chunksRef.current.slice(-maxChunks);
          }
        }
      };

      // Request data every 1 second
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
    return new Blob(chunksRef.current, { type: 'audio/webm' });
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
