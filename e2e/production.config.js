const { defineConfig } = require('@playwright/test');

// Minimal config for the production-image smoke journey.
// The exercised application runs inside Docker behind a TLS sidecar, so this
// config must NOT start any local webServer (unlike the root config, which
// boots backend + Vite and requires installed workspace dependencies).
module.exports = defineConfig({
  testDir: '.',
  testMatch: /production-operability\.spec\.js/,
  timeout: 90_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  use: {
    trace: 'retain-on-failure'
  },
  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium' }
    }
  ]
});
