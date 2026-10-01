import crypto from 'node:crypto';
import { verifyDependencies } from './packageVerifier.js';
import { verifyBuild } from './buildVerifier.js';
import { verifyReadmeCommands } from './readmeVerifier.js';
import { verifyProjectSmoke } from './smokeVerifier.js';
import { ACTIVE_POLICY_VERSION } from './policyVersion.js';

async function collectFiles(adapter, supplied = null, workspace = '/workspace') {
    if (Array.isArray(supplied)) {
        return supplied.map(file => {
            if (!file || typeof file !== 'object' || typeof file.path !== 'string') throw new Error('Invalid supplied inventory entry');
            if (file.contentBase64 !== undefined) return { ...file, content: Buffer.from(String(file.contentBase64), 'base64').toString('utf8') };
            if (Buffer.isBuffer(file.content)) return { ...file, content: file.content.toString('utf8') };
            return { path: file.path, content: typeof file.content === 'string' ? file.content : '' };
        });
    }
    if (typeof adapter?.execute !== 'function') throw new Error('sandbox adapter inventory is required');
    const result = await adapter.execute({ command: 'node', args: ['-e', "const fs=require('fs'),path=require('path'); const p=process.argv[1]; function w(d,o=[]){for(const e of fs.readdirSync(d,{withFileTypes:true})){if(['node_modules','.git','.npm','.home','.tmp'].includes(e.name)||e.name==='artifact.zip')continue;if(e.isSymbolicLink())throw Error('Inventory symlink');const f=path.join(d,e.name);e.isDirectory()?w(f,o):o.push({path:path.relative(p,f).split(path.sep).join('/'),contentBase64:fs.readFileSync(f).toString('base64')})}return o} process.stdout.write(JSON.stringify(w(p)))", workspace], workspace });
    const parsed = JSON.parse(result.stdout || '[]');
    return collectFiles(null, parsed);
}
function withEvidence(check, runId, requirementIds) {
    return { ...check, runId, requirementIds: [...new Set([...(check.requirementIds || []), ...requirementIds])], evidence: { ...(check.evidence || {}), runId, requirementIds: [...requirementIds] } };
}
export async function runVerificationChecks({ workspace = '/workspace', contract = {}, requirementIds = [], adapter, signal, env = {}, runId = null, files = null, verifiers = {} } = {}) {
    const inventory = await collectFiles(adapter, files, workspace);
    const options = { adapter, signal, env, workspace, files: inventory };
    const checks = [];
    const dependency = await (verifiers.dependencies || verifyDependencies)(workspace, contract, options);
    checks.push(...(dependency.checks || []));
    const build = await (verifiers.build || verifyBuild)(workspace, contract, { ...options, dependencyResult: dependency });
    checks.push(...(build.checks || []));
    const readmeStartedAt = new Date().toISOString();
    const readme = await (verifiers.readme || verifyReadmeCommands)(contract, inventory, { ...options });
    const readmeEndedAt = new Date().toISOString();
    const readmeIssues = readme.issues || [];
    checks.push(...(readme.checks || []));
    checks.push({
        name: 'readme_check',
        status: readme.passed === true ? 'passed' : 'failed',
        command: 'static:verify-readme-contract',
        exitCode: readme.passed === true ? 0 : 1,
        startedAt: readmeStartedAt,
        endedAt: readmeEndedAt,
        stdoutDigest: crypto.createHash('sha256').update(JSON.stringify({ passed: readme.passed, issues: readmeIssues })).digest('hex'),
        stderrDigest: crypto.createHash('sha256').update(readmeIssues.join('; ')).digest('hex'),
        policyVersion: ACTIVE_POLICY_VERSION,
        reason: readmeIssues.join('; ') || 'README commands and runtime contract are consistent.',
        evidence: { producer: 'aggregate-verification', policyVersion: ACTIVE_POLICY_VERSION, issues: readmeIssues }
    });
    // Smoke is the single runtime orchestrator; it owns service lifecycle and all
    // applicable database/API/browser/process/health/test-infrastructure gates.
    const applicable = [[verifiers.smoke || verifyProjectSmoke, 'smoke_gate']];
    for (const [verifier] of applicable) {
        try { const result = await verifier(workspace, contract, options); checks.push(...(result.checks || [])); }
        catch (error) { checks.push({ name: 'verification_runtime', status: 'blocked', reason: error.message }); }
    }
    const finalChecks = checks.map(check => withEvidence(check, runId, requirementIds));
    return { runId, checks: finalChecks, passed: finalChecks.every(check => ['passed', 'skipped'].includes(check.status)) };
}
