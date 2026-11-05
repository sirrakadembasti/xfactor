import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const integration = process.argv.includes('--local-integration') ? 'local' : process.argv.includes('--docker-integration') ? 'docker' : null;
const files = fs.readdirSync(path.join(root, 'execution/tests')).filter(name => name.endsWith('.test.js') && (!name.endsWith('.integration.test.js') || (integration === 'local' ? name === 'localRoundtrip.integration.test.js' : integration === 'docker' && name !== 'localRoundtrip.integration.test.js'))).sort();
// With process isolation the timeout bounds each whole test file; real-process suites need ~50s unloaded.
const testTimeout = integration ? '--test-timeout=600000' : '--test-timeout=180000';
const child = spawn(process.execPath, ['--test', '--test-concurrency=1', testTimeout, ...files.map(name => path.join(root, 'execution/tests', name))], { stdio: 'inherit', windowsHide: true, env: { ...process.env, ...(integration === 'local' ? { EXECUTION_WORKER_LOCAL_INTEGRATION: '1' } : integration === 'docker' ? { EXECUTION_WORKER_INTEGRATION: '1' } : {}) } });
child.once('error', error => { console.error(error.message); process.exitCode = 1; });
child.once('exit', code => { process.exitCode = code ?? 1; });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
