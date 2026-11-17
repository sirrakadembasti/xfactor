import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runTestFile, formatFailedSuites } from './test_runner.js';

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'xfactor-runner-reasons-'));
try {
    await fs.writeFile(path.join(tempDir, 'hang.js'), 'setInterval(() => {}, 1000);\n');
    await fs.writeFile(path.join(tempDir, 'fail.js'), 'process.exit(1);\n');
    await fs.writeFile(path.join(tempDir, 'ok.js'), 'process.exit(0);\n');
    const env = { NODE_ENV: 'test', DB_PATH: path.join(tempDir, 'reasons.db') };

    const hung = await runTestFile('hang.js', env, 1500, tempDir);
    assert.equal(hung.passed, false);
    assert.equal(hung.reason, 'timeout');

    const failed = await runTestFile('fail.js', env, 20000, tempDir);
    assert.equal(failed.passed, false);
    assert.equal(failed.reason, 'exit');
    assert.equal(failed.exitCode, 1);

    const ok = await runTestFile('ok.js', env, 20000, tempDir);
    assert.equal(ok.passed, true);
    assert.equal(ok.reason, undefined);

    const summary = formatFailedSuites([
        { file: 'test_x.js', passed: false, reason: 'timeout' },
        { file: 'test_y.js', passed: false, reason: 'exit', exitCode: 1 },
        { file: 'test_z.js', passed: false, reason: 'startup', error: 'STARTUP_ERROR: boom' }
    ], 120000);
    assert.equal(summary.line, 'Failed suites: test_x.js (timeout 120s), test_y.js (exit 1), test_z.js (startup)');
    assert.match(summary.warning, /Zaman aşımı yük kaynaklı olabilir; bu süitleri tek başına yeniden koşun\./);

    const noTimeout = formatFailedSuites([{ file: 'test_y.js', passed: false, reason: 'exit', exitCode: 2 }], 120000);
    assert.equal(noTimeout.warning, null);
} finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
}
console.log('Test runner failure reasons: timeout, exit and startup are distinguished.');
