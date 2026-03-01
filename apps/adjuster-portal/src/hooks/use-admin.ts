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
  tenants: (filters?: any) =>
    filters ? [...adminKeys.all, 'tenants', filters] : [...adminKeys.all, 'tenants'],
  users: (filters?: any) =>
    filters ? [...adminKeys.all, 'users', filters] : [...adminKeys.all, 'users'],
  userTenants: (filters?: any) =>
    filters ? [...adminKeys.all, 'user-tenants', filters] : [...adminKeys.all, 'user-tenants'],
};

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface TenantListResponse {
  tenants: Tenant[];
  pagination: Pagination;
}

export interface UserListResponse {
  users: User[];
  pagination: Pagination;
}

export interface UserTenantListResponse {
  userTenants: UserTenant[];
  pagination: Pagination;
}

// Tenants
export function useTenants(params: { page?: number; limit?: number; search?: string } = {}) {
  return useQuery({
    queryKey: adminKeys.tenants(params),
    queryFn: async () => {
      const { data } = await apiClient.get<ApiResponse<any>>('/tenants', {
        params,
      });

      const payload = data.data;
      const tenants = Array.isArray(payload) ? payload : payload.tenants || [];
      const metaPagination = data.meta?.pagination || payload.pagination;

      const limit = params.limit ?? metaPagination?.limit ?? 10;
      const page = params.page ?? metaPagination?.page ?? 1;

      // Frontend filtering fallback
      let filteredTenants = tenants;
      if (params.search) {
        const query = params.search.toLowerCase();
        filteredTenants = tenants.filter(
          (t: Tenant) =>
            t.name.toLowerCase().includes(query) ||
            t.type.toLowerCase().includes(query) ||
            t.subscriptionTier.toLowerCase().includes(query)
        );
      }

      const total = params.search
        ? filteredTenants.length
        : (metaPagination?.total ?? tenants.length);

      // Frontend fallback pagination
      const displayTenants = filteredTenants.slice((page - 1) * limit, page * limit);

      return {
        tenants: displayTenants,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      } as TenantListResponse;
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
export function useUsers(params: { page?: number; limit?: number; search?: string } = {}) {
  return useQuery({
    queryKey: adminKeys.users(params),
    queryFn: async () => {
      const { data } = await apiClient.get<ApiResponse<any>>('/users', {
        params,
      });

      const payload = data.data;
      const users = Array.isArray(payload) ? payload : payload.users || [];
      const metaPagination = data.meta?.pagination || payload.pagination;

      const limit = params.limit ?? metaPagination?.limit ?? 10;
      const page = params.page ?? metaPagination?.page ?? 1;

      // Frontend filtering fallback
      let filteredUsers = users;
      if (params.search) {
        const query = params.search.toLowerCase();
        filteredUsers = users.filter(
          (u: User) =>
            u.fullName.toLowerCase().includes(query) || u.email.toLowerCase().includes(query)
        );
      }

      const total = params.search ? filteredUsers.length : (metaPagination?.total ?? users.length);

      // Frontend fallback pagination
      const displayUsers = filteredUsers.slice((page - 1) * limit, page * limit);

      return {
        users: displayUsers,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      } as UserListResponse;
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
export function useUserTenants(params: { page?: number; limit?: number; search?: string } = {}) {
  return useQuery({
    queryKey: adminKeys.userTenants(params),
    queryFn: async () => {
      const { data } = await apiClient.get<ApiResponse<any>>('/user-tenants', {
        params,
      });

      const payload = data.data;
      const userTenants = Array.isArray(payload)
        ? payload
        : payload.userTenants || payload.associations || [];
      const metaPagination = data.meta?.pagination || payload.pagination;

      const limit = params.limit ?? metaPagination?.limit ?? 10;
      const page = params.page ?? metaPagination?.page ?? 1;

      // Frontend filtering fallback
      let filteredAssociations = userTenants;
      if (params.search) {
        const query = params.search.toLowerCase();
        filteredAssociations = userTenants.filter(
          (ut: UserTenant) =>
            ut.user.fullName.toLowerCase().includes(query) ||
            ut.tenant.name.toLowerCase().includes(query) ||
            ut.role.toLowerCase().includes(query)
        );
      }

      const total = params.search
        ? filteredAssociations.length
        : (metaPagination?.total ?? userTenants.length);

      // Frontend fallback pagination
      const displayUserTenants = filteredAssociations.slice((page - 1) * limit, page * limit);

      return {
        userTenants: displayUserTenants,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      } as UserTenantListResponse;
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
