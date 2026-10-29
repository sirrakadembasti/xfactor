import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import JSZip from 'jszip';
import { ensureProjectScaffold } from '../engine/codeGenerator.js';

const docker = (...args) => execFileSync('docker', args, {
    encoding: 'utf8', timeout: 180000, maxBuffer: 2 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe']
}).trim();
const healthServer = `const http = require('node:http');
http.createServer((request, response) => {
  response.writeHead(request.url === '/health' ? 200 : 404);
  response.end(request.url === '/health' ? 'ready' : 'missing');
}).listen(3000, '127.0.0.1');
`;

async function verifyZipDockerRun(kind) {
    const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'xfactor-docker-artifact-'));
    const id = randomUUID().replaceAll('-', '').slice(0, 12);
    const image = `xfactor-artifact-test-${id}`;
    const container = `xfactor-artifact-test-${id}`;
    try {
        const source = path.join(temp, 'source');
        const extracted = path.join(temp, 'extracted');
        await fs.mkdir(source);
        await fs.mkdir(extracted);
        await ensureProjectScaffold(source, { title: kind === 'next' ? 'Next fixture' : 'Express fixture' },
            { talimatname: kind === 'next' ? 'Next.js app router' : 'Express REST API' });
        const pkg = {
            name: `xfactor-${kind}-fixture`, version: '1.0.0', private: true,
            scripts: {
                ...(kind === 'next' ? { build: "node -e \"const fs=require('fs');fs.mkdirSync('.next',{recursive:true});fs.copyFileSync('server.js','.next/server.js')\"" } : {}),
                start: kind === 'next' ? 'node .next/server.js' : 'node server.js'
            }
        };
        const lock = { name: pkg.name, version: pkg.version, lockfileVersion: 3, requires: true,
            packages: { '': { name: pkg.name, version: pkg.version } } };
        const content = {
            'Dockerfile': await fs.readFile(path.join(source, 'Dockerfile')),
            '.dockerignore': await fs.readFile(path.join(source, '.dockerignore')),
            'package.json': Buffer.from(JSON.stringify(pkg)),
            'package-lock.json': Buffer.from(JSON.stringify(lock)),
            'server.js': Buffer.from(healthServer)
        };
        assert.ok(kind !== 'next' || !Object.hasOwn(content, 'public/index.html'),
            'the Next fixture intentionally has no public directory');
        const zip = new JSZip();
        for (const [name, bytes] of Object.entries(content)) zip.file(name, bytes);
        const archive = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
        const archiveHash = createHash('sha256').update(archive).digest('hex');
        await fs.writeFile(path.join(temp, 'artifact.zip'), archive);
        const roundTrip = await JSZip.loadAsync(await fs.readFile(path.join(temp, 'artifact.zip')));
        for (const name of Object.keys(content)) {
            const bytes = await roundTrip.file(name)?.async('nodebuffer');
            assert.deepEqual(bytes, content[name], `${name} differs from final ZIP`);
            await fs.writeFile(path.join(extracted, name), bytes);
        }
        docker('build', '--network=none', '-t', image, extracted);
        docker('run', '-d', '--name', container, '--network=none', '--read-only',
            '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges=true', image);
        let ready = false;
        for (let attempt = 0; attempt < 30; attempt++) {
            try {
                const response = docker('exec', container, 'node', '-e',
                    "fetch('http://127.0.0.1:3000/health').then(async r => { if (r.status !== 200 || await r.text() !== 'ready') process.exit(1) })");
                assert.equal(response, '');
                ready = true;
                break;
            } catch {
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        }
        assert.ok(ready, `${kind} container did not answer /health after ZIP Docker build`);
        console.log(`${kind}: ZIP sha256=${archiveHash}; Docker build and first HTTP response passed`);
    } finally {
        try { docker('rm', '-f', container); } catch {}
        try { docker('image', 'rm', '-f', image); } catch {}
        await fs.rm(temp, { recursive: true, force: true });
    }
}

let dockerAvailable = false;
try {
    docker('info');
    dockerAvailable = true;
} catch (err) {
    if (process.env.P8_REQUIRE_DOCKER_LIMITS === '1') throw err;
    console.log('Skipping Docker integration test (Docker daemon not running or unavailable):', err.message);
}

if (dockerAvailable) {
    await verifyZipDockerRun('express');
    await verifyZipDockerRun('next');
}
