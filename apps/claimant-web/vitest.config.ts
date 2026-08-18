import { defineConfig, mergeConfig } from 'vitest/config';

import viteConfig from './vite.config';

/**
 * Unit tests for the claimant PWA.
 *
 * Merged onto the app's own Vite config rather than restated, so the `@` and
 * `@tci/*` aliases stay defined in exactly one place. A second copy would drift
 * the day a package moves, and the failure would be an import error in tests
 * only — which reads as "the tests are broken" rather than "the alias moved".
 *
 * This app had no tests at all until the Telegram Mini App landed. That was
 * defensible while the page did nothing but render what the server said; it
 * stopped being defensible once a *destructive* control here could drop a
 * claimant out of the claim they were building — see `chat.test.tsx`.
 */
export default defineConfig(configEnv =>
  mergeConfig(
    viteConfig(configEnv),
    defineConfig({
      test: {
        environment: 'jsdom',
        // No `globals`. Every test imports `describe`/`it`/`expect` explicitly,
        // which costs one line and means the tsconfig needs no matching
        // `types` entry — two files that would otherwise have to agree, and
        // whose disagreement shows up as a type error in tests only.
        setupFiles: ['./src/test/setup.ts'],
        // The build output and the dev server have nothing to say here.
        include: ['src/**/*.{test,spec}.{ts,tsx}'],
      },
    })
  )
);
