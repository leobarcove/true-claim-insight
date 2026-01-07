import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient, ApiResponse } from '@/lib/api-client';

export const videoUploadKeys = {
  all: ['video-uploads'] as const,
  upload: (uploadId: string) => [...videoUploadKeys.all, uploadId] as const,
  deception: (uploadId: string) => [...videoUploadKeys.all, uploadId, 'deception'] as const,
};

export interface VideoUpload {
  id: string;
  claimId: string;
  videoUrl: string;
  duration: number;
  processedUntil: number;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  createdAt: string;
  updatedAt: string;
}

export interface VideoUploadMetrics {
  deceptionScore: number;
  breakdown: {
    voiceStress: number;
    visualBehavior: number;
    expressionMeasurement: number;
  };
}

export interface ProcessSegmentResponse {
  processedUntil: number;
  metrics: VideoUploadMetrics;
}

/**
 * Hook to fetch video upload details
 */
export function useVideoUpload(uploadId: string) {
  return useQuery({
    queryKey: videoUploadKeys.upload(uploadId),
    queryFn: async () => {
      const { data } = await apiClient.get<ApiResponse<VideoUpload>>(`/video/uploads/${uploadId}`);
      return data.data;
    },
    enabled: !!uploadId,
  });
}

/**
 * Hook to fetch deception score for uploaded video
 */
export function useVideoUploadDeception(uploadId: string, enabled: boolean = true) {
  return useQuery({
    queryKey: videoUploadKeys.deception(uploadId),
    queryFn: async () => {
      const { data } = await apiClient.get<ApiResponse<VideoUploadMetrics>>(
        `/video/uploads/${uploadId}/deception-score`
      );
      return data.data;
    },
    enabled: !!uploadId && enabled,
    refetchInterval: false,
  });
}

/**
 * Hook to upload a video file
 */
export function useUploadVideo() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      claimId,
      videoFile,
      onProgress,
    }: {
      claimId: string;
      videoFile: File;
      onProgress?: (progress: number) => void;
    }) => {
      const formData = new FormData();
      formData.append('video', videoFile);
      formData.append('claimId', claimId);

      const { data } = await apiClient.post<ApiResponse<VideoUpload>>(
        '/video/uploads/upload-assessment',
        formData,
        {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
          onUploadProgress: progressEvent => {
            if (onProgress && progressEvent.total) {
              const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total);
              onProgress(progress);
            }
          },
        }
      );
      return data.data;
    },
    onSuccess: data => {
      queryClient.invalidateQueries({ queryKey: videoUploadKeys.upload(data.id) });
    },
  });
}

/**
 * Hook to process a video segment
 */
export function useProcessVideoSegment(uploadId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ startTime, endTime }: { startTime: number; endTime: number }) => {
      const { data } = await apiClient.post<ApiResponse<ProcessSegmentResponse>>(
        `/video/uploads/${uploadId}/process-segment`,
        { startTime, endTime }
      );
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: videoUploadKeys.upload(uploadId) });
      queryClient.invalidateQueries({ queryKey: videoUploadKeys.deception(uploadId) });
    },
  });
}

/**
 * Hook to generate consent form after video processing
 */
export function useGenerateVideoConsent(uploadId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const { data } = await apiClient.post<ApiResponse<{ documentId: string; success: boolean }>>(
        `/video/uploads/${uploadId}/generate-consent`
      );
      return data.data;
    },
    onSuccess: (data, variables, context) => {
      // Invalidate the video upload to update status
      queryClient.invalidateQueries({ queryKey: videoUploadKeys.upload(uploadId) });

      // Invalidate claims to show new document
      queryClient.invalidateQueries({ queryKey: ['claims'] });
    },
  });
}

/**
 * Hook to delete a video upload
 */
export function useDeleteVideoUpload() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (uploadId: string) => {
      const { data } = await apiClient.delete<ApiResponse<{ success: boolean }>>(
        `/video/uploads/${uploadId}`
      );
      return data.data;
    },
    onSuccess: (data, uploadId) => {
      queryClient.invalidateQueries({ queryKey: videoUploadKeys.upload(uploadId) });
      queryClient.invalidateQueries({ queryKey: videoUploadKeys.all });
    },
  });
}

/**
 * Hook to get all video uploads for a claim
 */
export function useClaimVideoUploads(claimId: string) {
  return useQuery({
    queryKey: [...videoUploadKeys.all, 'claim', claimId],
    queryFn: async () => {
      const { data } = await apiClient.get<ApiResponse<VideoUpload[]>>(
        `/video/uploads/claim/${claimId}`
      );
      return data.data;
    },
    enabled: !!claimId,
  });
}
