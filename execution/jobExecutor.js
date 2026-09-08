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
function parseNames(output){
  if(typeof output!=='string'||!output.endsWith('\\n')) metadataError('archive name metadata is ambiguous');
  const lines=output.split(/\\r?\\n/);
  if(lines.pop()!=='') metadataError('archive name metadata is ambiguous');
  if(!lines.length) metadataError('archive metadata missing');
  if(lines.some(name=>!name||/[\\u0000-\\u001f\\u007f]/.test(name))) metadataError('archive name metadata is ambiguous');
  return lines;
}
function parseField(block,label){
  const expression=new RegExp('^[ \\t]*'+label+':[ \\t]*([0-9]+)[ \\t]+bytes[ \\t]*\\r?$','gm');
  const matches=[...block.matchAll(expression)];
  if(matches.length!==1) metadataError('archive size metadata missing or ambiguous');
  const value=Number(matches[0][1]);
  if(!Number.isSafeInteger(value)||value<0) metadataError('archive size metadata is ambiguous');
  return value;
}
function parseMode(block){
  const expression=/^[ \\t]*Unix file attributes[ \\t]*\\(([0-7]+) octal\\):/gm;
  const matches=[...block.matchAll(expression)];
  if(matches.length===1){
    const mode=Number.parseInt(matches[0][1],8);
    if(!Number.isSafeInteger(mode)||mode<0) metadataError('archive mode metadata is ambiguous');
    return mode;
  }
  if(matches.length>1) metadataError('archive mode metadata is ambiguous');
  const origins=[...block.matchAll(/^[ \\t]*file system or operating system of origin:[ \\t]*(.+)$/gmi)];
  if(origins.length!==1||!/MS-DOS|OS\\/2|NT FAT|FAT/i.test(origins[0][1])) metadataError('archive mode metadata missing or ambiguous');
  return null;
}
function parseVerbose(output){
  const markers=[...output.matchAll(/^Central directory entry #([0-9]+):[ \\t]*\\r?\\n-{5,}\\r?\\n/gm)];
  if(!markers.length) metadataError('archive metadata missing');
  return markers.map((marker,index)=>{
    const next=markers[index+1];
    const block=output.slice(marker.index+marker[0].length,next?next.index:output.length);
    if(Number(marker[1])!==index+1) metadataError('archive metadata order is ambiguous');
    return {compressed:parseField(block,'compressed size'),uncompressed:parseField(block,'uncompressed size'),mode:parseMode(block)};
  });
}
function canonicalPath(raw){
  if(typeof raw!=='string'||!raw||raw.includes('\\0')||raw.includes('\\\\')||raw.startsWith('/')||raw.split('/').includes('..')) metadataError('unsafe archive path');
  const normalized=path.posix.normalize(raw);
  const canonical=normalized.replace(/\\/+$/,'');
  if(!canonical||canonical==='.'||canonical==='..'||canonical.startsWith('../')) metadataError('unsafe archive path');
  return canonical;
}
const names=parseNames(cp.execFileSync('unzip',['-Z1',zip],{encoding:'utf8'}));
const records=parseVerbose(cp.execFileSync('unzip',['-Z','-v',zip],{encoding:'utf8'}));
if(names.length!==records.length) metadataError('archive metadata count mismatch');
const entries=records.map((record,index)=>({ ...record, rawName:names[index], path:canonicalPath(names[index]) }));
const seen=new Set();
for(const entry of entries){
  if(seen.has(entry.path)) metadataError('duplicate archive entry');
  seen.add(entry.path);
  if(entry.mode!==null&&(entry.mode&0xf000)===0xa000) metadataError('symlink archive entry');
}
const files=entries.filter(entry=>!entry.rawName.endsWith('/')&&(entry.mode===null||(entry.mode&0xf000)!==0x4000));
if(files.length>maxFiles) metadataError('archive file count limit exceeded');
let total=0;
for(const entry of files){
  if(entry.uncompressed>maxFile) metadataError('archive file size limit exceeded');
  if(entry.uncompressed>maxTotal-total) metadataError('archive extracted size limit exceeded');
  total+=entry.uncompressed;
  if(entry.uncompressed>1024&&entry.uncompressed/Math.max(entry.compressed,1)>maxRatio) metadataError('archive compression ratio limit exceeded');
}
cp.execFileSync('unzip',['-qq','-o',zip,'-d',out],{stdio:'pipe'});`;

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
        const reason = /symlink archive entry/i.test(rawFull) ? 'symlink archive entry' : /unsafe archive path/i.test(rawFull) ? 'unsafe archive path' : /duplicate archive entry/i.test(rawFull) ? 'duplicate archive entry' : /compression ratio limit/i.test(rawFull) ? 'archive compression ratio limit exceeded' : /file size limit/i.test(rawFull) ? 'archive file size limit exceeded' : /extracted size limit/i.test(rawFull) ? 'archive extracted size limit exceeded' : /file count limit/i.test(rawFull) ? 'archive file count limit exceeded' : /archive .*metadata|metadata .* (?:missing|ambiguous|mismatch|order)/i.test(rawFull) ? 'archive metadata validation failed' : 'archive extraction failed';
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
