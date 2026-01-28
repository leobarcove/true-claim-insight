import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient, ApiResponse } from '@/lib/api-client';

// Types based on Risk Engine's expected output
export interface TrinityMatchResult {
  check_id: string;
  is_pass: boolean | null;
  confidence: number;
  variance?: number;
  details: string;
  priority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  status: 'RUN' | 'SKIPPED' | 'ERROR';
  name?: string; // Enhanced for UI if backend sends it, or we map it
}

export interface TrinityCheck {
  id: string;
  claimId: string;
  status: 'VERIFIED' | 'FLAGGED' | 'REJECTED' | 'INCOMPLETE';
  totalScore: number;
  checkResults: Record<string, TrinityMatchResult> | any;
  summary?: string;
  riskFactors?: string[];
  reasoning?: string;
  reasoningInsights?: {
    insights: string[];
    recommendation: string;
    confidence: number;
    model?: string;
  };
  createdAt: string;
  updatedAt: string;
}

export interface DocumentAnalysis {
  documentId: string;
  confidenceScore: number;
  // Dynamic fields from analysis
  extractedData: Record<string, any>;
  validityStatus: 'PASS' | 'WARN' | 'FAIL';
  issues?: string[];
}

export const trinityKeys = {
  all: ['trinity'] as const,
  check: (claimId: string) => [...trinityKeys.all, 'check', claimId] as const,
  analysis: (docId: string) => [...trinityKeys.all, 'analysis', docId] as const,
};

export function useTrinityCheck(claimId: string) {
  return useQuery({
    queryKey: trinityKeys.check(claimId),
    queryFn: async () => {
      // Endpoint derived from RiskController: @Get('claims/:claimId/trinity')
      const { data } = await apiClient.get<TrinityCheck>(`/risk/claims/${claimId}/trinity`);
      return data;
    },
    enabled: !!claimId,
    retry: 1,
  });
}

export function useDocumentAnalysis(documentId: string) {
  return useQuery({
    queryKey: trinityKeys.analysis(documentId),
    queryFn: async () => {
      // Endpoint derived from RiskController: @Get('documents/:documentId/analysis')
      const { data } = await apiClient.get<DocumentAnalysis>(
        `/risk/documents/${documentId}/analysis`
      );
      return data;
    },
    enabled: !!documentId,
    retry: 1,
  });
}

export function useTriggerTrinityCheck() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (claimId: string) => {
      const { data } = await apiClient.post<ApiResponse<any>>(
        `/claims/${claimId}/documents/trinity-check`
      );
      return data.data;
    },
    onSuccess: (_, claimId) => {
      queryClient.invalidateQueries({ queryKey: trinityKeys.check(claimId) });
      queryClient.invalidateQueries({ queryKey: ['claims', 'detail', claimId] });
    },
  });
}
