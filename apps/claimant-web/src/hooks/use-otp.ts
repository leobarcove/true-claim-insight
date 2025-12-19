import { useMutation } from '@tanstack/react-query';
import { apiClient, ApiResponse } from '@/lib/api-client';
import { useAuthStore, ClaimantUser } from '@/stores/auth-store';
import { useNavigate } from 'react-router-dom';
import { formatMalaysianPhone } from '@/lib/utils';

// Types
export interface SendOtpResponse {
  message: string;
  expiresIn: number;
}

export interface VerifyOtpResponse {
  user: ClaimantUser;
  tokens: {
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
  };
}

/**
 * Send OTP to phone number
 */
export function useSendOtp() {
  return useMutation({
    mutationFn: async (phoneNumber: string) => {
      // Format to +60 format
      const formattedPhone = formatMalaysianPhone(phoneNumber);
      
      const { data } = await apiClient.post<ApiResponse<SendOtpResponse>>(
        '/auth/claimant/send-otp',
        { phoneNumber: formattedPhone }
      );
      return { ...data.data, phoneNumber: formattedPhone };
    },
  });
}

/**
 * Verify OTP and authenticate
 */
export function useVerifyOtp() {
  const { setAuth } = useAuthStore();
  const navigate = useNavigate();

  return useMutation({
    mutationFn: async ({ phoneNumber, code }: { phoneNumber: string; code: string }) => {
      const { data } = await apiClient.post<ApiResponse<VerifyOtpResponse>>(
        '/auth/claimant/verify-otp',
        { phoneNumber, code }
      );
      return data.data;
    },
    onSuccess: (data) => {
      setAuth(
        data.user,
        data.tokens.accessToken
      );
      navigate('/dashboard');
    },
  });
}
