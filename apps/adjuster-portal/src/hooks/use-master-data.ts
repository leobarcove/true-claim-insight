import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient, ApiResponse } from '@/lib/api-client';

export interface VehicleMake {
  id: string;
  name: string;
  models?: VehicleModel[];
  createdAt?: string;
  updatedAt?: string;
}

export interface VehicleModel {
  id: string;
  name: string;
  makeId: string;
  createdAt?: string;
  updatedAt?: string;
}

export const masterDataKeys = {
  all: ['master-data'] as const,
  makes: () => [...masterDataKeys.all, 'makes'] as const,
  models: (makeId: string) => [...masterDataKeys.all, 'models', makeId] as const,
};

export function useVehicleMakes() {
  return useQuery({
    queryKey: masterDataKeys.makes(),
    queryFn: async () => {
      const { data } = await apiClient.get<ApiResponse<VehicleMake[]>>(
        '/master-data/vehicles/makes'
      );
      return data.data;
    },
  });
}

export function useVehicleModels(makeId: string | null) {
  return useQuery({
    queryKey: masterDataKeys.models(makeId || ''),
    queryFn: async () => {
      if (!makeId) return [];
      const { data } = await apiClient.get<ApiResponse<VehicleModel[]>>(
        '/master-data/vehicles/models',
        {
          params: { makeId },
        }
      );
      return data.data;
    },
    enabled: !!makeId,
  });
}

export function useCreateVehicleMake() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (name: string) => {
      const { data } = await apiClient.post<ApiResponse<VehicleMake>>(
        '/master-data/vehicles/makes',
        { name }
      );
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: masterDataKeys.makes() });
    },
  });
}

export function useCreateVehicleModel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ name, makeId }: { name: string; makeId: string }) => {
      const { data } = await apiClient.post<ApiResponse<VehicleModel>>(
        '/master-data/vehicles/models',
        {
          name,
          makeId,
        }
      );
      return data.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: masterDataKeys.models(variables.makeId) });
      queryClient.invalidateQueries({ queryKey: masterDataKeys.makes() });
    },
  });
}

export function useUpdateVehicleMake() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const { data } = await apiClient.patch<ApiResponse<VehicleMake>>(
        `/master-data/vehicles/makes/${id}`,
        { name }
      );
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: masterDataKeys.makes() });
    },
  });
}

export function useDeleteVehicleMake() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/master-data/vehicles/makes/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: masterDataKeys.makes() });
    },
  });
}

export function useUpdateVehicleModel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, name, makeId }: { id: string; name: string; makeId: string }) => {
      const { data } = await apiClient.patch<ApiResponse<VehicleModel>>(
        `/master-data/vehicles/models/${id}`,
        { name, makeId }
      );
      return data.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: masterDataKeys.models(variables.makeId) });
      queryClient.invalidateQueries({ queryKey: masterDataKeys.makes() });
    },
  });
}

export function useDeleteVehicleModel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, makeId }: { id: string; makeId: string }) => {
      await apiClient.delete(`/master-data/vehicles/models/${id}`);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: masterDataKeys.models(variables.makeId) });
      queryClient.invalidateQueries({ queryKey: masterDataKeys.makes() });
    },
  });
}
