import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type UserRole =
  | 'ADJUSTER'
  | 'FIRM_ADMIN'
  | 'CLAIMANT'
  | 'SIU_INVESTIGATOR'
  | 'COMPLIANCE_OFFICER'
  | 'SUPPORT_DESK'
  | 'SHARIAH_REVIEWER'
  | 'SUPER_ADMIN';

export interface User {
  id: string;
  email: string;
  fullName: string;
  phoneNumber: string;
  role: UserRole;
  tenantId: string;
  currentTenantId: string;
  tenantName: string;
  licenseNumber?: string;
  bcillaCertified?: boolean;
  avatarUrl?: string;
}

export interface UserTenant {
  tenantId: string;
  tenantName: string;
  tenantType: string;
  role: UserRole;
  isDefault: boolean;
  status: string;
  lastAccessedAt?: string;
}

interface AuthState {
  user: User | null;
  userTenants: UserTenant[];
  /**
   * Whether `userTenants` has been confirmed against the server this session.
   * Distinguishes "this user genuinely has no tenants" from "we have not
   * learned them yet", which an empty array alone cannot express. Deliberately
   * not persisted — tenant membership is re-verified from `/auth/me` on every
   * load, so a stale or corrupted cache cannot masquerade as fact.
   */
  tenantsKnown: boolean;
  accessToken: string | null;
  isAuthenticated: boolean;
  setAuth: (user: User, accessToken: string, userTenants?: UserTenant[]) => void;
  updateUser: (user: Partial<User>) => void;
  setUserTenants: (userTenants: UserTenant[]) => void;
  switchTenant: (tenantId: string) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    set => ({
      user: null,
      userTenants: [],
      tenantsKnown: false,
      accessToken: null,
      isAuthenticated: false,

      setAuth: (user, accessToken, userTenants) =>
        set(state => ({
          user,
          accessToken,
          isAuthenticated: true,
          // Omitting `userTenants` means "leave unchanged", not "none". Callers
          // that only renew a token (api-client refresh) or patch the profile
          // (use-user) must not silently clear tenant membership — a defaulted
          // `[]` here previously wiped it and persisted the loss to storage.
          userTenants: userTenants ?? state.userTenants,
          tenantsKnown: userTenants !== undefined ? true : state.tenantsKnown,
        })),

      updateUser: updates =>
        set(state => ({
          user: state.user ? { ...state.user, ...updates } : null,
        })),

      setUserTenants: userTenants => set({ userTenants, tenantsKnown: true }),

      switchTenant: tenantId =>
        set(state => ({
          user: state.user ? { ...state.user, currentTenantId: tenantId } : null,
        })),

      logout: () =>
        set({
          user: null,
          userTenants: [],
          tenantsKnown: false,
          accessToken: null,
          isAuthenticated: false,
        }),
    }),
    {
      name: 'tci-auth',
      partialize: state => ({
        user: state.user,
        userTenants: state.userTenants,
        accessToken: state.accessToken,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);
