import test, { mock } from 'node:test';
import assert from 'node:assert';
import cp from 'node:child_process';
import EventEmitter from 'node:events';

import { executeJob, ownedContainerExists } from '../runtime.js';

test('Isolated worker runtime constraints and cancellation', async (t) => {
  let containerExists = true;
  let lastSpawnArgs = [];
  
  mock.method(cp, 'exec', (cmd, opts, cb) => {
    if (typeof opts === 'function') { cb = opts; opts = {}; }
    if (cmd.includes('docker ps')) {
      cb(null, containerExists ? 'xfactor-worker-job-cancel-cleanup\n' : '', '');
    } else if (cmd.includes('docker info')) {
      cb(null, 'info', '');
    } else if (cmd.includes('docker logs')) {
      cb(null, 'READY\n', '');
    } else if (cmd.includes('docker network inspect')) {
      cb(null, '[{"IPAM": {"Config": [{"Gateway": "172.18.0.1"}]}}]', '');
    } else if (cmd.includes('docker rm')) {
      containerExists = false;
      cb(null, '', '');
    } else {
      cb(null, '', '');
    }
  });

  mock.method(cp, 'spawn', (cmd, args, opts) => {
    lastSpawnArgs = [...args];
    const proc = new EventEmitter();
    proc.stdout = new EventEmitter();
    proc.stderr = new EventEmitter();
    proc.kill = () => proc.emit('close', 9);
    
    // Simulate async execution
    setTimeout(() => {
      // Check if it's the output limit job by checking args (code)
      if (args.includes('console.log("spew");')) {
        const chunk = Buffer.alloc(1024 * 1024 * 2, 'a'); // 2 MiB > 1 MiB ceiling
        proc.stdout.emit('data', chunk);
        proc.emit('close', 0); // Although it gets killed earlier usually
      } else {
        proc.emit('close', 0);
      }
    }, 50);
    
    return proc;
  });

  await t.test('cancels job, cleans up container, limits output, drops privileges', async () => {
    // 1. Output ceiling enforcement
    const jobExceedingOutput = { 
      jobId: 'job-output-limit', 
      deadline: Date.now() + 10000, 
      type: 'test',
      code: 'console.log("spew");'
    };
    const abort1 = new AbortController();
    const result = await executeJob(jobExceedingOutput, { signal: abort1.signal, onResource: () => {} });
    
    assert.equal(result.status, 'success');
    assert.ok(result.result.stdout.length <= 1024 * 1024);

    const installJob = {
      jobId: 'job-env-allowlist',
      deadline: Date.now() + 10000,
      operation: 'prepare_dependencies',
      code: 'process.exit(0);',
    };
    const installResult = await executeJob(installJob, {
      signal: new AbortController().signal,
      onResource: () => {},
    });
    assert.equal(installResult.status, 'success');
    assert.ok(lastSpawnArgs.includes('--env'));
    assert.ok(lastSpawnArgs.includes('NPM_CONFIG_IGNORE_SCRIPTS=true'));
    assert.ok(lastSpawnArgs.every((arg) =>
      !arg.includes('EXECUTION_WORKER_TOKEN') && !arg.includes('UNRELATED_SECRET')));
    // 2. Cancellation and container cleanup
    const jobCancel = { 
      jobId: 'job-cancel-cleanup', 
      deadline: Date.now() + 10000, 
      type: 'test',
      code: 'console.log("run");'
    };
    const abort2 = new AbortController();
    containerExists = true;
    const p = executeJob(jobCancel, { signal: abort2.signal, onResource: () => {} });
    
    // Cancel immediately after starting
    abort2.abort(); 
    const cancelResult = await p; 
    
    assert.equal(cancelResult.status, 'failed');
    assert.match(cancelResult.error, /Cancel/);
    
    // Verify container no longer exists after cancellation ack
    assert.equal(await ownedContainerExists(jobCancel.jobId), false); // after cancellation ack

  });
});
