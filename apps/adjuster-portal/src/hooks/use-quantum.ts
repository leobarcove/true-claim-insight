import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiClient, ApiResponse } from '@/lib/api-client';

export const quantumKeys = {
  all: ['quantum'] as const,
  current: (claimId: string) => [...quantumKeys.all, 'current', claimId] as const,
  history: (claimId: string) => [...quantumKeys.all, 'history', claimId] as const,
};

export type SettlementBasis = 'REINSTATEMENT' | 'INDEMNITY';

export interface QuantumLine {
  key: string;
  label: string;
  /** Decimal string as stored — never parsed to a number for display. */
  amount: string;
  basis: string;
}

export interface QuantumWorksheet {
  id: string;
  claimId: string;
  revision: number;
  basis: SettlementBasis;
  assessedLoss: string;
  depreciationRate: string | null;
  betterment: string | null;
  sumInsured: string;
  valueAtRisk: string | null;
  averageCondition: boolean;
  salvage: string | null;
  excess: string | null;
  adjustedLoss: string;
  underinsured: boolean;
  averageRatio: string | null;
  averageApplied: boolean;
  recommended: string;
  cappedAtSumInsured: boolean;
  lines: QuantumLine[];
  warnings: string[];
  notes: string | null;
  createdAt: string;
}

/**
 * Money is sent as a string, never a number.
 *
 * The DTO on the server takes decimal strings for the same reason: a JSON
 * number is an IEEE-754 double, and this is the one screen where a rounding
 * artefact ends up as a sum of money in a report an insurer acts on.
 */
export interface PrepareWorksheetInput {
  basis: SettlementBasis;
  assessedLoss: string;
  sumInsured: string;
  depreciationRate?: string;
  betterment?: string;
  valueAtRisk?: string;
  averageCondition: boolean;
  salvage?: string;
  excess?: string;
  notes?: string;
}

export function useQuantum(claimId: string | undefined) {
  return useQuery({
    queryKey: quantumKeys.current(claimId ?? ''),
    queryFn: async () => {
      const { data } = await apiClient.get<ApiResponse<QuantumWorksheet | null>>(
        `/claims/${claimId}/quantum`
      );
      return data.data;
    },
    enabled: Boolean(claimId),
  });
}

export function useQuantumHistory(claimId: string | undefined) {
  return useQuery({
    queryKey: quantumKeys.history(claimId ?? ''),
    queryFn: async () => {
      const { data } = await apiClient.get<ApiResponse<QuantumWorksheet[]>>(
        `/claims/${claimId}/quantum/history`
      );
      return data.data;
    },
    enabled: Boolean(claimId),
  });
}

export function usePrepareQuantum(claimId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: PrepareWorksheetInput) => {
      // Empty optional fields are omitted rather than sent as '': the server
      // validates them as decimal strings, and '' is not one.
      const body = Object.fromEntries(
        Object.entries(input).filter(([, value]) => value !== '' && value !== undefined)
      );
      const { data } = await apiClient.post<ApiResponse<QuantumWorksheet>>(
        `/claims/${claimId}/quantum`,
        body
      );
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: quantumKeys.current(claimId) });
      queryClient.invalidateQueries({ queryKey: quantumKeys.history(claimId) });
    },
  });
}
