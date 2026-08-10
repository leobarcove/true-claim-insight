import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient, ApiResponse } from '@/lib/api-client';
import type {
  CaseChannel,
  CaseStatus,
  ClaimCategory,
  CompletenessSummary,
  DocumentValidationStatus,
  FlowStep,
  TravelClaimType,
} from '@tci/shared-types';

// Query keys factory (mirrors claimKeys in use-claims.ts)
export const caseKeys = {
  all: ['cases'] as const,
  lists: () => [...caseKeys.all, 'list'] as const,
  list: (filters: CaseFilters) => [...caseKeys.lists(), filters] as const,
  details: () => [...caseKeys.all, 'detail'] as const,
  detail: (id: string) => [...caseKeys.details(), id] as const,
  policies: (search: string) => ['policies', 'list', search] as const,
};

export interface CaseFilters {
  status?: CaseStatus | string;
  travelClaimType?: TravelClaimType | string;
  channel?: CaseChannel | string;
  search?: string;
  page?: number;
  limit?: number;
}

export interface CaseDocumentSummary {
  id: string;
  documentType: string;
  fileName: string;
  stepId?: string | null;
  validationStatus: DocumentValidationStatus | string;
  validationNote?: string | null;
  createdAt: string;
}

export interface CaseSummary {
  id: string;
  caseNumber: string;
  status: CaseStatus | string;
  channel: CaseChannel | string;
  /** The line of business. Travel refines it further with `travelClaimType`. */
  category: ClaimCategory | string;
  travelClaimType?: TravelClaimType | string | null;
  claimant?: { id: string; fullName?: string | null; phoneNumber: string } | null;
  policy?: { id: string; policyNumber: string; insuredName?: string } | null;
  policyNumberRaw?: string | null;
  needsPolicyReview: boolean;
  destination?: string | null;
  incidentDate?: string | null;
  notifiedLate: boolean;
  outOfWindow: boolean;
  reviewNote?: string | null;
  submittedAt?: string | null;
  createdAt: string;
  answers: Record<string, string | number | boolean>;
  currentStep?: FlowStep | null;
  completeness?: CompletenessSummary | null;
  bankName?: string | null;
  /** Last 4 digits only. The full number is encrypted at rest and returned
   *  solely by the audited reveal endpoint. */
  bankAccountLast4?: string | null;
  bankAccountHolderName?: string | null;
  documents?: CaseDocumentSummary[];
  evidenceRequirements?: Array<{
    documentType: string;
    isMandatory: boolean;
    description?: string | null;
  }>;
  convertedClaim?: { id: string; claimNumber: string; status?: string } | null;
  sourceMeta?: Record<string, unknown> | null;
}

export interface CaseListResponse {
  cases: CaseSummary[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
  statusBreakdown: Record<string, number>;
}

export interface PolicySummary {
  id: string;
  policyNumber: string;
  insuredName: string;
  insuredPhone?: string | null;
  planTier?: string | null;
  destination?: string | null;
  tripStartDate?: string | null;
  tripEndDate?: string | null;
  tenant?: { id: string; name: string };
}

export function useCases(filters: CaseFilters = {}) {
  return useQuery({
    queryKey: caseKeys.list(filters),
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters.status) params.append('status', String(filters.status));
      if (filters.travelClaimType)
        params.append('travelClaimType', String(filters.travelClaimType));
      if (filters.channel) params.append('channel', String(filters.channel));
      if (filters.search) params.append('search', filters.search);
      if (filters.page) params.append('page', String(filters.page));
      if (filters.limit) params.append('limit', String(filters.limit));
      const { data } = await apiClient.get<ApiResponse<CaseListResponse>>(
        `/cases?${params.toString()}`
      );
      return data.data;
    },
    staleTime: 30 * 1000,
  });
}

export function useCase(caseId: string) {
  return useQuery({
    queryKey: caseKeys.detail(caseId),
    queryFn: async () => {
      const { data } = await apiClient.get<ApiResponse<CaseSummary>>(`/cases/${caseId}`);
      return data.data;
    },
    enabled: !!caseId,
  });
}

export interface CreateCaseInput {
  travelClaimType: TravelClaimType | string;
  channel?: CaseChannel | string;
  claimantPhone?: string;
  claimantFullName?: string;
  claimantNric?: string;
  answers?: Record<string, string | number | boolean>;
  sourceMeta?: Record<string, unknown>;
}

export function useCreateCase() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateCaseInput) => {
      const { data } = await apiClient.post<ApiResponse<CaseSummary>>('/cases', input);
      return data.data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: caseKeys.lists() }),
  });
}

export function useSubmitCase() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (caseId: string) => {
      const { data } = await apiClient.post<ApiResponse<CaseSummary>>(`/cases/${caseId}/submit`);
      return data.data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: caseKeys.all }),
  });
}

function useCaseAction(action: 'request-info' | 'refer-expert' | 'reject') {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ caseId, note }: { caseId: string; note: string }) => {
      const { data } = await apiClient.post<ApiResponse<CaseSummary>>(
        `/cases/${caseId}/${action}`,
        { note }
      );
      return data.data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: caseKeys.all }),
  });
}

export const useRequestCaseInfo = () => useCaseAction('request-info');
export const useReferCaseToExpert = () => useCaseAction('refer-expert');
export const useRejectCase = () => useCaseAction('reject');

export function useConvertCase() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (caseId: string) => {
      const { data } = await apiClient.post<ApiResponse<CaseSummary>>(`/cases/${caseId}/convert`);
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: caseKeys.all });
      queryClient.invalidateQueries({ queryKey: ['claims'] });
    },
  });
}

export function useLinkCasePolicy() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ caseId, policyId }: { caseId: string; policyId: string }) => {
      const { data } = await apiClient.post<ApiResponse<CaseSummary>>(
        `/cases/${caseId}/link-policy`,
        { policyId }
      );
      return data.data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: caseKeys.all }),
  });
}

export function usePolicySearch(search: string) {
  return useQuery({
    queryKey: caseKeys.policies(search),
    queryFn: async () => {
      const { data } = await apiClient.get<
        ApiResponse<{ policies: PolicySummary[]; pagination: unknown }>
      >(`/policies?search=${encodeURIComponent(search)}`);
      return data.data.policies;
    },
    enabled: search.trim().length >= 2,
    staleTime: 60 * 1000,
  });
}
