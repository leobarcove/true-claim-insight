import { useAuthStore } from '@/stores/auth-store';

/**
 * Hook to check if a superadmin user currently has no tenant selected.
 * This is useful for triggering a tenant selector if the user needs to be in a tenant context.
 */
export function useSuperAdminNoTenant() {
  const { user } = useAuthStore();

  const isSuperAdmin = user?.role === 'SUPER_ADMIN';
  const hasNoTenant = !user?.currentTenantId;

  return {
    isSuperAdmin,
    hasNoTenant,
    isSelectionRequired: isSuperAdmin && hasNoTenant,
  };
}
