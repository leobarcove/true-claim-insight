import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient, ApiResponse } from '@/lib/api-client';
import { useAuthStore, User } from '@/stores/auth-store';
import { authKeys } from './use-auth';

export interface UpdateProfileInput {
  fullName?: string;
  phoneNumber?: string;
  licenseNumber?: string;
  avatarUrl?: string;
}

export interface UpdatePasswordInput {
  currentPassword?: string;
  newPassword?: string;
}

export function useUpdateProfile() {
  const queryClient = useQueryClient();
  const { user, setAuth, accessToken } = useAuthStore();

  return useMutation({
    mutationFn: async (input: UpdateProfileInput) => {
      if (!user?.id) throw new Error('User not logged in');
      const { data } = await apiClient.patch<ApiResponse<User>>(`/users/${user.id}`, input);
      return data.data;
    },
    onSuccess: updatedUser => {
      if (accessToken) {
        setAuth(updatedUser, accessToken);
      }
      queryClient.invalidateQueries({ queryKey: authKeys.user() });
    },
  });
}

export function useUpdatePassword() {
  return useMutation({
    mutationFn: async (input: UpdatePasswordInput) => {
      const { data } = await apiClient.post<ApiResponse<void>>('/auth/change-password', input);
      return data.data;
    },
  });
}

export function useDeleteAccount() {
  const { logout } = useAuthStore();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const { data } = await apiClient.delete<ApiResponse<void>>('/auth/account');
      return data.data;
    },
    onSuccess: () => {
      logout();
      queryClient.clear();
      window.location.href = '/login';
    },
  });
}
