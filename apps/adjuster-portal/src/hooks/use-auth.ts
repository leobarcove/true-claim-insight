import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient, ApiResponse } from '@/lib/api-client';
import { useAuthStore, User } from '@/stores/auth-store';
import { useNavigate } from 'react-router-dom';

// Types matching api-gateway auth responses
export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterInput {
  email: string;
  password: string;
  fullName: string;
  phoneNumber: string;
  role: 'ADJUSTER' | 'FIRM_ADMIN';
  licenseNumber?: string;
  tenantId?: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface AuthResponse {
  user: User;
  tokens: TokenPair;
}

// Query keys factory
export const authKeys = {
  all: ['auth'] as const,
  user: () => [...authKeys.all, 'user'] as const,
};

/**
 * Login mutation hook
 * Calls POST /auth/login and stores tokens/user in Zustand
 */
export function useLogin() {
  const { setAuth } = useAuthStore();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (credentials: LoginCredentials) => {
      const { data } = await apiClient.post<ApiResponse<AuthResponse>>(
        '/auth/login',
        credentials
      );
      return data.data;
    },
    onSuccess: (data) => {
      setAuth(data.user, data.tokens.accessToken);
      queryClient.invalidateQueries({ queryKey: authKeys.user() });
      navigate('/');
    },
  });
}

/**
 * Register mutation hook
 * Calls POST /auth/register and stores tokens/user in Zustand
 */
export function useRegister() {
  const { setAuth } = useAuthStore();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: RegisterInput) => {
      const { data } = await apiClient.post<ApiResponse<AuthResponse>>(
        '/auth/register',
        input
      );
      return data.data;
    },
    onSuccess: (data) => {
      setAuth(data.user, data.tokens.accessToken);
      queryClient.invalidateQueries({ queryKey: authKeys.user() });
      navigate('/');
    },
  });
}

/**
 * Logout mutation hook
 * Calls POST /auth/logout and clears auth state
 */
export function useLogout() {
  const { logout } = useAuthStore();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      try {
        await apiClient.post('/auth/logout');
      } catch {
        // Ignore errors on logout - we'll clear local state anyway
      }
    },
    onSettled: () => {
      logout();
      queryClient.clear();
      navigate('/login');
    },
  });
}

/**
 * Current user query hook
 * Calls GET /auth/me to fetch current user profile
 */
export function useCurrentUser() {
  const { isAuthenticated } = useAuthStore();

  return useQuery({
    queryKey: authKeys.user(),
    queryFn: async () => {
      const { data } = await apiClient.get<ApiResponse<User>>('/auth/me');
      return data.data;
    },
    enabled: isAuthenticated,
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: false,
  });
}
