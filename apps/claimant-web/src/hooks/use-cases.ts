import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient, ApiResponse } from '@/lib/api-client';
import type { CaseStatus, FlowStep, TravelClaimType } from '@tci/shared-types';

export const caseKeys = {
  all: ['cases'] as const,
  mine: () => [...caseKeys.all, 'mine'] as const,
  detail: (id: string) => [...caseKeys.all, 'detail', id] as const,
};

export interface ClaimantCase {
  id: string;
  caseNumber: string;
  status: CaseStatus | string;
  travelClaimType?: TravelClaimType | string | null;
  answers: Record<string, string | number | boolean>;
  currentStepId?: string | null;
  currentStep?: FlowStep | null;
  reviewNote?: string | null;
  needsPolicyReview?: boolean;
  submittedAt?: string | null;
  createdAt: string;
  documents?: Array<{ id: string; documentType: string; fileName: string; stepId?: string | null }>;
}

export interface PatchAnswerResult {
  accepted: boolean;
  error?: string;
  case?: ClaimantCase;
  nextStep?: FlowStep | null;
  warnings?: string[];
}

export function useMyCases() {
  return useQuery({
    queryKey: caseKeys.mine(),
    queryFn: async () => {
      const { data } = await apiClient.get<ApiResponse<ClaimantCase[]>>('/cases/mine');
      return data.data;
    },
  });
}

export function useClaimantCase(caseId: string | undefined) {
  return useQuery({
    queryKey: caseKeys.detail(caseId || ''),
    queryFn: async () => {
      const { data } = await apiClient.get<ApiResponse<ClaimantCase>>(`/cases/${caseId}`);
      return data.data;
    },
    enabled: !!caseId,
  });
}

export function useCreateClaimantCase() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (travelClaimType: TravelClaimType | string) => {
      const { data } = await apiClient.post<ApiResponse<ClaimantCase>>('/cases', {
        travelClaimType,
      });
      return data.data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: caseKeys.mine() }),
  });
}

export function usePatchCaseAnswer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      caseId,
      stepId,
      value,
    }: {
      caseId: string;
      stepId: string;
      value: string | number | boolean;
    }) => {
      const { data } = await apiClient.patch<ApiResponse<PatchAnswerResult>>(
        `/cases/${caseId}/answers`,
        { stepId, value }
      );
      return data.data;
    },
    onSuccess: (_result, variables) =>
      queryClient.invalidateQueries({ queryKey: caseKeys.detail(variables.caseId) }),
  });
}

export function useSubmitClaimantCase() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (caseId: string) => {
      const { data } = await apiClient.post<ApiResponse<ClaimantCase>>(`/cases/${caseId}/submit`);
      return data.data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: caseKeys.all }),
  });
}

export async function uploadCaseDocument(
  caseId: string,
  file: File,
  documentType: string,
  stepId: string
) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('type', documentType);
  formData.append('stepId', stepId);
  const { data } = await apiClient.post<ApiResponse<{ id: string }>>(
    `/cases/${caseId}/documents/upload`,
    formData,
    { headers: { 'Content-Type': 'multipart/form-data' } }
  );
  return data.data;
}
