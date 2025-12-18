import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient, ApiResponse } from '@/lib/api-client';

export const videoKeys = {
  all: ['video'] as const,
  rooms: () => [...videoKeys.all, 'rooms'] as const,
  room: (id: string) => [...videoKeys.rooms(), id] as const,
  claimSessions: (claimId: string) => [...videoKeys.all, 'claim', claimId] as const,
  status: () => [...videoKeys.all, 'status'] as const,
};

export interface VideoSession {
  sessionId: string;
  roomUrl: string;
  claimId: string;
  status: 'SCHEDULED' | 'WAITING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  scheduledTime?: string;
  startedAt?: string;
  endedAt?: string;
  recordingUrl?: string;
}

export interface JoinRoomResponse {
  roomUrl: string;
  token: string;
  sessionId: string;
}

export function useVideoSession(sessionId: string) {
  return useQuery({
    queryKey: videoKeys.room(sessionId),
    queryFn: async () => {
      const { data } = await apiClient.get<ApiResponse<VideoSession>>(
        `/video/rooms/${sessionId}`
      );
      return data.data;
    },
    enabled: !!sessionId,
  });
}

export function useClaimSessions(claimId: string) {
  return useQuery({
    queryKey: videoKeys.claimSessions(claimId),
    queryFn: async () => {
      const { data } = await apiClient.get<ApiResponse<VideoSession[]>>(
        `/video/claims/${claimId}/sessions`
      );
      return data.data;
    },
    enabled: !!claimId,
  });
}

export function useCreateVideoRoom() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (claimId: string) => {
      const { data } = await apiClient.post<ApiResponse<VideoSession>>(
        '/video/rooms',
        { claimId }
      );
      return data.data;
    },
    onSuccess: (newSession) => {
      queryClient.invalidateQueries({
        queryKey: videoKeys.claimSessions(newSession.claimId),
      });
    },
  });
}

export function useJoinVideoRoom() {
  return useMutation({
    mutationFn: async ({
      sessionId,
      userId,
      role,
    }: {
      sessionId: string;
      userId: string;
      role: 'ADJUSTER' | 'CLAIMANT';
    }) => {
      const { data } = await apiClient.post<ApiResponse<JoinRoomResponse>>(
        `/video/rooms/${sessionId}/join`,
        { userId, role }
      );
      return data.data;
    },
  });
}

export function useEndVideoSession(sessionId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (reason?: string) => {
      const { data } = await apiClient.post<ApiResponse<Partial<VideoSession>>>(
        `/video/rooms/${sessionId}/end`,
        { reason }
      );
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: videoKeys.room(sessionId) });
    },
  });
}
