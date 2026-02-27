import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient, ApiResponse } from '@/lib/api-client';
import { UserRole } from '@/stores/auth-store';

export interface Tenant {
  id: string;
  name: string;
  type: string;
  subscriptionTier: string;
  createdAt: string;
  updatedAt: string;
}

export interface User {
  id: string;
  email: string;
  fullName: string;
  phoneNumber: string;
  role: UserRole;
  createdAt: string;
  updatedAt: string;
}

export interface UserTenant {
  id: string;
  userId: string;
  tenantId: string;
  role: UserRole;
  isDefault: boolean;
  status: string;
  user: User;
  tenant: Tenant;
}

export const adminKeys = {
  all: ['admin'] as const,
  tenants: () => [...adminKeys.all, 'tenants'] as const,
  users: () => [...adminKeys.all, 'users'] as const,
  userTenants: () => [...adminKeys.all, 'user-tenants'] as const,
};

// Tenants
export function useTenants() {
  return useQuery({
    queryKey: adminKeys.tenants(),
    queryFn: async () => {
      const { data } = await apiClient.get<ApiResponse<Tenant[]>>('/tenants');
      return data.data;
    },
  });
}

export function useCreateTenant() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<Tenant>) => {
      const { data } = await apiClient.post<ApiResponse<Tenant>>('/tenants', input);
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminKeys.tenants() });
    },
  });
}

export function useUpdateTenant() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }: Partial<Tenant> & { id: string }) => {
      const { data } = await apiClient.patch<ApiResponse<Tenant>>(`/tenants/${id}`, input);
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminKeys.tenants() });
    },
  });
}

export function useDeleteTenant() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/tenants/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminKeys.tenants() });
    },
  });
}

// Users
export function useUsers() {
  return useQuery({
    queryKey: adminKeys.users(),
    queryFn: async () => {
      const { data } = await apiClient.get<ApiResponse<User[]>>('/users');
      return data.data;
    },
  });
}

export function useCreateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<User> & { password?: string }) => {
      const { data } = await apiClient.post<ApiResponse<User>>('/users', input);
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminKeys.users() });
    },
  });
}

export function useUpdateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }: Partial<User> & { id: string }) => {
      const { data } = await apiClient.patch<ApiResponse<User>>(`/users/${id}`, input);
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminKeys.users() });
    },
  });
}

export function useDeleteUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/users/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminKeys.users() });
    },
  });
}

// User-Tenants Association
export function useUserTenants() {
  return useQuery({
    queryKey: adminKeys.userTenants(),
    queryFn: async () => {
      const { data } = await apiClient.get<ApiResponse<UserTenant[]>>('/user-tenants');
      return data.data;
    },
  });
}

export function useCreateUserTenant() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<UserTenant>) => {
      const { data } = await apiClient.post<ApiResponse<UserTenant>>('/user-tenants', input);
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminKeys.userTenants() });
    },
  });
}

export function useUpdateUserTenant() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }: Partial<UserTenant> & { id: string }) => {
      const { data } = await apiClient.patch<ApiResponse<UserTenant>>(`/user-tenants/${id}`, input);
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminKeys.userTenants() });
    },
  });
}

export function useDeleteUserTenant() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/user-tenants/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminKeys.userTenants() });
    },
  });
}
