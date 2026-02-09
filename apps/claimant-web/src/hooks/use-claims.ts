import { useQuery } from '@tanstack/react-query';
import { apiClient, ApiResponse } from '@/lib/api-client';
import type { Claim } from '@tci/shared-types';

export const claimKeys = {
  all: ['claims'] as const,
  lists: () => [...claimKeys.all, 'list'] as const,
  details: () => [...claimKeys.all, 'detail'] as const,
  detail: (id: string) => [...claimKeys.details(), id] as const,
};

export interface ClaimListResponse {
  claims: Claim[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export function useClaims(claimantId?: string) {
  return useQuery({
    queryKey: claimantId ? [...claimKeys.lists(), claimantId] : claimKeys.lists(),
    queryFn: async () => {
      const params = new URLSearchParams();
      if (claimantId) params.append('claimantId', claimantId);

      const { data } = await apiClient.get<ApiResponse<ClaimListResponse>>(
        `/claims?${params.toString()}`
      );
      return data.data;
    },
    staleTime: 30 * 1000,
  });
}

export function useClaim(claimId: string) {
  return useQuery({
    queryKey: claimKeys.detail(claimId),
    queryFn: async () => {
      const { data } = await apiClient.get<ApiResponse<Claim>>(`/claims/${claimId}`);
      return data.data;
    },
    enabled: !!claimId,
  });
}

export function useClaimSessions(claimId: string) {
  return useQuery({
    queryKey: ['claims', claimId, 'sessions'],
    queryFn: async () => {
      const { data } = await apiClient.get<ApiResponse<any[]>>(`/video/claims/${claimId}/sessions`);
      return data.data;
    },
    enabled: !!claimId,
  });
}
