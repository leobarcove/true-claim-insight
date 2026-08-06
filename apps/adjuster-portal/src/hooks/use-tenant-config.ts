import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiClient, ApiResponse } from '@/lib/api-client';

export const tenantConfigKeys = {
  all: ['tenant-config'] as const,
  settings: (tenantId: string) => [...tenantConfigKeys.all, tenantId] as const,
};

export interface TenantSettings {
  licensedMode: boolean;
  calendarState: string;
  fastTrackCategories: string[];
  /** Category → decimal string ceiling. */
  fastTrackLimits: Record<string, string>;
  brandingName: string;
}

export interface TenantConfig {
  tenantId: string;
  tenantName: string;
  settings: TenantSettings;
}

/** Partial by design — a patch touches only what it names. */
export type SettingsPatch = Partial<Omit<TenantSettings, 'brandingName'>> & {
  brandingName?: string;
  /** Required by the server when licensedMode is being changed. */
  reason?: string;
};

export function useTenantConfig(tenantId: string | undefined) {
  return useQuery({
    queryKey: tenantConfigKeys.settings(tenantId ?? ''),
    queryFn: async () => {
      const { data } = await apiClient.get<ApiResponse<TenantConfig>>(
        `/tenants/${tenantId}/settings`
      );
      return data.data;
    },
    enabled: Boolean(tenantId),
  });
}

export function useUpdateTenantConfig(tenantId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (patch: SettingsPatch) => {
      const { data } = await apiClient.patch<ApiResponse<TenantConfig>>(
        `/tenants/${tenantId}/settings`,
        patch
      );
      return data.data;
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: tenantConfigKeys.settings(tenantId) }),
  });
}
