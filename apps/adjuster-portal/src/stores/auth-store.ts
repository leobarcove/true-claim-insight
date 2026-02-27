import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type UserRole =
  | 'ADJUSTER'
  | 'FIRM_ADMIN'
  | 'INSURER_ADMIN'
  | 'INSURER_STAFF'
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
      accessToken: null,
      isAuthenticated: false,

      setAuth: (user, accessToken, userTenants = []) =>
        set({
          user,
          userTenants,
          accessToken,
          isAuthenticated: true,
        }),

      updateUser: updates =>
        set(state => ({
          user: state.user ? { ...state.user, ...updates } : null,
        })),

      setUserTenants: userTenants => set({ userTenants }),

      switchTenant: tenantId =>
        set(state => ({
          user: state.user ? { ...state.user, currentTenantId: tenantId } : null,
        })),

      logout: () =>
        set({
          user: null,
          userTenants: [],
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
