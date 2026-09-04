import { useMutation, useQuery } from '@tanstack/react-query';

import { apiClient, ApiResponse } from '@/lib/api-client';

/**
 * A claimant's consent standing, and how to record one for them.
 *
 * The staff capture form needs both because `CasesService.create` refuses to
 * open a Case without a live `CLAIM_PROCESSING` consent — so the page has to
 * know, before it submits, whether this person has one and what to do when they
 * do not. Until now it asked neither question and met the refusal as an opaque
 * 400 on the Create button.
 */

export interface ClaimantConsent {
  id: string;
  purpose: string;
  status: string;
  capturedVia: string;
  grantedAt: string;
  notice?: { purpose: string; version: number; locale: string; title: string };
}

export interface ResolvedClaimant {
  id: string;
  phoneNumber: string;
  fullName: string | null;
  nricLast4: string | null;
  /** True when we already held a record for this number. */
  existing: boolean;
}

/** Find or create the claimant this capture is for. */
export function useResolveClaimant() {
  return useMutation({
    mutationFn: async (input: { phoneNumber: string; fullName?: string; nric?: string }) => {
      const { data } = await apiClient.post<ApiResponse<ResolvedClaimant>>(
        '/claimants/resolve',
        input
      );
      return data.data;
    },
  });
}

export const claimantConsentKey = (claimantId: string) =>
  ['claimant-consent', claimantId] as const;

/**
 * Every consent for a claimant, current and withdrawn — the PDPA record.
 *
 * A live `CLAIM_PROCESSING` grant is the one that matters here; the rest are
 * shown to nobody on this screen, but the endpoint returns the history and
 * filtering it in the caller keeps this hook honest about what it fetched.
 */
export function useClaimantConsent(claimantId: string | null) {
  return useQuery({
    queryKey: claimantConsentKey(claimantId ?? ''),
    enabled: Boolean(claimantId),
    queryFn: async () => {
      const { data } = await apiClient.get<ApiResponse<ClaimantConsent[]>>(
        `/consent/claimant/${claimantId}`
      );
      return data.data;
    },
  });
}

export const hasLiveClaimConsent = (consents: ClaimantConsent[] | undefined): boolean =>
  Boolean(
    consents?.some(
      consent => consent.purpose === 'CLAIM_PROCESSING' && consent.status === 'GRANTED'
    )
  );

export type InteractionChannel = 'PHONE' | 'IN_PERSON' | 'VIDEO' | 'OTHER';

/**
 * Record the verbal consent a staff member is attesting to.
 *
 * Only ever for a capture where a conversation actually happened. The attesting
 * user comes from the caller's own token on the server, never from here.
 */
export function useAttestVerbalConsent() {
  return useMutation({
    mutationFn: async (input: {
      claimantId: string;
      interactionChannel: InteractionChannel;
      interactionReference?: string;
    }) => {
      const { data } = await apiClient.post<ApiResponse<unknown>>(
        `/consent/claimant/${input.claimantId}/grant`,
        {
          purpose: 'CLAIM_PROCESSING',
          capturedVia: 'VERBAL_AGENT_ATTESTED',
          attestation: {
            interactionChannel: input.interactionChannel,
            interactionReference: input.interactionReference || undefined,
          },
        }
      );
      return data.data;
    },
  });
}
