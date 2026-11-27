import crypto from 'node:crypto';
import { runVerificationChecks, runTypecheckProbe } from '../backend/verification/runChecks.js';
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
    const install = await adapter.execute('npm', ['install', '--package-lock-only', '--ignore-scripts', '--no-audit', '--no-fund'], { signal, cwd: '/workspace', timeout: 900000, env: { ...env, NPM_CONFIG_IGNORE_SCRIPTS: 'true' } });
    if ((install.exitCode ?? 0) !== 0) throw new Error('npm lockfile preparation failed');
    const lock = await readBytes(adapter, '/workspace/package-lock.json', { signal });
    if (!lock.length) throw new Error('npm lockfile preparation produced no lockfile');
    let lockJson;
    try { lockJson = JSON.parse(lock.toString('utf8')); } catch { throw new Error('npm lockfile preparation produced invalid JSON'); }
    if (!lockJson || !Number.isInteger(lockJson.lockfileVersion) || lockJson.lockfileVersion < 1) throw new Error('npm lockfile preparation produced an invalid lockfile');
    return prepareResult({ lockBytes: lock, runId, evidence: { command: 'npm install --package-lock-only --ignore-scripts --no-audit --no-fund', exitCode: install.exitCode ?? 0, stdoutDigest: install.stdoutSha256 || digest(Buffer.from(install.stdout || '')), stderrDigest: install.stderrSha256 || digest(Buffer.from(install.stderr || '')) } });
}

const extractionScript = `const fs=require('fs');
const cp=require('child_process');
const path=require('path');
const root='/workspace';
const zip=path.join(root,'artifact.zip');
const out=root;
const maxFiles=${MAX_FILES};
const maxTotal=${MAX_EXTRACTED_BYTES};
const maxFile=${MAX_FILE_BYTES};
const maxRatio=${MAX_COMPRESSION_RATIO};

function metadataError(message){ throw new Error(message); }
function canonicalPath(raw){
  if(typeof raw!=='string'||!raw||raw.includes('\\0')||raw.includes('\\\\')||raw.startsWith('/')||raw.split('/').includes('..')) metadataError('unsafe archive path');
  if(/[\\u0000-\\u001f\\u007f-\\u009f]/.test(raw)) metadataError('unsafe archive filename: control character');
  const normalized=path.posix.normalize(raw);
  const canonical=normalized.replace(/\\/+$/,'');
  if(!canonical||canonical==='.'||canonical==='..'||canonical.startsWith('../')) metadataError('unsafe archive path');
  return canonical;
}

const buffer=fs.readFileSync(zip);
const entries=[];
let pos=0;
while(pos<buffer.length-4){
  if(buffer.readUInt32LE(pos)===0x02014b50){
    const compressed=buffer.readUInt32LE(pos+20);
    const uncompressed=buffer.readUInt32LE(pos+24);
    const nameLen=buffer.readUInt16LE(pos+28);
    const extraLen=buffer.readUInt16LE(pos+30);
    const commentLen=buffer.readUInt16LE(pos+32);
    const externalAttrs=buffer.readUInt32LE(pos+38);
    const rawNameBuf=buffer.subarray(pos+46,pos+46+nameLen);
    const rawName=rawNameBuf.toString('utf8');
    entries.push({
      rawName,
      path:canonicalPath(rawName),
      compressed,
      uncompressed,
      mode:(externalAttrs>>16)&0xffff
    });
    pos+=46+nameLen+extraLen+commentLen;
  }else{
    pos++;
  }
}

if(!entries.length) metadataError('archive metadata missing');
if(entries.length>maxFiles) metadataError('archive file count limit exceeded');

const seen=new Set();
let total=0;
for(const entry of entries){
  if(seen.has(entry.path)) metadataError('duplicate archive entry');
  seen.add(entry.path);
  if((entry.mode&0xf000)===0xa000) metadataError('symlink archive entry');
  if(!entry.rawName.endsWith('/')&&(entry.mode===0||(entry.mode&0xf000)!==0x4000)){
    if(entry.uncompressed>maxFile) metadataError('archive file size limit exceeded');
    if(entry.uncompressed>maxTotal-total) metadataError('archive extracted size limit exceeded');
    total+=entry.uncompressed;
    if(entry.uncompressed>1024&&entry.uncompressed/Math.max(entry.compressed,1)>maxRatio) metadataError('archive compression ratio limit exceeded');
  }
}
cp.execFileSync('unzip',['-qq','-o',zip,'-d',out],{stdio:'pipe'});`;

export async function verifyArtifact({ archiveBase64, archiveSha256, workspace = '/workspace', job, adapter, signal, env = {}, onPhaseComplete, runChecks = runVerificationChecks } = {}) {
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
        const reason = /unsafe archive filename|archive filename contains control character/i.test(rawFull) ? 'unsafe archive filename: control character' : /symlink archive entry/i.test(rawFull) ? 'symlink archive entry' : /unsafe archive path/i.test(rawFull) ? 'unsafe archive path' : /duplicate archive entry/i.test(rawFull) ? 'duplicate archive entry' : /compression ratio limit/i.test(rawFull) ? 'archive compression ratio limit exceeded' : /file size limit/i.test(rawFull) ? 'archive file size limit exceeded' : /extracted size limit/i.test(rawFull) ? 'archive extracted size limit exceeded' : /file count limit/i.test(rawFull) ? 'archive file count limit exceeded' : /archive .*metadata|metadata .* (?:missing|ambiguous|mismatch|order)/i.test(rawFull) ? 'archive metadata validation failed' : 'archive extraction failed';
        const detail = reason;
        return { passed: false, status: 'blocked', reason: `Archive extraction rejected: ${detail}`, runId: job.runId, archiveSha256: actual, evidence: { runId: job.runId, archiveBytes: archive.length, command: 'bounded ZIP metadata validation and extraction', exitCode: error?.result?.code ?? 1, stderr: rawFull, stderrSha256: error?.result?.stderrSha256 || digest(Buffer.from(rawFull)) } };
    }
    const checks = await runChecks({ workspace: adapter.workspaceRoot || '/workspace', contract: job.contract || {}, requirementIds: job.requirementIds || [], adapter, signal, env, runId: job.runId, files: job.files || null,
        job, verificationPlan: job.verificationPlan || null, onPhaseComplete });
    return { ...checks, archiveSha256: actual, evidence: { runId: job.runId, archiveBytes: archive.length } };
}

export async function executeVerificationJob({ job, workspace = '/workspace', adapter, signal, env = {}, onPhaseComplete } = {}) {
    if (!job || !adapter || !job.runId) throw new Error('job, adapter, and caller-supplied runId are required');
    return verifyArtifact({ archiveBase64: job.archiveBase64, archiveSha256: job.archiveSha256 || job.inputSha256, workspace, job, adapter, signal, env, onPhaseComplete });
}

// Same archive limits and extraction as verification; only the advisory compiler probe runs.
export async function executeTypecheckJob({ job, workspace = '/workspace', adapter, signal, env = {} } = {}) {
    if (!job || !adapter || !job.runId) throw new Error('job, adapter, and caller-supplied runId are required');
    return verifyArtifact({ archiveBase64: job.archiveBase64, archiveSha256: job.archiveSha256 || job.inputSha256, workspace,
        job: { ...job, verificationPlan: null }, adapter, signal, env, runChecks: runTypecheckProbe });
}
