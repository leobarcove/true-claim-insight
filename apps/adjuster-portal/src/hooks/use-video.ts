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
      const { data } = await apiClient.get<ApiResponse<VideoSession>>(`/video/rooms/${sessionId}`);
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
      const { data } = await apiClient.post<ApiResponse<VideoSession>>('/video/rooms', { claimId });
      return data.data;
    },
    onSuccess: newSession => {
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
      try {
        const response = await apiClient.post<ApiResponse<JoinRoomResponse>>(
          `/video/rooms/${sessionId}/join`,
          { userId, role }
        );
        const result = response.data.data;
        return result;
      } catch (error) {
        console.error('[useJoinVideoRoom] API error:', error);
        throw error;
      }
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

// --- Risk Assessments ---

export interface RiskAssessment {
  id: string;
  sessionId: string;
  assessmentType: 'VOICE_ANALYSIS' | 'VISUAL_MODERATION' | 'ATTENTION_TRACKING' | 'DEEPFAKE_CHECK';
  provider: string;
  riskScore: 'LOW' | 'MEDIUM' | 'HIGH' | null;
  confidence: number;
  rawResponse: any;
  createdAt: string;
}

export const riskKeys = {
  all: ['risk'] as const,
  session: (sessionId: string) => [...riskKeys.all, 'session', sessionId] as const,
};

export function useRiskAssessments(sessionId: string) {
  return useQuery({
    queryKey: riskKeys.session(sessionId),
    queryFn: async () => {
      const { data } = await apiClient.get<ApiResponse<RiskAssessment[]>>(
        `/risk/session/${sessionId}`
      );
      return data.data;
    },
    enabled: !!sessionId,
    refetchInterval: 5000, // Poll for live results
  });
}

export function useTriggerAssessment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      sessionId,
      assessmentType,
    }: {
      sessionId: string;
      assessmentType: string;
    }) => {
      const { data } = await apiClient.post<ApiResponse<RiskAssessment>>('/risk/trigger', {
        sessionId,
        assessmentType,
      });
      return data.data;
    },
    onSuccess: (data, variables) => {
      // Use variables.sessionId if data.sessionId is not available
      queryClient.invalidateQueries({
        queryKey: riskKeys.session(data?.sessionId || variables.sessionId),
      });
    },
    onError: (error: any) => {
      console.error('[useTriggerAssessment] Error:', error?.message || error);
      // Error is logged but not thrown to prevent page navigation
    },
  });
}

export function useAnalyzeExpression() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ sessionId, videoBlob }: { sessionId: string; videoBlob: Blob }) => {
      const formData = new FormData();
      formData.append('file', videoBlob, 'expression-analysis.webm');
      formData.append('sessionId', sessionId);

      const { data } = await apiClient.post<ApiResponse<RiskAssessment>>(
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
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: riskKeys.session(variables.sessionId),
      });
    },
    onError: (error: any) => {
      console.error('[useAnalyzeExpression] Error:', error?.message || error);
    },
  });
}
