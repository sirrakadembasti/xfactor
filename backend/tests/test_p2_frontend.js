import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createTestHarness } from './testHarness.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FRONTEND_SRC = path.resolve(__dirname, '../../frontend/src');

const { runAsyncTest, finish } = createTestHarness();

// =========================================================================
// P2.1: Request Identity & Stale State
// =========================================================================
await runAsyncTest('P2.1 api.js createApiClient supports signal and abort controller', async () => {
    const apiCode = fs.readFileSync(path.join(FRONTEND_SRC, 'services/api.js'), 'utf8');
    assert.match(apiCode, /const\s*\{\s*signal,[\s\S]*?\.\.\.fetchOpts\s*\}\s*=\s*options/, 'signal must be extracted from options');
    assert.match(apiCode, /buildSessionRequestOptions\(\s*\{\s*\.\.\.fetchOpts,\s*headers,\s*signal:\s*requestSignal\s*\}\s*\)/, 'signal must be passed to request options');
});

await runAsyncTest('P2.1 App.jsx resets project state and aborts prior project in-flight requests immediately on switch', async () => {
    const appCode = fs.readFileSync(path.join(FRONTEND_SRC, 'App.jsx'), 'utf8');
    assert.match(appCode, /projectAbortRef\.current\.abort\(\)/, 'Must abort pending requests on switch');
    assert.match(appCode, /const\s+controller\s*=\s*new\s+AbortController\(\)/, 'Must create AbortController for new active project');
    assert.match(appCode, /setProjectState\(null\)/, 'Must clear project state when activeProjectId is cleared or switched');
    assert.match(appCode, /data\.projectId\s*!==\s*activeProjectRef\.current/, 'Must filter incoming WebSocket messages by exact activeProjectId');
});

// =========================================================================
// P2.2 & P2.4: Accessibility & Request Timeout
// =========================================================================
await runAsyncTest('P2.2 api.js createApiClient supports timeoutMs and throws on deadline expiration', async () => {
    const apiCode = fs.readFileSync(path.join(FRONTEND_SRC, 'services/api.js'), 'utf8');
    assert.match(apiCode, /timeoutMs\s*=\s*defaultTimeoutMs/, 'Must accept timeoutMs parameter');
    assert.match(apiCode, /İstek zaman aşımına uğradı \(Timeout\)/, 'Must handle timeout failure');
});

await runAsyncTest('P2.4 Frontend HTML and LoginView provide accessibility and semantic markup', async () => {
    const htmlCode = fs.readFileSync(path.resolve(FRONTEND_SRC, '../index.html'), 'utf8');
    assert.match(htmlCode, /<html lang="tr">/, 'Root HTML must specify lang="tr"');

    const loginCode = fs.readFileSync(path.join(FRONTEND_SRC, 'components/LoginView.jsx'), 'utf8');
    assert.match(loginCode, /htmlFor="login-username"/, 'Must have accessible label for username');
    assert.match(loginCode, /autoComplete="username"/, 'Must have autocomplete username');
    assert.match(loginCode, /htmlFor="login-password"/, 'Must have accessible label for password');
    assert.match(loginCode, /autoComplete="current-password"/, 'Must have autocomplete password');
    assert.match(loginCode, /role="alert"/, 'Error banner must use role="alert"');
});

await runAsyncTest('P2.3 App.jsx loads JSZip dynamically on demand to optimize bundle size', async () => {
    const appCode = fs.readFileSync(path.join(FRONTEND_SRC, 'App.jsx'), 'utf8');
    assert.doesNotMatch(appCode, /^import\s+JSZip\s+from\s+'jszip';/m, 'Static JSZip import must be removed');
    assert.match(appCode, /import\('jszip'\)/, 'Must import jszip dynamically');
});


await runAsyncTest('P2.3 App.jsx throttles and batches rapid WebSocket log updates', async () => {
    const appCode = fs.readFileSync(path.join(FRONTEND_SRC, 'App.jsx'), 'utf8');
    assert.match(appCode, /pendingLogBatch/, 'Must use batch queue for incoming log events');
    assert.match(appCode, /flushPendingLogs/, 'Must flush batched logs on interval/frame');
});
await runAsyncTest('P2.4 IDEView uses semantic accessible button elements for file selection', async () => {
    const ideCode = fs.readFileSync(path.join(FRONTEND_SRC, 'components/IDEView.jsx'), 'utf8');
    assert.match(ideCode, /<button[\s\S]*?onClick=\{\(\)\s*=>\s*setActiveFile\(f\)\}/, 'Must use button tag for file selection');
});

await finish();
