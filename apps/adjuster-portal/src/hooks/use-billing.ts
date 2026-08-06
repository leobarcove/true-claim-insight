import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiClient, ApiResponse } from '@/lib/api-client';

export const billingKeys = {
  all: ['billing'] as const,
  forClaim: (claimId: string) => [...billingKeys.all, 'claim', claimId] as const,
};

export type FeeNoteStatus = 'DRAFT' | 'ISSUED' | 'PAID' | 'DISPUTED' | 'CANCELLED';

export interface FeeNote {
  id: string;
  noteNumber: string;
  claimId: string;
  status: FeeNoteStatus;
  /** Decimal strings as stored — money is never parsed to a float for display. */
  professionalFee: string;
  disbursementsTotal: string;
  sstAmount: string;
  total: string;
  /** The workings. A number without them is unanswerable in a dispute. */
  computation: {
    basis: 'SCALE' | 'TIME' | 'FIXED';
    inputs: { assessedAmount?: number; hours?: number };
    derivation: string[];
    sstRate: number;
  } | null;
  issuedAt: string | null;
  dueAt: string | null;
  paidAt: string | null;
  paymentReference: string | null;
  disputedAt: string | null;
  disputeReason: string | null;
}

export interface TimeEntry {
  id: string;
  workedOn: string;
  hours: string;
  description: string;
}

export interface Disbursement {
  id: string;
  description: string;
  amount: string;
  incurredAt: string;
}

export interface ClaimBilling {
  note: FeeNote | null;
  timeEntries: TimeEntry[];
  disbursements: Disbursement[];
  /** Why a note cannot be drafted yet, in the words the drafting rule uses. */
  blockedReason: string | null;
}

export function useClaimBilling(claimId?: string) {
  return useQuery({
    queryKey: billingKeys.forClaim(claimId ?? ''),
    queryFn: async () => {
      const response = await apiClient.get<ApiResponse<ClaimBilling>>(
        `/billing/claims/${claimId}/fee-note`
      );
      return response.data?.data ?? null;
    },
    enabled: Boolean(claimId),
  });
}

export function useDraftFeeNote(claimId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const response = await apiClient.post(`/billing/claims/${claimId}/fee-note`, {});
      return response.data?.data ?? response.data;
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: billingKeys.forClaim(claimId ?? '') }),
  });
}

export function useIssueFeeNote(claimId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (noteId: string) => {
      const response = await apiClient.post(`/billing/fee-notes/${noteId}/issue`, {});
      return response.data?.data ?? response.data;
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: billingKeys.forClaim(claimId ?? '') }),
  });
}
