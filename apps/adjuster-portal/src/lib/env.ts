/**
 * Environment configuration for the Adjuster Portal
 *
 * All environment variables should be accessed through this module
 * to ensure type safety and provide sensible defaults.
 */

export const env = {
  // API
  apiUrl: import.meta.env.VITE_API_URL || '/api/v1',

  // Application
  appName: import.meta.env.VITE_APP_NAME || 'True Claim Insight',
  appVersion: import.meta.env.VITE_APP_VERSION || '0.1.0',

  // Feature Flags
  enableDevtools: import.meta.env.VITE_ENABLE_DEVTOOLS === 'true',
  enableMockData: import.meta.env.VITE_ENABLE_MOCK_DATA === 'true',

  // Video Service
  trtcSdkAppId: import.meta.env.VITE_TRTC_SDK_APP_ID || '',

  // Analytics
  analyticsId: import.meta.env.VITE_ANALYTICS_ID || '',

  // Runtime checks
  isDevelopment: import.meta.env.DEV,
  isProduction: import.meta.env.PROD,
} as const;

// Type for environment variables
export type Env = typeof env;
