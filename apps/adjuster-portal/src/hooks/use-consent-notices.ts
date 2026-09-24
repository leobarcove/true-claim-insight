import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiClient, ApiResponse } from '@/lib/api-client';

export const consentNoticeKeys = {
  all: ['consent-notices'] as const,
  pending: () => [...consentNoticeKeys.all, 'pending'] as const,
};

/**
 * A notice version waiting for approval, with the languages that exist for it.
 *
 * `locales` matters on screen: approval is refused unless both `en` and `ms`
 * are present (PDPA s.7), so a version showing only one language cannot be
 * approved yet and the button has to say why rather than failing on click.
 */
export interface PendingNotice {
  purpose: string;
  version: number;
  locales: string[];
}

export function usePendingNotices(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: consentNoticeKeys.pending(),
    queryFn: async () => {
      const { data } =
        await apiClient.get<ApiResponse<PendingNotice[]>>('/consent/pending-approval');
      return data.data;
    },
    enabled: options?.enabled ?? true,
  });
}

export function useApproveNotice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ purpose, version }: { purpose: string; version: number }) => {
      const { data } = await apiClient.post<ApiResponse<unknown>>(
        `/consent/notice/${encodeURIComponent(purpose)}/${version}/approve`
      );
      return data.data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: consentNoticeKeys.all }),
  });
}
