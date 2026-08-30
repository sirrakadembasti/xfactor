import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createTestHarness } from './testHarness.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FRONTEND_SRC = path.resolve(__dirname, '../../frontend/src');

const { runAsyncTest, finish } = createTestHarness();

await runAsyncTest('1. Header.jsx displays verification badge and SHA-256 for verified latestArtifact', async () => {
    const headerCode = fs.readFileSync(path.join(FRONTEND_SRC, 'components/Header.jsx'), 'utf8');
    assert.match(
        headerCode,
        /latestArtifact\s*&&\s*latestArtifact\.sha256/,
        'Header must check latestArtifact.sha256'
    );
    assert.match(
        headerCode,
        /Artifact verified/,
        'Header must display Artifact verified label'
    );
});

await runAsyncTest('2. App.jsx does not import JSZip statically and routes download to verified artifact endpoint', async () => {
    const appCode = fs.readFileSync(path.join(FRONTEND_SRC, 'App.jsx'), 'utf8');
    assert.doesNotMatch(
        appCode,
        /import\s+JSZip\s+from\s+'jszip'/,
        'JSZip must not be imported statically'
    );
    assert.match(
        appCode,
        /\/contracts\/\$\{contractId\}\/artifacts\/\$\{latestArtifact\.id\}\/download/,
        'App.jsx handleDownloadProjectZip must call the server-side download endpoint with contractId and artifactId'
    );
});

finish();
