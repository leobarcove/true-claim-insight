import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// Local host ports come from the root .env allocation block — the single
// source of truth (see .env "SERVICE PORTS"). loadEnv with an empty prefix is
// what lets non-VITE_ variables through; the fallbacks are the historical
// defaults, kept so a fresh clone without a root .env still starts.
export default defineConfig(({ mode }) => {
  const rootEnv = loadEnv(mode, path.resolve(__dirname, '../..'), '');
  const devPort = Number(rootEnv.ADJUSTER_PORTAL_PORT || 4000);
  const gatewayPort = Number(rootEnv.API_GATEWAY_PORT || 3000);

  return {
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@tci/shared-types': path.resolve(__dirname, '../../packages/shared-types/src/index.ts'),
      '@tci/ui-components': path.resolve(__dirname, '../../packages/ui-components/src/index.ts'),
    },
  },
  server: {
    port: devPort,
    // Fail loudly rather than silently taking the next free port: a portal
    // that quietly moves is how a stale tunnel or CORS entry starts pointing
    // at the wrong app.
    strictPort: true,
    fs: {
      allow: ['..', '../../packages'],
    },
    proxy: {
      // Keeps API calls same-origin, matching the staging Caddy edge, so the
      // refreshToken cookie behaves here exactly as it does there.
      '/api': {
        target: `http://localhost:${gatewayPort}`,
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
  };
});
