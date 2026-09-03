import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { agentSession, agentUser } from '@/lib/agent-session';
import { useAuthStore } from '@/stores/auth-store';

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api/v1';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor - add auth token
apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = useAuthStore.getState().accessToken;
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor - handle errors and token refresh
apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & {
      _retry?: boolean;
    };

    // Handle 401 - try refresh token
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        const response = await axios.post(
          `${API_BASE_URL}/auth/refresh`,
          {},
          { withCredentials: true }
        );

        const { accessToken } = response.data.data;

        /*
          Kept by whichever session made the call.

          The assisted form does not use the auth store — it holds its token in
          its own key and attaches it per request — so `user` is null there and
          the branch below skipped, throwing the fresh token away. Every request
          then sent the dead one again: 401, refresh, discard, 401. An agent's
          access token expires in minutes, so a call lasting longer than that
          became a form that silently stopped saving, with the band still saying
          they were signed in.
        */
        if (agentSession.read()) {
          agentSession.write(accessToken);
        }

        const user = useAuthStore.getState().user;
        if (user) {
          useAuthStore.getState().setAuth(user, accessToken);
        }

        originalRequest.headers.Authorization = `Bearer ${accessToken}`;
        return apiClient(originalRequest);
      } catch (refreshError) {
        // Back to the door they came in by. Sending an agent to the claimant's
        // login page loses the claim and offers them a sign-in they cannot use.
        if (agentSession.read()) {
          agentSession.clear();
          agentUser.clear();
          window.location.href = '/agent';
          return Promise.reject(refreshError);
        }

        useAuthStore.getState().logout();
        window.location.href = '/login';
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);

// API response types
export interface ApiResponse<T> {
  success: boolean;
  data: T;
  meta?: {
    timestamp: string;
    requestId?: string;
  };
}

export interface ApiError {
  statusCode: number;
  message: string | string[];
  error: string;
}
