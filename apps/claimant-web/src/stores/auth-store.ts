import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface ClaimantUser {
  id: string;
  phoneNumber: string;
  fullName?: string | null;
  kycStatus?: 'PENDING' | 'VERIFIED' | 'FAILED' | 'EXPIRED';
}

interface AuthState {
  user: ClaimantUser | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  setAuth: (user: ClaimantUser, accessToken: string) => void;
  updateUser: (user: Partial<ClaimantUser>) => void;
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
      name: 'tci-claimant-auth',
      partialize: (state) => ({
        user: state.user,
        accessToken: state.accessToken,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);
