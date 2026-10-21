import crypto from 'node:crypto';
import { verifyDependencies } from './packageVerifier.js';
import { verifyBuild } from './buildVerifier.js';
import { verifyReadmeCommands } from './readmeVerifier.js';
import { verifyProjectSmoke } from './smokeVerifier.js';
import { ACTIVE_POLICY_VERSION } from './policyVersion.js';
import { ARTIFACT_LIMITS } from '../artifactLimits.js';

// Base64 expands content by 4/3; the remaining budget covers JSON/path metadata.
// This is independent of retained diagnostic stdout and never raises that limit.
const MAX_INVENTORY_BYTES = 2 * ARTIFACT_LIMITS.maxExtractedBytes;
const INVENTORY_CHUNK_BYTES = 64 * 1024;

function inventoryOutput(result) {
    if (result?.stdoutTruncated || result?.stderrTruncated) throw new Error('Inventory transport output was truncated.');
    const code = result?.exitCode ?? result?.code;
    if (code !== undefined && code !== 0) throw new Error('Inventory transport process failed.');
    return result?.stdout || '';
}

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
    const target = `${workspace.replace(/[\\/]$/, '')}/.xfactor-inventory-${crypto.randomUUID()}.json`;
    // Only bounded metadata crosses stdout. The complete inventory is an owned
    // temporary file, read before any generated dependency or application runs.
    const script = `const fs=require('fs'),path=require('path'),crypto=require('crypto');
const root=process.argv[1],target=process.argv[2],limits=JSON.parse(process.argv[3]);
let total=0,count=0;
function walk(dir,out=[]){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
 if(['node_modules','.git','.npm','.home','.tmp'].includes(entry.name)||entry.name==='artifact.zip')continue;
 if(entry.isSymbolicLink())throw Error('Inventory symlink rejected.');
 const file=path.join(dir,entry.name);
 if(entry.isDirectory()){walk(file,out);continue;}
 if(!entry.isFile())throw Error('Inventory nonregular file rejected.');
 const stat=fs.statSync(file);
 if(stat.size>limits.maxFileBytes||total+stat.size>limits.maxExtractedBytes||++count>limits.maxFiles)throw Error('Inventory source size or file count limit exceeded.');
 total+=stat.size;
 const content=fs.readFileSync(file);
 if(content.length!==stat.size)throw Error('Inventory source changed during collection.');
 out.push({path:path.relative(root,file).split(path.sep).join('/'),contentBase64:content.toString('base64')});
}return out;}
try{const files=walk(root),bytes=Buffer.from(JSON.stringify(files));
 if(bytes.length>limits.maxInventoryBytes)throw Error('Inventory serialized size limit exceeded.');
 fs.writeFileSync(target,bytes,{flag:'wx'});
 process.stdout.write(JSON.stringify({bytes:bytes.length,count:files.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')}));
}catch(error){process.stdout.write(JSON.stringify({error:error.message}));}`;
    try {
        const result = await adapter.execute({ command: 'node', args: ['-e', script, workspace, target,
            JSON.stringify({ ...ARTIFACT_LIMITS, maxInventoryBytes: MAX_INVENTORY_BYTES })], workspace });
        let metadata;
        try { metadata = JSON.parse(inventoryOutput(result)); }
        catch (error) { if (/Inventory/.test(error.message)) throw error; throw new Error('Inventory transport metadata is invalid.'); }
        if (metadata?.error) throw new Error(String(metadata.error));
        if (!Number.isInteger(metadata?.bytes) || metadata.bytes < 2 || metadata.bytes > MAX_INVENTORY_BYTES
            || !Number.isInteger(metadata.count) || metadata.count < 0 || metadata.count > ARTIFACT_LIMITS.maxFiles
            || !/^[a-f0-9]{64}$/.test(metadata.sha256 || '')) throw new Error('Inventory transport metadata exceeds limits or is invalid.');
        let bytes;
        if (typeof adapter.readFile === 'function') {
            bytes = Buffer.from(await adapter.readFile(target, { maxBytes: MAX_INVENTORY_BYTES }));
        } else {
            const chunks = [];
            for (let offset = 0; offset < metadata.bytes; offset += INVENTORY_CHUNK_BYTES) {
                const length = Math.min(INVENTORY_CHUNK_BYTES, metadata.bytes - offset);
                const read = await adapter.execute({ command: 'node', args: ['-e',
                    "const fs=require('fs');const b=Buffer.alloc(Number(process.argv[3])),fd=fs.openSync(process.argv[1],'r');try{const n=fs.readSync(fd,b,0,b.length,Number(process.argv[2]));process.stdout.write(b.subarray(0,n).toString('base64'))}finally{fs.closeSync(fd)}",
                    target, String(offset), String(length)], workspace });
                const encoded = inventoryOutput(read);
                const chunk = Buffer.from(encoded, 'base64');
                if (chunk.length !== length || chunk.toString('base64') !== encoded) throw new Error('Inventory transport chunk is incomplete or invalid.');
                chunks.push(chunk);
            }
            bytes = Buffer.concat(chunks);
        }
        if (bytes.length !== metadata.bytes || bytes.length > MAX_INVENTORY_BYTES
            || crypto.createHash('sha256').update(bytes).digest('hex') !== metadata.sha256) throw new Error('Inventory transport size or digest mismatch.');
        let parsed;
        try { parsed = JSON.parse(bytes.toString('utf8')); } catch { throw new Error('Inventory file contains invalid JSON.'); }
        if (!Array.isArray(parsed) || parsed.length !== metadata.count) throw new Error('Inventory transport file count mismatch.');
        return collectFiles(null, parsed);
    } finally {
        // The path is verifier-owned and literal, never an application filename.
        await adapter.execute({ command: 'node', args: ['-e', "require('fs').rmSync(process.argv[1],{force:true})", target], workspace }).catch(() => {});
    }
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
