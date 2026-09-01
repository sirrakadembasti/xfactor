const { mkdirSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { defineConfig } = require('@playwright/test');
const fixtureRoot = process.env.E2E_FIXTURE_ROOT || path.join(tmpdir(), `xfactor-p3-dashboard-e2e-${process.pid}-${Date.now()}`);
const dbPath = path.join(fixtureRoot, 'dashboard.sqlite');
const projectsRoot = path.join(fixtureRoot, 'projects');
mkdirSync(projectsRoot, { recursive: true });
process.env.E2E_FIXTURE_ROOT = fixtureRoot;
process.env.E2E_DB_PATH = dbPath;
process.env.E2E_PROJECTS_ROOT = projectsRoot;

module.exports = defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:5173',
    trace: 'retain-on-failure'
  },
  webServer: [
    {
      command: 'node backend/server.js',
      url: 'http://127.0.0.1:8000/healthz',
      reuseExistingServer: false,
      timeout: 30_000,
      env: {
        ...process.env,
        DB_PATH: dbPath,
        PROJECTS_ROOT: projectsRoot,
        HOST: '127.0.0.1',
        PORT: '8000'
      }
    },
    {
      command: 'npm --prefix frontend run dev -- --host 127.0.0.1 --port 5173',
      url: 'http://127.0.0.1:5173',
      reuseExistingServer: false,
      timeout: 30_000,
      env: process.env
    }
  ],
  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium' }
    }
  ]
});
