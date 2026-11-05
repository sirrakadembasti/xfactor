import assert from 'assert';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import crypto from 'node:crypto';
import { createTestHarness } from './testHarness.js';
import { verifyDependencies, scanProjectImports, extractImportsFromCode } from '../verification/packageVerifier.js';
import { evaluateVerificationRun, ACTIVE_POLICY_VERSION } from '../verification/qualityPolicy.js';

const { runAsyncTest, finish } = createTestHarness();

const tempDirs = [];
async function createTempWorkspace(prefix = 'xfactor-pkg-test-') {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
    tempDirs.push(dir);
    return dir;
}

try {
    await runAsyncTest('1. AST scanner should discover ESM, CJS, and dynamic imports in JS/TS files', async () => {
        const workspace = await createTempWorkspace();
        const srcDir = path.join(workspace, 'src');
        await fs.mkdir(srcDir, { recursive: true });

        await fs.writeFile(path.join(srcDir, 'App.jsx'), `
            import React from 'react';
            import { useState } from 'react';
            import axios from 'axios';
            import './App.css';
            import localHelper from './helpers/util.js';
            // import commentedOut from 'commented-package';
            /* import multilineComment from 'multiline-comment-pkg'; */
        `);

        await fs.writeFile(path.join(srcDir, 'server.js'), `
            const express = require('express');
            const cors = require('cors');
            const { helper } = require('./local.js');
            async function loadPlugin() {
                const lodash = await import('lodash');
            }
        `);

        const imports = await scanProjectImports(workspace);
        const importedPackages = Array.from(imports).sort();

        assert.ok(importedPackages.includes('react'));
        assert.ok(importedPackages.includes('axios'));
        assert.ok(importedPackages.includes('express'));
        assert.ok(importedPackages.includes('cors'));
        assert.ok(importedPackages.includes('lodash'));
        assert.ok(!importedPackages.includes('commented-package'), 'Commented imports must not be extracted');
        assert.ok(!importedPackages.includes('multiline-comment-pkg'), 'Multiline commented imports must not be extracted');
        assert.ok(!importedPackages.includes('./App.css'));
        assert.ok(!importedPackages.includes('./helpers/util.js'));
    });

    await runAsyncTest('2. verifyDependencies should fail-closed when package.json or lockfile is missing', async () => {
        const workspace = await createTempWorkspace();
        const result = await verifyDependencies(workspace, { requirements: [] });
        assert.strictEqual(result.passed, false);
        assert.ok(result.checks.some(c => c.name === 'package_json' && c.status === 'failed'));
    });

    await runAsyncTest('3. verifyDependencies should support optionalDependencies and report undeclared imports', async () => {
        const workspace = await createTempWorkspace();
        const srcDir = path.join(workspace, 'src');
        await fs.mkdir(srcDir, { recursive: true });

        await fs.writeFile(path.join(srcDir, 'index.js'), `
            import express from 'express';
            import optionalPkg from 'optional-package';
            import unlistedPkg from 'unlisted-package';
        `);

        await fs.writeFile(path.join(workspace, 'package.json'), JSON.stringify({
            name: 'test-project',
            dependencies: {
                express: '^4.18.0'
            },
            optionalDependencies: {
                'optional-package': '^1.0.0'
            }
        }));

        await fs.writeFile(path.join(workspace, 'package-lock.json'), JSON.stringify({
            name: 'test-project',
            lockfileVersion: 3,
            packages: {}
        }));

        const mockSandboxAdapter = {
            id: 'mock-sandbox',
            isAvailable() { return true; },
            async execute() {
                return { status: 'PASS', passed: true, exitCode: 0, stdout: 'mock install pass', stderr: '' };
            }
        };

        const result = await verifyDependencies(workspace, { requirements: [] }, { adapter: mockSandboxAdapter });
        assert.strictEqual(result.passed, false);
        const astCheck = result.checks.find(c => c.name === 'ast_import_inventory');
        assert.strictEqual(astCheck.status, 'failed');
        assert.ok(astCheck.undeclared.includes('unlisted-package'));
        assert.ok(!astCheck.undeclared.includes('optional-package'), 'optionalDependencies must be treated as declared');
    });

    await runAsyncTest('4. successful dependency observations retain mandatory machine evidence', async () => {
        const workspace = await createTempWorkspace();
        const result = await verifyDependencies(workspace, {}, {
            files: [
                { path: 'package.json', content: '{"name":"evidence-fixture"}' },
                { path: 'package-lock.json', content: '{"lockfileVersion":3,"packages":{}}' },
                { path: 'src/index.js', content: 'export const ready = true;' }
            ],
            adapter: { id: 'test-observed-install', isAvailable: () => true,
                execute: async request => { assert.equal(request.timeoutMs,900000); return { passed: true, exitCode: 0, stdout: 'observed fixture install', stderr: '' }; } }
        });
        assert.equal(result.passed, true);
        for (const check of result.checks) {
            assert.ok(Number.isFinite(Date.parse(check.startedAt)), `${check.name}: missing observation start`);
            assert.ok(Number.isFinite(Date.parse(check.endedAt)), `${check.name}: missing observation end`);
            assert.ok(Date.parse(check.endedAt) >= Date.parse(check.startedAt));
            assert.match(check.stdoutDigest, /^[a-f0-9]{64}$/);
            assert.match(check.stderrDigest, /^[a-f0-9]{64}$/);
            assert.equal(check.policyVersion, ACTIVE_POLICY_VERSION);
        }
        const requiredGates = result.checks.map(check => check.name);
        assert.equal(evaluateVerificationRun({ checks: result.checks, requiredGates }).status, 'PASS');
        const missingEvidence = result.checks.map(({ startedAt, endedAt, ...check }) => check);
        assert.equal(evaluateVerificationRun({ checks: missingEvidence, requiredGates }).status, 'BLOCKED');
    });
    await runAsyncTest('5. clean install preserves adapter digests covering the entire retained stream', async () => {
        const workspace = await createTempWorkspace();
        const fullDigest = crypto.createHash('sha256').update('full output beyond retained excerpt').digest('hex');
        const result = await verifyDependencies(workspace, {}, {
            files: [{ path: 'package.json', content: '{}' }, { path: 'package-lock.json', content: '{}' }],
            adapter: { id: 'test-full-stream', isAvailable: () => true,
                execute: async () => ({ passed: true, exitCode: 0, stdout: 'excerpt', stderr: '', stdoutDigest: fullDigest }) }
        });
        assert.equal(result.checks.find(check => check.name === 'clean_install').stdoutDigest, fullDigest);
    });
    await runAsyncTest('6. missing worker package inventory never substitutes a host package', async () => {
        const workspace = await createTempWorkspace();
        await fs.writeFile(path.join(workspace, 'package.json'), '{}');
        const result = await verifyDependencies(workspace, {}, { files: [] });
        assert.equal(result.passed, false);
        assert.match(result.checks[0].reason, /absent from worker inventory/);
    });
    await runAsyncTest('install timeout retains full-stream provenance alongside bounded excerpts', async () => {
        const workspace = await createTempWorkspace();
        const fullDigest = 'a'.repeat(64);
        const result = await verifyDependencies(workspace, {}, {
            files: [{ path: 'package.json', content: '{"name":"fixture"}' }, { path: 'package-lock.json', content: '{"lockfileVersion":3,"packages":{}}' }],
            adapter: { id: 'mock-sandbox', isAvailable: () => true, execute: async () => {
                throw Object.assign(new Error('Command timed out'), { result: { stdout: 'prefix', stderr: '', stdoutBytes: 2000000,
                    stderrBytes: 0, stdoutTruncated: true, stderrTruncated: false, stdoutSha256: fullDigest, timedOut: true, exitCode: null } });
            } }
        });
        const check = result.checks.find(c => c.name === 'clean_install');
        assert.equal(check.status, 'failed'); assert.equal(check.exitCode, null);
        assert.equal(check.stdoutDigest, fullDigest); assert.equal(check.stdoutBytes, 2000000);
        assert.equal(check.stdoutTruncated, true); assert.equal(check.timedOut, true);
    });
    finish();
} finally {
    for (const dir of tempDirs) {
        try {
            await fs.rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
        } catch {}
    }
}
