import os from 'node:os';
import path from 'node:path';
import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config.js';

export default mergeConfig(
  viteConfig,
  defineConfig({
    cacheDir: path.join(os.tmpdir(), 'xfactor-vitest-cache'),
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: ['./src/setupTests.js'],
      include: [
        'src/components/__tests__/**/*.test.{js,jsx}',
        'src/services/*.test.js',
        'src/utils/__tests__/**/*.test.js'
      ],
      restoreMocks: true
    }
  })
);
