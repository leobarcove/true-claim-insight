import { useMutation } from '@tanstack/react-query';
import { apiClient } from '../lib/api-client';
import { ApiResponse } from '@tci/shared-types';

interface VerifyNricParams {
  nric: string;
  phoneNumber: string;
  sessionId: string;
}

interface VerifyNricResponse {
  verified: boolean;
  message: string;
}

export function useVerifyNRIC() {
  return useMutation({
    mutationFn: async (params: VerifyNricParams) => {
      const { data } = await apiClient.post<ApiResponse<VerifyNricResponse>>(
        '/claimants/verify-nric',
        params
      );
      return data.data;
    },
  });
}
