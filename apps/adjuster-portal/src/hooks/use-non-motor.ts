import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient, ApiResponse } from '@/lib/api-client';
import type {
  Claim,
  EvidenceRequirementResolved,
  FraudSignal,
  FloodSource,
  PropertyType,
} from '@tci/shared-types';
import { claimKeys } from './use-claims';

export interface CreateFloodClaimInput {
  // Core claim — supply either an existing claimantId, OR claimantNric +
  // claimantPhone (+ optional claimantName) and the api-gateway will
  // upsert a Claimant for you.
  claimantId?: string;
  claimantNric?: string;
  claimantPhone?: string;
  claimantName?: string;
  nric?: string;
  policyNumber: string;
  incidentDate: string;
  incidentLocation: { address: string; latitude?: number; longitude?: number };
  description: string;
  /**
   * Real consent standing, from the consent records. Replaces the old
   * `isPdpaCompliant` boolean, which the client set and nothing verified.
   */
  consent?: { claimProcessing: boolean; biometric: boolean; crossBorder: boolean };
  // Flood-specific
  incidentStart: string;
  incidentEnd?: string;
  waterDepthCm?: number;
  durationHours?: number;
  source?: FloodSource;
  propertyType?: PropertyType;
  propertyFloorLevel?: number;
  propertyElevationMeters?: number;
  postcode?: string;
  state?: string;
  buildingDamageRm?: number;
  contentsDamageRm?: number;
  vehicleDamageRm?: number;
}

/**
 * Hooks for non-motor extensions: evidence checklist and fraud signals.
 * Hooks for flood-specific claim creation are added when the FNOL wizard
 * lands; the detail page only reads the existing claim shape (which now
 * includes floodClaim + fraudSignals from the backend).
 */

export const nonMotorKeys = {
  evidence: (claimId: string) =>
    ['claims', 'detail', claimId, 'evidence-checklist'] as const,
  fraudSignals: (claimId: string) =>
    ['fraud-signals', claimId] as const,
};

/**
 * Create a flood claim. Hits the api-gateway POST /claims/flood proxy,
 * which forwards to case-service where Claim + FloodClaim are inserted
 * in a single transaction.
 */
export function useCreateFloodClaim() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateFloodClaimInput) => {
      const { data } = await apiClient.post<ApiResponse<Claim>>(
        '/claims/flood',
        input
      );
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: claimKeys.lists() });
      queryClient.invalidateQueries({ queryKey: claimKeys.stats() });
    },
  });
}

/**
 * Evidence checklist for a claim. The backend resolves which document
 * types are required for the claim's category (per EvidenceRequirement
 * config) and annotates each with whether the claimant has uploaded one.
 */
export function useEvidenceChecklist(claimId: string | undefined) {
  return useQuery({
    queryKey: nonMotorKeys.evidence(claimId ?? ''),
    queryFn: async () => {
      const { data } = await apiClient.get<ApiResponse<EvidenceRequirementResolved[]>>(
        `/claims/${claimId}/evidence-checklist`
      );
      return data.data;
    },
    enabled: !!claimId,
    staleTime: 30 * 1000,
  });
}

/**
 * List fraud signals for a claim. Shift-Technology pattern: each signal is
 * an independent typed event with provider, category, severity, confidence.
 */
export function useFraudSignals(claimId: string | undefined) {
  return useQuery({
    queryKey: nonMotorKeys.fraudSignals(claimId ?? ''),
    queryFn: async () => {
      const { data } = await apiClient.get<ApiResponse<FraudSignal[]>>(
        `/fraud-signals/claims/${claimId}`
      );
      // Risk-engine returns the array as the top-level body for some
      // routes; the proxy wraps with success/data. Defensive parse.
      const items = Array.isArray(data) ? data : (data as any).data ?? [];
      return items as FraudSignal[];
    },
    enabled: !!claimId,
    staleTime: 30 * 1000,
  });
}

/**
 * Trigger re-evaluation of all applicable fraud-signal providers. The
 * orchestrator persists new signal rows; we then invalidate the list
 * query so the UI refreshes automatically.
 */
export function useEvaluateFraudSignals(claimId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data } = await apiClient.post<ApiResponse<FraudSignal[]>>(
        `/fraud-signals/claims/${claimId}/evaluate`,
        {}
      );
      const items = Array.isArray(data) ? data : (data as any).data ?? [];
      return items as FraudSignal[];
    },
    onSuccess: () => {
      if (claimId) {
        queryClient.invalidateQueries({
          queryKey: nonMotorKeys.fraudSignals(claimId),
        });
        // The base claim query embeds fraudSignals too, so invalidate it.
        queryClient.invalidateQueries({
          queryKey: claimKeys.detail(claimId),
        });
      }
    },
  });
}
