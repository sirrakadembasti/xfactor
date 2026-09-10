import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertCompleteTestInventory, TEST_INVENTORY } from './testInventory.js';

const testsDir = path.dirname(fileURLToPath(import.meta.url));
const inventory = await assertCompleteTestInventory(testsDir);
assert.deepEqual(inventory.unclassifiedTestFiles, []);
assert.deepEqual(inventory.staleInventoryEntries, []);
assert.ok(TEST_INVENTORY.every(entry => entry.classification && Array.isArray(entry.prerequisites)));
assert.ok(TEST_INVENTORY.find(entry => entry.file === 'test_p8_sandbox_limits.js').prerequisites.includes('docker-daemon'));
console.log(`Runner inventory complete: ${inventory.discovered.length} test files classified.`);
