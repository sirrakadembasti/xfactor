import { scrubEnvironmentVariables } from './sandboxRunner.js';
function requireAdapter(adapter) { if (!adapter || typeof adapter.spawn !== 'function') throw Object.assign(new Error('SANDBOX_UNAVAILABLE: service adapter is required.'), { code: 'SANDBOX_UNAVAILABLE' }); return adapter; }
export async function killService(handle) { if (!handle) return; const adapter = handle.adapter || handle.processTreeHandle?.adapter; if (typeof adapter?.kill === 'function') return adapter.kill(handle.pid || handle.processTreeHandle?.pid, { signal: 'SIGTERM' }); if (typeof adapter?.killProcessTree === 'function') return adapter.killProcessTree(handle.pid || handle.processTreeHandle?.pid); }
export function killProcessTree() { throw Object.assign(new Error('SANDBOX_UNAVAILABLE: host process termination is prohibited.'), { code: 'SANDBOX_UNAVAILABLE' }); }
export async function spawnService(serviceId, config = {}, env = {}, options = {}) {
    const adapter = requireAdapter(options.adapter);
    const child = await adapter.spawn({ command: config.command, args: config.args || [], workspace: options.workspace || config.cwd || '/workspace', cwd: options.workspace || config.cwd, port: config.port, env: scrubEnvironmentVariables(env), signal: options.signal, networkMode: options.networkMode || 'service' });
    if (!child) throw new Error(`Failed to spawn service "${serviceId}".`);
    let stdout = '', stderr = '';
    child.stdout?.on('data', c => { stdout += c.toString(); }); child.stderr?.on('data', c => { stderr += c.toString(); });
    const exitCodePromise = new Promise(resolve => { child.on?.('error', e => resolve({ exitCode: -1, stdout, stderr: stderr || e.message })); child.on?.('close', code => resolve({ exitCode: code ?? 0, stdout, stderr })); });
    return { serviceId, pid: child.pid, port: config.port, child, adapter, processTreeHandle: { pid: child.pid, serviceId, adapter }, exitCodePromise };
}
