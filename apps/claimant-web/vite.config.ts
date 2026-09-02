import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';

// Local host ports come from the root .env allocation block — the single
// source of truth (see .env "SERVICE PORTS"). loadEnv with an empty prefix is
// what lets non-VITE_ variables through; the fallbacks are the historical
// defaults, kept so a fresh clone without a root .env still starts.
export default defineConfig(({ mode }) => {
  const rootEnv = loadEnv(mode, path.resolve(__dirname, '../..'), '');
  const devPort = Number(rootEnv.CLAIMANT_WEB_PORT || 4001);
  const gatewayPort = Number(rootEnv.API_GATEWAY_PORT || 3000);

  /**
   * Hosts the dev server will answer to besides localhost.
   *
   * Vite refuses an unrecognised `Host` header — a DNS-rebinding defence, and
   * the right default. The Telegram Mini App needs a public HTTPS origin, so
   * the tunnel hostname has to be named here or every request through it comes
   * back 403 with nothing in the browser to explain why.
   *
   * Derived from `CLAIMANT_WEB_URL` rather than hardcoded, so the tunnel
   * hostname lives in exactly one place: the same variable the bot builds its
   * "Open the form" button from. A mismatch would otherwise show up as a
   * button that opens a Vite error page.
   */
  const publicHost = (() => {
    try {
      return rootEnv.CLAIMANT_WEB_URL ? [new URL(rootEnv.CLAIMANT_WEB_URL).hostname] : [];
    } catch {
      return [];
    }
  })();

  return {
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'mask-icon.svg'],
      manifest: {
        name: 'True Claim Insight',
        short_name: 'TCI',
        description: 'Submit insurance claims and complete remote assessments',
        // Matches the <meta name="theme-color"> in index.html. They disagreed, so
        // the browser chrome changed colour once the manifest loaded.
        theme_color: '#0b754e',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          {
            src: '/icons/icon-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: '/icons/icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: '/icons/icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
              },
            },
          },
        ],
      },
    }),
  ],
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
    allowedHosts: publicHost,
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
