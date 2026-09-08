import crypto from 'node:crypto';
import { runVerificationChecks } from '../backend/verification/runChecks.js';
import { ARTIFACT_LIMITS } from '../backend/artifactLimits.js';

const MAX_ARCHIVE_BYTES = ARTIFACT_LIMITS.maxArchiveBytes;
const MAX_EXTRACTED_BYTES = ARTIFACT_LIMITS.maxExtractedBytes;
const MAX_FILES = ARTIFACT_LIMITS.maxFiles;
const MAX_FILE_BYTES = ARTIFACT_LIMITS.maxFileBytes;
const MAX_COMPRESSION_RATIO = ARTIFACT_LIMITS.maxCompressionRatio;
function digest(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }
function asBytes(value) { return Buffer.isBuffer(value) ? value : Buffer.from(value || ''); }

export function prepareResult({ lockBytes, evidence, runId } = {}) {
    if (!runId) throw new Error('caller-supplied runId is required');
    const bytes = asBytes(lockBytes);
    return { runId, packageLockBase64: bytes.toString('base64'), packageLockSha256: digest(bytes), evidence: { ...(evidence || {}), runId } };
}

async function writeBytes(adapter, target, bytes, options) {
    if (typeof adapter?.writeFile === 'function') return adapter.writeFile(target, bytes, options);
    if (typeof adapter?.write === 'function') return adapter.write(target, bytes, options);
    throw new Error('sandbox adapter cannot write bytes');
}
async function readBytes(adapter, target, options) {
    if (typeof adapter?.readFile === 'function') return asBytes(await adapter.readFile(target, options));
    const result = await adapter.execute('node', ['-e', `process.stdout.write(require('fs').readFileSync(${JSON.stringify(target)}))`], options);
    return Buffer.from(result.stdout || '', 'binary');
}

export async function prepareDependencies({ packageJsonBytes, workspace = '/workspace', adapter, signal, env = {}, runId } = {}) {
    if (!runId) throw new Error('caller-supplied runId is required');
    if (!packageJsonBytes || !adapter) throw new Error('package.json bytes and adapter are required');
    if (workspace !== '/workspace') throw new Error('worker workspace is fixed /workspace');
    const manifest = asBytes(packageJsonBytes);
    await writeBytes(adapter, '/workspace/package.json', manifest, { signal });
    const install = await adapter.execute('npm', ['install', '--package-lock-only', '--ignore-scripts', '--no-audit', '--no-fund'], { signal, cwd: '/workspace', env: { ...env, NPM_CONFIG_IGNORE_SCRIPTS: 'true' } });
    if ((install.exitCode ?? 0) !== 0) throw new Error('npm lockfile preparation failed');
    const lock = await readBytes(adapter, '/workspace/package-lock.json', { signal });
    if (!lock.length) throw new Error('npm lockfile preparation produced no lockfile');
    let lockJson;
    try { lockJson = JSON.parse(lock.toString('utf8')); } catch { throw new Error('npm lockfile preparation produced invalid JSON'); }
    if (!lockJson || !Number.isInteger(lockJson.lockfileVersion) || lockJson.lockfileVersion < 1) throw new Error('npm lockfile preparation produced an invalid lockfile');
    return prepareResult({ lockBytes: lock, runId, evidence: { command: 'npm install --package-lock-only --ignore-scripts --no-audit --no-fund', exitCode: install.exitCode ?? 0, stdoutDigest: install.stdoutSha256 || digest(Buffer.from(install.stdout || '')), stderrDigest: install.stderrSha256 || digest(Buffer.from(install.stderr || '')) } });
}

const extractionScript = `const fs=require('fs'),cp=require('child_process'),path=require('path');const root='/workspace',zip=path.join(root,'artifact.zip'),out=root;const maxFiles=${MAX_FILES},maxTotal=${MAX_EXTRACTED_BYTES},maxFile=${MAX_FILE_BYTES},maxRatio=${MAX_COMPRESSION_RATIO};const listing=cp.execFileSync('unzip',['-Z','-v',zip],{encoding:'utf8'}),metadata=[];let current=null;for(const line of listing.split(/\\r?\\n/)){if(/^Central directory entry #/.test(line)){if(current)metadata.push(current);current={};continue}if(!current)continue;const name=line.match(/^\\s*file name:\\s*(.*)$/),compressed=line.match(/^\\s*compressed size:\\s*(\\d+)/),uncompressed=line.match(/^\\s*uncompressed size:\\s*(\\d+)/);if(name)current.name=name[1];if(compressed)current.compressed=Number(compressed[1]);if(uncompressed)current.uncompressed=Number(uncompressed[1])}if(current)metadata.push(current);const files=metadata.filter(entry=>entry.name&&!entry.name.endsWith('/'));if(files.length>maxFiles)throw Error('archive file count limit exceeded');const seen=new Set();for(const entry of files){const name=entry.name;if(!name||name.includes('\\0')||name.startsWith('/')||name.includes('\\\\')||name.split('/').includes('..'))throw Error('unsafe archive path');if(seen.has(name))throw Error('duplicate archive entry');seen.add(name);if(!Number.isSafeInteger(entry.compressed)||entry.compressed<0||!Number.isSafeInteger(entry.uncompressed)||entry.uncompressed<0)throw Error('archive size metadata missing');if(entry.uncompressed>maxFile)throw Error('archive file size limit exceeded');if(entry.uncompressed>1024&&entry.uncompressed/Math.max(entry.compressed,1)>maxRatio)throw Error('archive compression ratio limit exceeded')}let total=0;for(const entry of files){total+=entry.uncompressed;if(total>maxTotal)throw Error('archive extracted size limit exceeded')}if(/Unix file attributes \\(12[0-7]{4} octal\\)/.test(listing))throw Error('symlink archive entry');cp.execFileSync('unzip',['-qq','-o',zip,'-d',out],{stdio:'pipe'});`;

export async function verifyArtifact({ archiveBase64, archiveSha256, workspace = '/workspace', job, adapter, signal, env = {} } = {}) {
    if (!job?.runId) throw new Error('caller-supplied runId is required');
    if (workspace !== '/workspace' || !adapter) throw new Error('worker workspace is fixed /workspace and adapter is required');
    let archive; try { archive = Buffer.from(String(archiveBase64 || ''), 'base64'); } catch { archive = Buffer.alloc(0); }
    const actual = digest(archive);
    const expectedSha256 = job.inputSha256 || archiveSha256;
    if (!archive.length || archive.length > MAX_ARCHIVE_BYTES || actual !== expectedSha256) return { passed: false, status: 'blocked', reason: actual !== expectedSha256 ? 'Archive SHA-256 does not match supplied digest.' : 'Archive exceeds input limit.', runId: job.runId, archiveSha256: actual };
    await writeBytes(adapter, '/workspace/artifact.zip', archive, { signal });
    try {
        if (typeof adapter.extractArchive === 'function') {
            await adapter.extractArchive('/workspace/artifact.zip', '/workspace', {
                signal,
                maxFiles: MAX_FILES,
                maxTotalBytes: MAX_EXTRACTED_BYTES,
                maxFileBytes: MAX_FILE_BYTES,
                maxRatio: MAX_COMPRESSION_RATIO,
                runId: job.runId
            });
        } else {
            await adapter.execute('node', ['-e', extractionScript], { signal, cwd: '/workspace', env });
        }
    } catch (error) {
        const rawFull = String(error?.result?.stderr || error?.message || 'archive extraction failed').replace(/\s+/g, ' ').slice(0, 8192);
        const reason = /symlink archive entry/i.test(rawFull) ? 'symlink archive entry' : /unsafe archive path/i.test(rawFull) ? 'unsafe archive path' : /duplicate archive entry/i.test(rawFull) ? 'duplicate archive entry' : /compression ratio limit/i.test(rawFull) ? 'archive compression ratio limit exceeded' : /file size limit/i.test(rawFull) ? 'archive file size limit exceeded' : /extracted size limit/i.test(rawFull) ? 'archive extracted size limit exceeded' : /file count limit/i.test(rawFull) ? 'archive file count limit exceeded' : 'archive extraction failed';
        const detail = reason;
        return { passed: false, status: 'blocked', reason: `Archive extraction rejected: ${detail}`, runId: job.runId, archiveSha256: actual, evidence: { runId: job.runId, archiveBytes: archive.length, command: 'bounded ZIP metadata validation and extraction', exitCode: error?.result?.code ?? 1, stderr: rawFull, stderrSha256: error?.result?.stderrSha256 || digest(Buffer.from(rawFull)) } };
    }
    const checks = await runVerificationChecks({ workspace: '/workspace', contract: job.contract || {}, requirementIds: job.requirementIds || [], adapter, signal, env, runId: job.runId, files: job.files || null });
    return { ...checks, archiveSha256: actual, evidence: { runId: job.runId, archiveBytes: archive.length } };
}

export async function executeVerificationJob({ job, workspace = '/workspace', adapter, signal, env = {} } = {}) {
    if (!job || !adapter || !job.runId) throw new Error('job, adapter, and caller-supplied runId are required');
    return verifyArtifact({ archiveBase64: job.archiveBase64, archiveSha256: job.archiveSha256 || job.inputSha256, workspace, job, adapter, signal, env });
}
