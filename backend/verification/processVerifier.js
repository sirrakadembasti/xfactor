import { spawn } from 'child_process';
import { requireSandboxCapabilities, scrubEnvironmentVariables } from './sandboxRunner.js';

function requireAdapter(adapter) {
    if (adapter) {
        if (typeof adapter.spawn !== 'function') {
            throw Object.assign(new Error('SANDBOX_UNAVAILABLE: service adapter is required for long-running process boundary.'), { code: 'SANDBOX_UNAVAILABLE' });
        }
        requireSandboxCapabilities(adapter);
        return adapter;
    }
    return null;
}

function observeService(child, serviceId, config, adapter) {
    const streams={stdout:Buffer.alloc(0),stderr:Buffer.alloc(0)},truncated={stdout:false,stderr:false};
    let exited=false,exitCode=null,signal=null;
    for(const name of ['stdout','stderr'])child[name]?.on('data',chunk=>{
        const combined=Buffer.concat([streams[name],Buffer.from(chunk)]);
        truncated[name] ||= combined.length>32768;
        streams[name]=combined.subarray(Math.max(0,combined.length-32768));
    });
    const getObservation=()=>({exited,exitCode,signal,stdout:streams.stdout.toString('utf8'),stderr:streams.stderr.toString('utf8'),stdoutTruncated:truncated.stdout,stderrTruncated:truncated.stderr});
    const exitCodePromise=new Promise(resolve=>{
        child.on?.('error',error=>{exited=true;exitCode=-1;streams.stderr=Buffer.from(String(error.message).slice(0,8192));resolve(getObservation());});
        child.on?.('close',(code,exitSignal)=>{exited=true;exitCode=code;signal=exitSignal || null;resolve(getObservation());});
    });
    return {serviceId,pid:child.pid,port:config.port,child,adapter,processTreeHandle:{pid:child.pid,serviceId,adapter},exitCodePromise,getObservation};
}

export async function killService(handle) {
    if (!handle) return;
    const adapter = handle.adapter || handle.processTreeHandle?.adapter;
    if (typeof adapter?.kill === 'function') return adapter.kill(handle.pid || handle.processTreeHandle?.pid, { signal: 'SIGTERM' });
    if (typeof adapter?.killProcessTree === 'function') return adapter.killProcessTree(handle.pid || handle.processTreeHandle?.pid);
    const pid = handle.pid || handle.processTreeHandle?.pid;
    if (pid) {
        try {
            process.kill(pid, 'SIGKILL');
        } catch {}
    }
}

export function killProcessTree() {
    throw Object.assign(new Error('SANDBOX_UNAVAILABLE: host process termination is prohibited.'), { code: 'SANDBOX_UNAVAILABLE' });
}

export async function spawnService(serviceId, config = {}, env = {}, options = {}) {
    const adapter = requireAdapter(options.adapter);
    const serviceEnv = scrubEnvironmentVariables(env);
    // Only an explicitly supplied per-run test value can cross this boundary.
    // Host/application credentials in env remain scrubbed.
    if (/^[a-f0-9]{64}$/.test(options.applicationTestSecret || '')) {
        for (const name of ['AUTH_SECRET', 'JWT_SECRET', 'NEXTAUTH_SECRET']) {
            serviceEnv[name] = options.applicationTestSecret;
        }
    }
    if (adapter) {
        const child = await adapter.spawn({ command: config.command, args: config.args || [], workspace: options.workspace || config.cwd || '/workspace', cwd: options.workspace || config.cwd, port: config.port, env: serviceEnv, signal: options.signal, networkMode: options.networkMode || 'service' });
        if (!child) throw new Error(`Failed to spawn service "${serviceId}".`);
        return observeService(child,serviceId,config,adapter);
    }

    const scrubbed = { ...scrubEnvironmentVariables(process.env), ...serviceEnv };
    const child = spawn(config.command, config.args || [], {
        cwd: options.workspace || config.cwd || process.cwd(),
        env: scrubbed,
        stdio: ['ignore', 'pipe', 'pipe']
    });
    return observeService(child,serviceId,config,null);
}
