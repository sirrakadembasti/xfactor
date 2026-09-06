import cp from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { createProxy } from './registryProxy.js';

const execAsync = (cmd, opts) => new Promise((resolve, reject) => {
  cp.exec(cmd, opts, (err, stdout, stderr) => {
    if (err) { err.stdout = stdout; err.stderr = stderr; return reject(err); }
    resolve({ stdout, stderr });
  });
});

const OUTPUT_CEILING = 1024 * 1024 * 1; // 1 MiB retained
const IMAGE_NAME = 'xfactor-worker-runtime';

function sanitizeJobId(jobId) {
  return jobId.replace(/[^a-zA-Z0-9_-]/g, '');
}

export async function ownedContainerExists(jobId) {
  const containerName = `xfactor-worker-${sanitizeJobId(jobId)}`;
  try {
    const { stdout } = await execAsync(`docker ps -a --filter "name=^/${containerName}$" --format "{{.Names}}"`);
    return stdout.trim() === containerName;
  } catch (err) {
    throw new Error(`Failed to check container existence: ${err.message}`);
  }
}


export async function cleanupContainer(containerName) {
  try {
    await execAsync(`docker rm -f ${containerName}`);
  } catch (e) {
    // ignore
  }
}

async function waitForReadiness(containerName, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const { stdout, stderr } = await execAsync(`docker logs ${containerName}`);
      if (stdout.includes('READY') || stderr.includes('READY')) {
        return true;
      }
    } catch (e) {
      // ignore and retry
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('Container readiness probe timed out');
}

export async function executeJob(job, { signal, onResource }) {
  let proxyServer;
  const containerName = `xfactor-worker-${sanitizeJobId(job.jobId)}`;
  
  const jobStartTime = Date.now();
  const maxDeadline = Math.min(job.deadline || (jobStartTime + 900000), jobStartTime + 900000);
  
  if (Date.now() > maxDeadline) {
    return { status: 'failed', error: 'Job deadline exceeded before startup' };
  }
  
  await cleanupContainer(containerName);

  try {
    try {
      await execAsync('docker info');
    } catch {
      return { status: 'failed', error: 'Docker daemon unavailable' };
    }
    
    proxyServer = await createProxy();
    const proxyPort = proxyServer.address().port;
    
    // Both install and build networks use --internal to block host/LAN/internet egress.
    const networkName = `${containerName}-net`;
    try {
      await execAsync(`docker network rm ${networkName}`);
    } catch {}
    
    await execAsync(`docker network create --internal ${networkName}`);
    onResource?.({ type: 'network', name: networkName, internal: true });

    // Bind proxy directly to internal network gateway to allow only proxy traffic.
    const { stdout: netInspect } = await execAsync(`docker network inspect ${networkName}`);
    const gateway = JSON.parse(netInspect)[0].IPAM.Config[0].Gateway;
    
    const runArgs = [
      'run', '-d', '--rm',
      '--name', containerName,
      '--add-host', `host.docker.internal:${gateway}`,
      '--cpus', '2.0',
      '--memory', '1g',
      '--memory-swap', '1g',
      '--pids-limit', '100',
      '--read-only',
      '--cap-drop', 'ALL',
      '--security-opt', 'no-new-privileges=true',
      '--network', networkName,
      '--tmpfs', '/tmp:rw,size=64m,exec,mode=1777',
      '--tmpfs', '/workspace:rw,size=1g,exec,mode=1777',
      IMAGE_NAME,
      'serve'
    ];
    
    await execAsync(`docker ${runArgs.join(' ')}`);
    onResource?.({ type: 'container', name: containerName });

    if (Date.now() > maxDeadline) {
       throw new Error('Job deadline exceeded during startup');
    }

    await waitForReadiness(containerName);
    
    if (Date.now() > maxDeadline) {
       throw new Error('Job deadline exceeded during startup');
    }

    const adapter = {
      execute: async (command, args, options = {}) => {
        return new Promise((resolve, reject) => {
          if (signal?.aborted) return reject(new Error('Cancelled by user'));
          
          let cmdExec = command;
          if (cmdExec.startsWith('/') || cmdExec.includes('..')) {
             return reject(new Error('Absolute paths or traversal not allowed'));
          }

          const isInstall = job.operation === 'prepare_dependencies';
          // Never inherit the host environment. Only the registry configuration
          // required for dependency installation is sent into the worker.
          const forwardedEnv = isInstall && proxyServer
            ? [
                ['NPM_CONFIG_REGISTRY', `http://host.docker.internal:${proxyPort}`],
                ['NPM_CONFIG_PROXY', `http://host.docker.internal:${proxyPort}`],
                ['NPM_CONFIG_HTTPS_PROXY', `http://host.docker.internal:${proxyPort}`],
                ['NPM_CONFIG_IGNORE_SCRIPTS', 'true'],
              ]
            : [];

          const dockerArgs = ['exec', '-i'];
          for (const [key, value] of forwardedEnv) {
            dockerArgs.push('--env', `${key}=${value}`);
          }
          dockerArgs.push(containerName, 'node', '/opt/worker/entrypoint.js', cmdExec, ...(args || []));

          const proc = cp.spawn('docker', dockerArgs);
          
          let stdoutRetained = '';
          let stderrRetained = '';
          let stdoutSize = 0;
          let stderrSize = 0;
          const stdoutHash = createHash('sha256');
          const stderrHash = createHash('sha256');
          
          proc.stdout.on('data', (chunk) => {
            stdoutHash.update(chunk);
            if (stdoutSize < OUTPUT_CEILING) {
               const take = Math.min(chunk.length, OUTPUT_CEILING - stdoutSize);
               stdoutRetained += chunk.toString('utf8', 0, take);
               stdoutSize += take;
            }
          });
          
          proc.stderr.on('data', (chunk) => {
            stderrHash.update(chunk);
            if (stderrSize < OUTPUT_CEILING) {
               const take = Math.min(chunk.length, OUTPUT_CEILING - stderrSize);
               stderrRetained += chunk.toString('utf8', 0, take);
               stderrSize += take;
            }
          });
          
          const timeRemaining = maxDeadline - Date.now();
          if (timeRemaining <= 0) {
            return reject(new Error('Job deadline exceeded'));
          }
          const cmdTimeoutLimit = Math.min(120000, timeRemaining);
          
          const commandTimeout = setTimeout(() => {
            proc.kill('SIGKILL');
            reject(new Error(`Command timed out (${cmdTimeoutLimit}ms limit)`));
          }, cmdTimeoutLimit);
          
          const onAbort = () => {
            proc.kill('SIGKILL');
            reject(new Error('Cancelled by user'));
          };
          signal?.addEventListener('abort', onAbort);
          
          proc.on('close', (code, terminationSignal) => {
            clearTimeout(commandTimeout);
            signal?.removeEventListener('abort', onAbort);
            
            if (Date.now() > maxDeadline) {
               return reject(new Error('Job deadline exceeded'));
            }
            
            const resultObj = {
               stdout: stdoutRetained,
               stderr: stderrRetained,
               stdoutSha256: stdoutHash.digest('hex'),
               stderrSha256: stderrHash.digest('hex')
            };
            
            if (code === 0) resolve(resultObj);
            else {
              const commandError = new Error(
                `Command failed with code ${code}${terminationSignal ? ` (signal ${terminationSignal})` : ''}: ${stderrRetained}`,
              );
              commandError.result = resultObj;
              reject(commandError);
            }
          });
        });
      },
      spawn: (command, args, options = {}) => {
         const dockerArgs = ['exec', '-i'];
         if (job.operation === 'prepare_dependencies' && proxyServer) {
           for (const [key, value] of [
             ['NPM_CONFIG_REGISTRY', `http://host.docker.internal:${proxyPort}`],
             ['NPM_CONFIG_PROXY', `http://host.docker.internal:${proxyPort}`],
             ['NPM_CONFIG_HTTPS_PROXY', `http://host.docker.internal:${proxyPort}`],
             ['NPM_CONFIG_IGNORE_SCRIPTS', 'true'],
           ]) dockerArgs.push('--env', `${key}=${value}`);
         }
         dockerArgs.push(containerName, 'node', '/opt/worker/entrypoint.js', command, ...(args || []));
         return cp.spawn('docker', dockerArgs);
      }
    };

    if (job.code) {
      const res = await adapter.execute('node', ['-e', job.code]);
      return { status: 'success', result: res };
    }

    return { status: 'success', result: 'Completed' };
  } catch (error) {
    if (signal?.aborted || error.message.includes('Cancelled by user')) {
      return { status: 'failed', error: 'Cancelled by user' };
    }
    return { status: 'failed', error: error.message, ...(error.result ? { result: error.result } : {}) };
  } finally {
    await cleanupContainer(containerName);
    try { await execAsync(`docker network rm ${containerName}-net`); } catch {}
    if (proxyServer) {
      proxyServer.close();
    }
  }
}
