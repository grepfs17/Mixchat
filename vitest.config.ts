import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Astro defaults its Vite envPrefix to "PUBLIC_" (not Vite's "VITE_"), so
  // import.meta.env.PUBLIC_* vars from .env must be exposed the same way here.
  envPrefix: 'PUBLIC_',
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: 'test/setup.ts',
    include: ['test/**/*.test.{ts,tsx}'],
  },
});
