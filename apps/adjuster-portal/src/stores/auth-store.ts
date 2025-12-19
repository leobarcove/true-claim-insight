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
  role: UserRole;
  tenantId: string;
  tenantName: string;
  licenseNumber?: string;
  bcillaCertified?: boolean;
}

interface AuthState {
  user: User | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  setAuth: (user: User, accessToken: string) => void;
  updateUser: (user: Partial<User>) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      isAuthenticated: false,

      setAuth: (user, accessToken) =>
        set({
          user,
          accessToken,
          isAuthenticated: true,
        }),

      updateUser: (updates) =>
        set((state) => ({
          user: state.user ? { ...state.user, ...updates } : null,
        })),

      logout: () =>
        set({
          user: null,
          accessToken: null,
          isAuthenticated: false,
        }),
    }),
    {
      name: 'tci-auth',
      partialize: (state) => ({
        user: state.user,
        accessToken: state.accessToken,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);
