import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertCompleteTestInventory, discoverTestFiles, TEST_INVENTORY } from './testInventory.js';
import { runTestFile } from './test_runner.js';

const testsDir = path.dirname(fileURLToPath(import.meta.url));
const inventory = await assertCompleteTestInventory(testsDir);
assert.deepEqual(inventory.unclassifiedTestFiles, []);
assert.deepEqual(inventory.staleInventoryEntries, []);
// Default directory must resolve on every platform (Windows file URLs carry a drive letter).
assert.deepEqual(await discoverTestFiles(), inventory.discovered);
assert.ok(TEST_INVENTORY.every(entry => entry.classification && Array.isArray(entry.prerequisites)));
assert.ok(TEST_INVENTORY.find(entry => entry.file === 'test_p8_sandbox_limits.js').prerequisites.includes('docker-daemon'));
console.log(`Runner inventory complete: ${inventory.discovered.length} test files classified.`);

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'xfactor-runner-p9-'));
try {
    const testDbPath = path.join(tempDir, 'p9-runner-test.db');
    const result = await runTestFile('test_agent_contract_schemas.js', {
        NODE_ENV: 'test',
        DB_PATH: testDbPath,
    });
    assert.equal(result.passed, true, `Expected child test suite to pass with preload, got exitCode=${result.exitCode}, error=${result.error}`);
    assert.equal(result.exitCode, 0);
} finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
}
