import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiClient, ApiResponse } from '@/lib/api-client';
import { useAuthStore } from '@/stores/auth-store';

export const consentKeys = {
  all: ['consent'] as const,
  standing: (claimantId: string) => [...consentKeys.all, 'standing', claimantId] as const,
  notice: (purpose: string, locale: string) =>
    [...consentKeys.all, 'notice', purpose, locale] as const,
};

export interface ConsentNotice {
  id: string;
  version: number;
  locale: string;
  title: string;
  body: string;
}

export interface ConsentRecord {
  id: string;
  purpose: string;
  status: string;
}

/**
 * The approved wording for a purpose.
 *
 * Fetched, never bundled. Consent recorded against wording that lives in the
 * app bundle is unprovable later — the notice is versioned and immutable
 * server-side precisely so a grant can be tied to exactly what was shown.
 */
export function useConsentNotice(purpose = 'CLAIM_PROCESSING', locale = 'en') {
  return useQuery({
    queryKey: consentKeys.notice(purpose, locale),
    queryFn: async () => {
      const { data } = await apiClient.get<ApiResponse<ConsentNotice | null>>('/consent/notice', {
        params: { purpose, locale },
      });
      return data.data;
    },
    staleTime: Infinity,
  });
}

/** Whether this claimant has already agreed, so they are not asked twice. */
export function useConsentStanding() {
  const claimantId = useAuthStore(state => state.user?.id);
  return useQuery({
    queryKey: consentKeys.standing(claimantId || ''),
    queryFn: async () => {
      const { data } = await apiClient.get<ApiResponse<ConsentRecord[]>>(
        `/consent/claimant/${claimantId}`
      );
      return data.data;
    },
    enabled: !!claimantId,
  });
}

export function useGrantConsent() {
  const queryClient = useQueryClient();
  const claimantId = useAuthStore(state => state.user?.id);
  return useMutation({
    mutationFn: async (purpose: string = 'CLAIM_PROCESSING') => {
      const { data } = await apiClient.post(`/consent/claimant/${claimantId}/grant`, {
        purpose,
        capturedVia: 'WEB_FORM',
      });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: consentKeys.all });
    },
  });
}
