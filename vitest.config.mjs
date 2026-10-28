import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Never let a test touch the real ~/.second-brain or a real vault.
    setupFiles: ['./test/setup.mjs'],
  },
});
