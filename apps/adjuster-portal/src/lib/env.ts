/**
 * Environment configuration for the Adjuster Portal
 */

export const env = {
  apiUrl: import.meta.env.VITE_API_URL || '/api/v1',
  appName: import.meta.env.VITE_APP_NAME || 'True Claim Insight',
  appVersion: import.meta.env.VITE_APP_VERSION || '0.1.0',
  enableDevtools: import.meta.env.VITE_ENABLE_DEVTOOLS === 'true',
  enableMockData: import.meta.env.VITE_ENABLE_MOCK_DATA === 'true',
  trtcSdkAppId: import.meta.env.VITE_TRTC_SDK_APP_ID || '',
  analyticsId: import.meta.env.VITE_ANALYTICS_ID || '',
  isDevelopment: import.meta.env.DEV,
  isProduction: import.meta.env.PROD,
} as const;

export type Env = typeof env;
