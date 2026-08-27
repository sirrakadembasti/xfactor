/**
 * Sub-project 3.1: Generation Isolation, Quotas & Protected Metadata Guard
 * Test Suite
 */

import assert from 'assert';
import path from 'path';
import fs from 'fs/promises';
import {
    writeGeneratedFiles,
    validateGenerationQuotas,
    isProtectedOrchestrationPath,
    normalizeGeneratedIdentifier,
    GENERATION_LIMITS
} from '../engine/codeGenerator.js';
import { createProject, deleteProject, getProjectDir } from '../projectRepository.js';

let testProjectId = null;
let projectDir = null;

async function setup() {
    const project = await createProject({
        title: 'Gen Isolation Test Project',
        description: 'Testing generation limits and metadata protection'
    });
    testProjectId = project.id;
    projectDir = getProjectDir(project.id);
}

async function teardown() {
    if (testProjectId) {
        try {
            await deleteProject(testProjectId);
        } catch {}
    }
}

async function runTests() {
    console.log('==================================================');
    console.log('⚡ Sub-project 3.1: Generation Isolation & Quotas');
    console.log('==================================================');

    let passed = 0;
    let failed = 0;

    await setup();

    try {
        // Test 1: Quota validation on file count, single size, and total bytes
        try {
            // 1a: Exceeding file count limit
            const manyFiles = Array.from({ length: GENERATION_LIMITS.MAX_FILES + 1 }, (_, i) => ({
                path: `src/file_${i}.js`,
                content: 'console.log("ok");'
            }));
            const countCheck = validateGenerationQuotas(manyFiles);
            assert.strictEqual(countCheck.valid, false, 'Should reject exceeding file count');
            assert(countCheck.error.includes('dosya sayısı limiti'), 'Should specify file count error');

            // 1b: Exceeding single file size
            const bigFile = [{
                path: 'src/big.js',
                content: 'x'.repeat(GENERATION_LIMITS.MAX_FILE_SIZE_BYTES + 10)
            }];
            const sizeCheck = validateGenerationQuotas(bigFile);
            assert.strictEqual(sizeCheck.valid, false, 'Should reject single oversized file');
            assert(sizeCheck.error.includes('dosya boyutu limiti'), 'Should specify file size error');

            // 1c: Exceeding tree depth
            const deepPath = 'a/b/c/d/e/f/g/h/i/deep.js'; // 10 levels deep
            const deepFile = [{
                path: deepPath,
                content: 'export const deep = true;'
            }];
            const depthCheck = validateGenerationQuotas(deepFile);
            assert.strictEqual(depthCheck.valid, false, 'Should reject excessive directory depth');
            assert(depthCheck.error.includes('derinlik limiti'), 'Should specify depth limit error');

            console.log('  [PASS] 1. Generation quota limits (count, file size, depth)');
            passed++;
        } catch (err) {
            console.log('  [FAIL] 1. Generation quota limits:', err.message);
            failed++;
        }

        // Test 2: Protected orchestration metadata and protocol files
        try {
            const protectedPaths = [
                'manager/TALIMATNAME.md',
                'manager/DURUM.md',
                'directors/frontend/ALT-TALIMATNAME.md',
                'teamleaders/ui/TODO.md',
                'teamleaders/ui/GOREV.md',
                'teamleaders/ui/RAPOR.md',
                '.git/config',
                'node_modules/package.json',
                'TALIMATNAME.md',
                'DURUM.md'
            ];

            for (const p of protectedPaths) {
                assert.strictEqual(
                    isProtectedOrchestrationPath(p),
                    true,
                    `Path "${p}" should be recognized as protected orchestration path`
                );
            }

            const allowedPaths = [
                'src/App.jsx',
                'src/components/Header.jsx',
                'package.json',
                'prisma/schema.prisma',
                'public/favicon.ico',
                '.gitignore',
                '.env.example'
            ];

            for (const p of allowedPaths) {
                assert.strictEqual(
                    isProtectedOrchestrationPath(p),
                    false,
                    `Path "${p}" should be allowed for user code generation`
                );
            }

            console.log('  [PASS] 2. Protected orchestration paths and protocol files identification');
            passed++;
        } catch (err) {
            console.log('  [FAIL] 2. Protected orchestration paths:', err.message);
            failed++;
        }

        // Test 3: writeGeneratedFiles enforces quota checks and refuses protected paths
        try {
            const mixedFiles = [
                { path: 'src/valid.js', content: 'export const a = 1;' },
                { path: 'manager/TALIMATNAME.md', content: 'HACKED TALIMATNAME' },
                { path: 'teamleaders/core/TODO.md', content: 'HACKED TODO' },
                { path: 'src/components/Button.jsx', content: 'export const Button = () => null;' }
            ];

            const result = await writeGeneratedFiles(projectDir, null, mixedFiles);
            
            // Should write valid files and skip protected ones
            assert.strictEqual(result.length, 2, 'Should only write the 2 valid source files');
            const paths = result.map(f => f.path);
            assert(paths.includes('src/valid.js'));
            assert(paths.includes('src/components/Button.jsx'));
            assert(!paths.includes('manager/TALIMATNAME.md'));
            assert(!paths.includes('teamleaders/core/TODO.md'));

            // Verify file system
            const validExists = await fs.stat(path.join(projectDir, 'src/valid.js')).then(() => true).catch(() => false);
            assert.strictEqual(validExists, true, 'Valid file should exist on disk');

            const hackedManagerExists = await fs.stat(path.join(projectDir, 'manager/TALIMATNAME.md')).then(() => true).catch(() => false);
            assert.strictEqual(hackedManagerExists, false, 'Protected manager file should not be created');

            console.log('  [PASS] 3. writeGeneratedFiles filters protected paths and writes valid files');
            passed++;
        } catch (err) {
            console.log('  [FAIL] 3. writeGeneratedFiles path filtering:', err.message);
            failed++;
        }

        // Test 4: Generated identifier normalization for domains, tasks, and agents
        try {
            // Normal valid identifiers
            assert.strictEqual(normalizeGeneratedIdentifier('frontend'), 'frontend');
            assert.strictEqual(normalizeGeneratedIdentifier('auth-service_1'), 'auth-service_1');
            assert.strictEqual(normalizeGeneratedIdentifier('TASK-001'), 'TASK-001');

            // Identifiers with whitespace, casing, or invalid characters
            assert.strictEqual(normalizeGeneratedIdentifier('  Frontend Domain  '), 'Frontend_Domain');
            assert.strictEqual(normalizeGeneratedIdentifier('api/routes/v1'), 'api_routes_v1');
            assert.strictEqual(normalizeGeneratedIdentifier('../../malicious/path'), 'malicious_path');
            assert.strictEqual(normalizeGeneratedIdentifier('domain#with$special*chars!'), 'domain_with_special_chars');
            assert.strictEqual(normalizeGeneratedIdentifier('___'), 'unnamed');
            assert.strictEqual(normalizeGeneratedIdentifier(''), 'unnamed');
            assert.strictEqual(normalizeGeneratedIdentifier(null), 'unnamed');

            console.log('  [PASS] 4. Identifier normalization for domains and tasks');
            passed++;
        } catch (err) {
            console.log('  [FAIL] 4. Identifier normalization:', err.message);
            failed++;
        }

    } finally {
        await teardown();
    }

        // Test 5: writeGeneratedFiles proje root dışındaki coderDir'i reddetmeli (fail-closed, partial write yok)
        try {
            // Proje root'u DIŞINDA, zaten var olan bir coderDir oluştur
            const outsideDir = path.join(path.dirname(projectDir), `outside_coder_${process.pid}_${Date.now()}`);
            await fs.mkdir(outsideDir, { recursive: true });
            try {
                const files = [
                    { path: 'src/App.jsx', content: 'export default function App() {}' },
                    { path: 'src/main.js', content: 'console.log("hi");' }
                ];
                let threw = false;
                try {
                    await writeGeneratedFiles(projectDir, outsideDir, files);
                } catch (e) {
                    threw = true;
                }
                assert.strictEqual(threw, true, 'writeGeneratedFiles must reject a coderDir outside the project root');

                // Proje root içine hiçbir kopya yazılmamalı
                const projectApp = await fs.stat(path.join(projectDir, 'src/App.jsx')).then(() => true).catch(() => false);
                assert.strictEqual(projectApp, false, 'No file should be written into the project root when coderDir is outside');

                // Dışarıdaki coderDir'e hiçbir kopya yazılmamalı
                const outsideApp = await fs.stat(path.join(outsideDir, 'src__App.jsx')).then(() => true).catch(() => false);
                assert.strictEqual(outsideApp, false, 'No file should be written into the outside coderDir');
            } finally {
                await fs.rm(outsideDir, { recursive: true, force: true });
            }
            console.log('  [PASS] 5. writeGeneratedFiles rejects coderDir outside project root (fail-closed, no partial write)');
            passed++;
        } catch (err) {
            console.log('  [FAIL] 5. coderDir containment:', err.message);
            failed++;
        }

    console.log('==================================================');
    console.log(`📊 Sonuç: ${passed} Başarılı, ${failed} Hatalı`);
    console.log('==================================================');

    if (failed > 0) {
        process.exit(1);
    }
}

runTests();
