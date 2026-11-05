import fs from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import JSZip from 'jszip';
import { db } from '../db.js';
import { getArtifactsRoot } from '../artifactPaths.js';
import { ARTIFACT_LIMITS } from '../artifactLimits.js';
import { inspectZipEntries } from './safeExtractor.js';
import { digest } from './workerFailures.js';

// Reusing immutable dependency INPUT is not reusing an acceptance result.
// The new worker still runs clean npm ci, build and every mandatory check.
export async function loadRecordedDependencyLock({ projectId, contractId, packageJsonBytes,
    database = db, artifactsRoot = getArtifactsRoot() }) {
    const contract = database.prepare("SELECT id,revision,contract_hash FROM project_contracts WHERE project_id=? AND status='approved' ORDER BY revision DESC LIMIT 1").get(projectId);
    if (!contract || contract.id !== contractId) return null;
    const packageBytes = Buffer.from(packageJsonBytes);
    const candidate = database.prepare(`SELECT a.* FROM artifacts a
        JOIN artifact_files p ON p.artifact_id=a.id AND p.contract_id=a.contract_id AND p.path='package.json'
        JOIN artifact_files l ON l.artifact_id=a.id AND l.contract_id=a.contract_id AND l.path='package-lock.json'
        WHERE a.project_id=? AND a.contract_id=? AND a.status IN ('verified','rejected')
        AND a.verification_run_id IS NOT NULL AND p.sha256=? ORDER BY a.rowid DESC LIMIT 1`).get(projectId, contractId, digest(packageBytes));
    if (!candidate) return null;
    const root = path.resolve(artifactsRoot), filename = path.resolve(candidate.path), relative = path.relative(root, filename);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Recorded lock archive is outside the artifact root.');
    let current = path.parse(filename).root;
    for (const component of filename.slice(current.length).split(path.sep).filter(Boolean)) {
        current = path.join(current, component);
        if ((await fs.lstat(current)).isSymbolicLink()) throw new Error('Linked artifact paths cannot supply dependency input.');
    }
    const handle = await fs.open(filename, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
    let bytes;
    try {
        const stat = await handle.stat();
        if (!stat.isFile() || stat.size !== candidate.size || stat.size > ARTIFACT_LIMITS.maxArchiveBytes) throw new Error('Recorded dependency archive size is invalid.');
        bytes = await handle.readFile();
    } finally { await handle.close(); }
    if (bytes.length !== candidate.size || digest(bytes) !== candidate.sha256) throw new Error('Recorded dependency archive hash mismatch.');
    const zip = await JSZip.loadAsync(bytes);
    await inspectZipEntries(zip, {}, { readContent: false });
    const records = database.prepare("SELECT path,sha256,size FROM artifact_files WHERE artifact_id=? AND contract_id=? AND path IN ('package.json','package-lock.json')").all(candidate.id, contractId);
    const contents = new Map();
    for (const name of ['package.json', 'package-lock.json']) {
        const entry = zip.file(name), record = records.find(item => item.path === name);
        if (!entry || !record) throw new Error('Recorded dependency input inventory is missing.');
        const content = await entry.async('nodebuffer');
        if (content.length !== record.size || digest(content) !== record.sha256) throw new Error('Recorded dependency input entry hash mismatch.');
        contents.set(name, content);
    }
    if (!contents.get('package.json').equals(packageBytes)) throw new Error('Recorded package input changed.');
    const lockBytes = contents.get('package-lock.json');
    let lock;
    try { lock = JSON.parse(lockBytes.toString('utf8')); } catch { throw new Error('Recorded lock input is invalid JSON.'); }
    if (!Number.isInteger(lock?.lockfileVersion) || lock.lockfileVersion < 1) throw new Error('Recorded lock input is not an npm lockfile.');
    const latest = database.prepare("SELECT id,revision,contract_hash FROM project_contracts WHERE project_id=? AND status='approved' ORDER BY revision DESC LIMIT 1").get(projectId);
    if (latest?.id !== contract.id || latest?.revision !== contract.revision || latest?.contract_hash !== contract.contract_hash) throw new Error('Approved contract changed while reading dependency input.');
    return { bytes: lockBytes, sha256: digest(lockBytes), artifactId: candidate.id, runId: candidate.verification_run_id, reusedInput: true };
}
