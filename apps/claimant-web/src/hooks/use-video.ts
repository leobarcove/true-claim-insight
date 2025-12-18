import { useQuery, useMutation } from '@tanstack/react-query';
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
    mutationFn: async ({
      sessionId,
      userId,
    }: {
      sessionId: string;
      userId: string;
    }) => {
      // Claimant's role is always CLAIMANT
      const { data } = await apiClient.post<ApiResponse<JoinRoomResponse>>(
        `/video/rooms/${sessionId}/join`,
        { userId, role: 'CLAIMANT' }
      );
      return data.data;
    },
  });
}
