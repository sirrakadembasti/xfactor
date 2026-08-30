import assert from 'assert';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { createTestHarness } from './testHarness.js';
import { verifyDependencies, scanProjectImports, extractImportsFromCode } from '../verification/packageVerifier.js';

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

    finish();
} finally {
    for (const dir of tempDirs) {
        try {
            await fs.rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
        } catch {}
    }
}
