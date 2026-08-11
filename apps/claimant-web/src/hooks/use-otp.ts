import { useMutation } from '@tanstack/react-query';
import { apiClient, ApiResponse } from '@/lib/api-client';
import { useAuthStore, ClaimantUser } from '@/stores/auth-store';
import { useNavigate } from 'react-router-dom';
import { formatMalaysianPhone } from '@/lib/utils';

// Types
export interface SendOtpResponse {
  message: string;
  expiresIn: number;
  /**
   * The code itself, returned only while no SMS provider is configured and
   * only outside production — the server throws rather than sending this in
   * production. Present so a claimant can log in at all before SMS exists;
   * the app fills it in rather than asking someone to read a server log.
   */
  code?: string;
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
    mutationFn: async ({ 
      phoneNumber, 
      code, 
      redirectUrl 
    }: { 
      phoneNumber: string; 
      code: string;
      redirectUrl?: string;
    }) => {
      const { data } = await apiClient.post<ApiResponse<VerifyOtpResponse>>(
        '/auth/claimant/verify-otp',
        { phoneNumber, code }
      );
      return { ...data.data, redirectUrl };
    },
    onSuccess: (data) => {
      setAuth(
        data.user,
        data.tokens.accessToken
      );
      // Redirect to the original target if available, otherwise go to tracker
      navigate(data.redirectUrl || '/tracker');
    },
  });
}
