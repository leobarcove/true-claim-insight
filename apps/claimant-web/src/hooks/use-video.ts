import { useMutation } from '@tanstack/react-query';
import { apiClient, ApiResponse } from '@/lib/api-client';

export const videoKeys = {
  all: ['video'] as const,
  room: (id: string) => [...videoKeys.all, 'room', id] as const,
};

export interface JoinRoomResponse {
  roomUrl: string;
  token: string;
  sessionId: string;
}

export function useJoinVideoRoom() {
  return useMutation({
    mutationFn: async ({ sessionId, userId }: { sessionId: string; userId: string }) => {
      // Claimant's role is always CLAIMANT
      const { data } = await apiClient.post<ApiResponse<JoinRoomResponse>>(
        `/video/rooms/${sessionId}/join`,
        { userId, role: 'CLAIMANT' }
      );
      return data.data;
    },
  });
}

export function useAnalyzeExpression() {
  return useMutation({
    mutationFn: async ({ sessionId, videoBlob }: { sessionId: string; videoBlob: Blob }) => {
      const formData = new FormData();
      formData.append('file', videoBlob, 'expression-analysis.webm');
      formData.append('sessionId', sessionId);

      const { data } = await apiClient.post<ApiResponse<any>>(
        '/risk/analyze-expression',
        formData,
        {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        }
      );
      return data.data;
    },
  });
}

export function useAnalyzeVisualBehavior() {
  return useMutation({
    mutationFn: async ({ sessionId, videoBlob }: { sessionId: string; videoBlob: Blob }) => {
      const formData = new FormData();
      formData.append('file', videoBlob, 'visual-behavior.webm');
      formData.append('sessionId', sessionId);

      const { data } = await apiClient.post<ApiResponse<any>>('/risk/analyze-video', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      return data.data;
    },
  });
}
