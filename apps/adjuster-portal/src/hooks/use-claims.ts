import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient, ApiResponse } from '@/lib/api-client';
import type { Claim, ClaimStatus, ClaimType } from '@tci/shared-types';

// Query keys factory
export const claimKeys = {
  all: ['claims'] as const,
  lists: () => [...claimKeys.all, 'list'] as const,
  list: (filters: ClaimFilters) => [...claimKeys.lists(), filters] as const,
  details: () => [...claimKeys.all, 'detail'] as const,
  detail: (id: string) => [...claimKeys.details(), id] as const,
  queue: () => [...claimKeys.all, 'queue'] as const,
  stats: () => [...claimKeys.all, 'stats'] as const,
};

// Types
export interface ClaimFilters {
  status?: ClaimStatus;
  type?: ClaimType;
  search?: string;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  adjusterId?: string;
  scope?: 'tenant' | 'personal';
  createdById?: string;
  scheduledFrom?: string;
  hasAnalysis?: boolean;
}

export interface ClaimListResponse {
  claims: Claim[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface ClaimStats {
  totalAssigned: number;
  pendingReview: number;
  inProgress: number;
  completedThisMonth: number;
  completedThisWeek: number;
  averagePerDay: number;
  totalClaims: number;
  activeClaims: number;
  monthlyChange: number;
  statusBreakdown: Record<string, number>;
}

export interface CreateClaimInput {
  claimantId: string;
  type: ClaimType;
  incidentDate: string;
  incidentLocation: {
    address: string;
    latitude?: number;
    longitude?: number;
  };
  description: string;
  vehicleMake?: string;
  vehicleModel?: string;
  vehicleYear?: number;
  vehiclePlateNumber?: string;
}

export interface UpdateClaimInput {
  status?: ClaimStatus;
  description?: string;
  incidentDate?: string;
  incidentLocation?: {
    address: string;
    latitude?: number;
    longitude?: number;
  };
}

// Fetch claims list
export function useClaims(filters: ClaimFilters = {}) {
  return useQuery({
    queryKey: claimKeys.list(filters),
    queryFn: async () => {
      const params = new URLSearchParams();

      if (filters.status) params.append('status', filters.status);
      if (filters.type) params.append('type', filters.type);
      if (filters.search) params.append('search', filters.search);
      if (filters.page) params.append('page', filters.page.toString());
      if (filters.limit) params.append('limit', filters.limit.toString());
      if (filters.sortBy) params.append('sortBy', filters.sortBy);
      if (filters.sortOrder) params.append('sortOrder', filters.sortOrder);
      if (filters.adjusterId) params.append('adjusterId', filters.adjusterId);
      if (filters.scope) params.append('scope', filters.scope);
      if (filters.createdById) params.append('createdById', filters.createdById);
      if (filters.scheduledFrom) params.append('scheduledFrom', filters.scheduledFrom);
      if (filters.hasAnalysis) params.append('hasAnalysis', 'true');

      const { data } = await apiClient.get<ApiResponse<ClaimListResponse>>(
        `/claims?${params.toString()}`
      );
      return data.data;
    },
    staleTime: 30 * 1000, // 30 seconds
  });
}

// Fetch single claim
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

// Fetch claim queue (adjuster's assigned claims)
export function useClaimQueue() {
  return useQuery({
    queryKey: claimKeys.queue(),
    queryFn: async () => {
      const { data } = await apiClient.get<ApiResponse<ClaimListResponse>>('/claims/queue');
      return data.data;
    },
  });
}

// Fetch claim statistics
export function useClaimStats(filters: { createdById?: string } = {}) {
  return useQuery({
    queryKey: [...claimKeys.stats(), filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters.createdById) params.append('createdById', filters.createdById);

      const url = `/claims/stats${params.toString() ? `?${params.toString()}` : ''}`;
      const { data } = await apiClient.get<ApiResponse<ClaimStats>>(url);
      return data.data;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

// Create claim mutation
export function useCreateClaim() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateClaimInput) => {
      const { data } = await apiClient.post<ApiResponse<Claim>>('/claims', input);
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: claimKeys.lists() });
      queryClient.invalidateQueries({ queryKey: claimKeys.stats() });
    },
  });
}

// Update claim mutation
export function useUpdateClaim(claimId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: UpdateClaimInput) => {
      const { data } = await apiClient.patch<ApiResponse<Claim>>(`/claims/${claimId}`, input);
      return data.data;
    },
    onSuccess: updatedClaim => {
      queryClient.setQueryData(claimKeys.detail(claimId), updatedClaim);
      queryClient.invalidateQueries({ queryKey: claimKeys.lists() });
    },
  });
}

// Update claim status mutation
export function useUpdateClaimStatus(claimId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (status: ClaimStatus) => {
      const { data } = await apiClient.patch<ApiResponse<Claim>>(`/claims/${claimId}/status`, {
        status,
      });
      return data.data;
    },
    onSuccess: updatedClaim => {
      queryClient.setQueryData(claimKeys.detail(claimId), updatedClaim);
      queryClient.invalidateQueries({ queryKey: claimKeys.lists() });
    },
  });
}

// Assign adjuster mutation
export function useAssignAdjuster() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ claimId, adjusterId }: { claimId: string; adjusterId: string }) => {
      const { data } = await apiClient.post<ApiResponse<Claim>>(`/claims/${claimId}/assign`, {
        adjusterId,
      });
      return data.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: claimKeys.detail(variables.claimId),
      });
      queryClient.invalidateQueries({ queryKey: claimKeys.lists() });
      queryClient.invalidateQueries({ queryKey: claimKeys.queue() });
    },
  });
}

// Schedule session mutation
export function useScheduleSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ claimId, scheduledAt }: { claimId: string; scheduledAt: string }) => {
      const { data } = await apiClient.post<ApiResponse<any>>('/video/rooms', {
        claimId,
        scheduledTime: scheduledAt,
      });
      return data.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: claimKeys.detail(variables.claimId),
      });
      queryClient.invalidateQueries({ queryKey: claimKeys.lists() });
    },
  });
}

// Replace document mutation
export function useReplaceDocument(claimId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ documentId, file }: { documentId: string; file: File }) => {
      const formData = new FormData();
      formData.append('file', file);

      const { data } = await apiClient.post<ApiResponse<any>>(
        `/claims/${claimId}/documents/${documentId}/replace`,
        formData,
        {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        }
      );
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: claimKeys.detail(claimId) });
      queryClient.invalidateQueries({ queryKey: ['trinity'] });
    },
  });
}
