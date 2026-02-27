import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

export const locationKeys = {
  all: ['location'] as const,
  reverse: (lat: number, lon: number) => [...locationKeys.all, 'reverse', lat, lon] as const,
};

export function useReverseGeocode(lat: number | null, lon: number | null) {
  return useQuery({
    queryKey: locationKeys.reverse(lat || 0, lon || 0),
    queryFn: async () => {
      if (!lat || !lon) return null;
      const { data } = await apiClient.get('/location/reverse', {
        params: { lat, lon },
      });
      return data?.data;
    },
    enabled: !!lat && !!lon,
    staleTime: 24 * 60 * 60 * 1000, // 24 hours
  });
}
