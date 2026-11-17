import crypto from 'node:crypto';
import { buildProjectArchive } from '../utils/archive.js';

// A repair Coder sees compiler errors before review and full verification. The probe result is
// advisory: it never becomes a verification run, check or acceptance evidence.
export const CONTROLLED_TYPE_PROBE_TIMEOUT_MS = 15 * 60 * 1000;
const ERROR_LINE = /^(.+?)\((\d+),(\d+)\): error (TS\d+): (.*)$/;

/** Groups `tsc --noEmit` errors by project-relative path. */
export function parseTypecheckErrors(output) {
    const byPath = new Map();
    for (const line of String(output || '').split(/\r?\n/)) {
        const match = ERROR_LINE.exec(line.trim());
        if (!match) continue;
        const path = match[1].replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\/workspace\//, '');
        const rows = byPath.get(path) || [];
        if (rows.length < 20) rows.push({ line: Number(match[2]), column: Number(match[3]), code: match[4], message: match[5].slice(0, 400) });
        byPath.set(path, rows);
    }
    return byPath;
}

/** Runs the worker compiler probe on exact source bytes and a recorded lock; null when it cannot say. */
export async function runControlledTypeProbe({ client, files, lockBytes, projectId, contract, signal, now = Date.now }) {
    if (!lockBytes || !files.some(file => file.path === 'tsconfig.json')) return null;
    const { zipBuffer } = await buildProjectArchive([...files.filter(file => file.path !== 'package-lock.json'),
        { path: 'package-lock.json', content: Buffer.from(lockBytes) }]);
    const id = crypto.randomUUID();
    const job = { version: 1, jobId: id, nonce: crypto.randomBytes(32).toString('hex'), projectId,
        contractId: contract.id, contractHash: contract.contract_hash, revision: contract.revision, artifactId: `typecheck-probe-${id}`,
        contract: JSON.parse(contract.contract_json), runId: `typecheck-probe-${id}`, deadline: now() + CONTROLLED_TYPE_PROBE_TIMEOUT_MS,
        inputSha256: crypto.createHash('sha256').update(zipBuffer).digest('hex'), archiveBase64: zipBuffer.toString('base64') };
    const status = await client.typecheckArtifact(job, { signal });
    const result = status?.result;
    if (!result || result.probe !== 'typecheck' || !['passed', 'failed'].includes(result.status)) return null;
    return { passed: result.status === 'passed', errors: parseTypecheckErrors(result.output), output: String(result.output || '') };
}
