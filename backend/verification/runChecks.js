import { verifyDependencies } from './packageVerifier.js';
import { verifyBuild } from './buildVerifier.js';
import { verifyReadmeCommands } from './readmeVerifier.js';
import { verifyProjectSmoke } from './smokeVerifier.js';
import { verifyTestInfrastructure } from './testInfrastructureVerifier.js';

async function collectFiles(adapter, supplied = null) {
    if (Array.isArray(supplied)) {
        return supplied.map(file => {
            if (!file || typeof file !== 'object' || typeof file.path !== 'string') throw new Error('Invalid supplied inventory entry');
            if (file.contentBase64 !== undefined) return { ...file, content: Buffer.from(String(file.contentBase64), 'base64').toString('utf8') };
            if (Buffer.isBuffer(file.content)) return { ...file, content: file.content.toString('utf8') };
            return { path: file.path, content: typeof file.content === 'string' ? file.content : '' };
        });
    }
    if (typeof adapter?.execute !== 'function') throw new Error('sandbox adapter inventory is required');
    const result = await adapter.execute({ command: 'node', args: ['-e', "const fs=require('fs'); const p='/workspace'; function w(d,o=[]){for(const e of fs.readdirSync(d,{withFileTypes:true})){if(['node_modules','.git'].includes(e.name))continue;const f=d+'/'+e.name;e.isDirectory()?w(f,o):o.push({path:f.slice(p.length+1),contentBase64:fs.readFileSync(f).toString('base64')})}return o} process.stdout.write(JSON.stringify(w(p)))"], workspace: '/workspace' });
    const parsed = JSON.parse(result.stdout || '[]');
    return collectFiles(null, parsed);
}
function withEvidence(check, runId, requirementIds) {
    return { ...check, runId, requirementIds: [...new Set([...(check.requirementIds || []), ...requirementIds])], evidence: { ...(check.evidence || {}), runId, requirementIds: [...requirementIds] } };
}
export async function runVerificationChecks({ workspace = '/workspace', contract = {}, requirementIds = [], adapter, signal, env = {}, runId = null, files = null } = {}) {
    const inventory = await collectFiles(adapter, files);
    const options = { adapter, signal, env, workspace, files: inventory };
    const checks = [];
    const dependency = await verifyDependencies(workspace, contract, options);
    checks.push(...dependency.checks);
    const build = await verifyBuild(workspace, contract, { ...options, dependencyResult: dependency });
    checks.push(...build.checks);
    const readme = await verifyReadmeCommands(contract, inventory, { ...options });
    checks.push(...(readme.checks || []));
    const applicable = [[verifyProjectSmoke, 'smoke_gate'], [verifyTestInfrastructure, 'test_infrastructure']];
    if (contract.database) { const { verifyDatabase } = await import('./databaseVerifier.js'); applicable.push([(dir, c, opts) => verifyDatabase(dir, c, env, opts), 'database_check']); }
    if (contract.api?.baseUrl) { const { verifyAPIContract } = await import('./apiVerifier.js'); applicable.push([(_dir, c, opts) => verifyAPIContract(contract.api.baseUrl, contract.databasePath, c, opts), 'api_check']); }
    if (contract.browser?.journey) { const { verifyBrowserJourney } = await import('./browserVerifier.js'); applicable.push([(_dir, c, opts) => verifyBrowserJourney(contract.browser.url, contract.browser.journey, opts), 'browser_check']); }
    if (contract.process?.command) { const { spawnService, killService } = await import('./processVerifier.js'); applicable.push([async () => { const handle = await spawnService(contract.process.id || 'verification', contract.process, env, { ...options }); try { return { passed: true, checks: [{ name: 'process_check', status: 'passed', reason: 'Service started with supplied process identity.', evidence: { adapterId: adapter?.id, pid: handle.pid } }] }; } finally { await killService(handle); } }, 'process_check']); }
    for (const [verifier] of applicable) { try { const result = await verifier(workspace, contract, options); checks.push(...(result.checks || [])); } catch (error) { checks.push({ name: 'verification_runtime', status: 'blocked', reason: error.message }); } }
    const finalChecks = checks.map(check => withEvidence(check, runId, requirementIds));
    return { runId, checks: finalChecks, passed: finalChecks.every(check => ['passed', 'skipped'].includes(check.status)) };
}
