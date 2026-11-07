import crypto from 'node:crypto';
import { db } from '../db.js';
import { redactSensitiveText } from '../observability.js';
import { assertVerificationContext } from './verificationContext.js';

export const digest = value => crypto.createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest('hex');
export function safeWorkerPath(value) {
    if (typeof value !== 'string') return null;
    const normalized = value.replace(/\\/g, '/').replace(/^\.\//, '');
    return normalized && !/[:\x00-\x1f]/.test(normalized) && !normalized.startsWith('/')
        && !normalized.split('/').some(part => !part || part === '.' || part === '..') ? normalized : null;
}
function bounded(value, limit) {
    const text = redactSensitiveText(String(value ?? '').replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '').replace(/\r\n?/g, '\n'));
    const bytes = Buffer.from(text);
    return { text: bytes.subarray(0, limit).toString('utf8'), truncated: bytes.length > limit };
}
export function normalizeWorkerCheckLog(check, { maxStreamBytes = 16384, maxReasonBytes = 2048 } = {}) {
    const stdout = bounded(check.stdout, maxStreamBytes), stderr = bounded(check.stderr, maxStreamBytes);
    return { stdout: stdout.text, stderr: stderr.text, reason: bounded(check.reason, maxReasonBytes).text,
        stdoutTruncated: check.stdoutTruncated === true || stdout.truncated,
        stderrTruncated: check.stderrTruncated === true || stderr.truncated };
}
export function redactObservedEvidence(value, depth = 0) {
    if (depth > 12) return '[bounded]';
    if (typeof value === 'string') return bounded(value, 16384).text;
    if (Array.isArray(value)) return value.slice(0, 256).map(item => redactObservedEvidence(item, depth + 1));
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).slice(0, 256)
        .map(([key, item]) => [key, redactObservedEvidence(item, depth + 1)]));
    return value;
}

// Authoritative semantic proof cannot be shortened or rewritten: its retained
// bytes are subsequently checked against the authenticated execution digests.
// Reject unsafe/oversized proof as a whole instead of manufacturing a new one.
export function retainSemanticEvidence(value) {
    let visited = 0;
    const copy = (part, depth = 0) => {
        if (++visited > 100000 || depth > 32) throw Error('Semantic evidence limit exceeded.');
        if (typeof part === 'string') {
            if (Buffer.byteLength(part) > 128 * 1024) throw Error('Semantic evidence string limit exceeded.');
            if (redactSensitiveText(part) !== part) throw Error('Semantic evidence contains sensitive data.');
            return part;
        }
        if (part === null || typeof part === 'boolean' || typeof part === 'number' && Number.isFinite(part)) return part;
        if (Array.isArray(part)) return part.map(item => copy(item, depth + 1));
        if (part && typeof part === 'object' && [Object.prototype, null].includes(Object.getPrototypeOf(part))) {
            return Object.fromEntries(Object.entries(part).filter(([, item]) => item !== undefined).map(([key, item]) => [key, copy(item, depth + 1)]));
        }
        throw Error('Invalid semantic evidence shape.');
    };
    const result = copy(value);
    if (Buffer.byteLength(JSON.stringify(result)) > 512 * 1024) throw Error('Semantic evidence byte limit exceeded.');
    return result;
}
export function parseTypecheckDiagnostics({ check, log, artifactPaths }) {
    const stop = blockerReason => ({ classification: /network|download|tool|ECONN|EAI_|npm/i.test(blockerReason) ? 'infrastructure' : 'ambiguous', blockerReason, findings: [] });
    if ((check.gateName || check.name) !== 'typecheck' || !/^npx(?:\.cmd)? tsc --noEmit$/.test(check.command || '')
        || ![1, 2].includes(check.exitCode) || check.executionObservation?.normalExit !== true
        || check.timedOut || check.executionObservation?.cancelled || log.stdoutTruncated || log.stderrTruncated
        || check.stdoutTruncated !== false || check.stderrTruncated !== false) return stop('Incomplete normal compiler process observation.');
    const output = `${log.stdout}\n${log.stderr}`;
    if (/\b(?:ECONN\w*|EAI_AGAIN|ENOTFOUND|npm (?:ERR|error)|certificate|download|not found|not recognized|ENOENT)\b/i.test(output)) return stop('Compiler invocation contains network/download/tool failure.');
    const findings = [], paths = new Set(artifactPaths);
    for (const line of output.split('\n')) {
        if (!line.trim()) continue;
        const match = line.match(/^(.+?)\((\d+),(\d+)\): error (TS\d+): (.+)$/);
        if (!match) {
            // Only compiler's indented continuation of an already parsed error.
            if (/^\s+\S/.test(line) && findings.length && !/error TS\d+/.test(line)) {
                findings.at(-1).diagnostic.message += `\n${line.trim()}`; continue;
            }
            return stop('Unaccounted compiler output; explicit revision required.');
        }
        const filePath = safeWorkerPath(match[1]);
        if (!filePath || !paths.has(filePath) || !/\.[cm]?tsx?$/.test(filePath)) return stop('Compiler source is unsafe or absent from submitted artifact.');
        findings.push({ filePath, diagnostic: { code: match[4], line: Number(match[2]), column: Number(match[3]), message: match[5] } });
        if (findings.length > 64) return stop('Compiler diagnostic budget exceeded.');
    }
    return findings.length ? { classification: 'product', findings } : stop('No exact source compiler diagnostics.');
}
export function summarizeWorkerRejection({ identity, terminalStatus, rawChecks, records, artifactManifest, acceptanceBlockers = [] }) {
    const findings = [], blockers = [...acceptanceBlockers];
    if (!['failed', 'completed'].includes(terminalStatus)) blockers.push(`Worker terminal status ${terminalStatus}.`);
    const manifest = new Map(artifactManifest.map(file => [file.path, file]));
    for (const check of rawChecks) {
        if (['passed', 'PASS', 'skipped', 'NOT_APPLICABLE'].includes(check.status)) continue;
        const parsed = parseTypecheckDiagnostics({ check, log: normalizeWorkerCheckLog(check), artifactPaths: [...manifest.keys()] });
        if (parsed.classification !== 'product') { blockers.push(parsed.blockerReason); continue; }
        for (const finding of parsed.findings) findings.push({ ...finding, checkId: check.id,
            sourceSha256: manifest.get(finding.filePath).sha256,
            fingerprint: digest([identity.contractId, identity.contractHash, 'typecheck', finding.filePath, finding.diagnostic.code, finding.diagnostic.message]) });
    }
    if (!findings.length) blockers.push('No safely routable product findings.');
    for (const record of records || []) {
        if (!['FAIL', 'BLOCKED'].includes(record.status) || record.gateName === 'typecheck') continue;
        // Derived traceability is blocked by the known failed product gate;
        // missing runtime/other gate evidence is a separate unsafe failure.
        if (record.gateName === 'requirement_traceability' && record.status === 'BLOCKED'
            && record.evidenceJson?.kind === 'derived_gate' && findings.length) continue;
        blockers.push(`Additional unrepairable gate ${record.gateName}: ${record.status}.`);
    }
    if (findings.length > 64 || new Set(findings.map(item => item.filePath)).size > 8) blockers.push('Repair batch budget exceeded.');
    return { findings, blockers: [...new Set(blockers)], batchFingerprint: digest(findings.map(item => item.fingerprint).sort()) };
}

// Caller holds the verification-context transaction that rejects the artifact.
export function recordWorkerRejection(context, { identity, terminalStatus, artifact, summary }, database = db) {
    assertVerificationContext(context, database);
    const run = database.prepare('SELECT * FROM verification_runs WHERE id=? AND project_id=? AND contract_id=?').get(identity.runId, context.projectId, context.contractId);
    const stored = database.prepare('SELECT * FROM artifacts WHERE id=? AND project_id=? AND contract_id=?').get(artifact.id, context.projectId, context.contractId);
    if (!run || !stored || stored.sha256 !== identity.inputSha256) throw new Error('Rejection provenance mismatch.');
    const common = { version: 1, producer: 'artifact-verifier', contractHash: context.contractHash,
        contractRevision: context.revision, artifactId: artifact.id, artifactSha256: artifact.sha256,
        runId: identity.runId, jobId: identity.jobId, nonce: identity.nonce, terminalStatus, authenticatedWorker: true };
    const entries = summary.findings.map(finding => ({ ...common, ...finding, kind: 'worker_product_failure', classification: 'product', gateName: 'typecheck' }));
    if (summary.blockers.length) entries.push({ ...common, kind: 'worker_verification_blocker', classification: 'ambiguous',
        reason: summary.blockers.join('; '), fingerprint: digest(summary.blockers) });
    for (const detail of entries) {
        if (detail.checkId && !database.prepare('SELECT id FROM verification_checks WHERE id=? AND run_id=? AND contract_id=?').get(detail.checkId, identity.runId, context.contractId)) throw new Error('Rejection check provenance mismatch.');
        const id = `repair-worker-${digest([context.projectId, context.contractId, identity.runId, detail.fingerprint, detail.diagnostic?.line, detail.diagnostic?.column])}`;
        database.prepare(`INSERT INTO repair_issues (id,project_id,contract_id,run_id,fingerprint,severity,status,detail_json,attempt_id,lease_owner,origin)
            VALUES (?,?,?,?,?,'high','open',?,?,?,'worker_rejection') ON CONFLICT(id) DO NOTHING`).run(id, context.projectId, context.contractId,
            identity.runId, detail.fingerprint, JSON.stringify(detail), context.attemptId ?? null, context.leaseOwner ?? null);
    }
}
export function recordVerificationBlocker(context, { expectedIdentity, reason }, database = db) {
    assertVerificationContext(context, database);
    const fingerprint = digest([context.contractId, context.contractHash, String(reason)]);
    const detail = { version: 1, kind: 'verification_controller_blocker', authenticatedWorker: false,
        contractHash: context.contractHash, expectedIdentity, reason: bounded(reason, 2048).text };
    database.prepare(`INSERT INTO repair_issues (id,project_id,contract_id,fingerprint,severity,status,detail_json,attempt_id,lease_owner,origin)
        VALUES (?,?,?,?,'high','open',?,?,?,'verification_blocker') ON CONFLICT(id) DO NOTHING`).run(`repair-worker-${fingerprint}`, context.projectId,
        context.contractId, fingerprint, JSON.stringify(detail), context.attemptId ?? null, context.leaseOwner ?? null);
}
export function loadOpenWorkerRepairBatch({ projectId, contractId, contractHash }, database = db) {
    const issues = [];
    for (const row of database.prepare("SELECT * FROM repair_issues WHERE project_id=? AND contract_id=? AND status='open' ORDER BY created_at,id").all(projectId, contractId)) {
        let detail; try { detail = JSON.parse(row.detail_json); } catch {}
        if (!['worker_product_failure', 'worker_verification_blocker', 'verification_controller_blocker'].includes(detail?.kind)) {
            const workerOrigin = row.id.startsWith('repair-worker-') || (row.run_id && database.prepare(
                'SELECT id FROM verification_runs WHERE id=? AND project_id=? AND contract_id=?').get(row.run_id, projectId, contractId));
            if (workerOrigin) issues.push({ ...row, detail: { kind: 'worker_verification_blocker', reason: 'Malformed or unsupported worker repair provenance.' } });
            continue;
        }
        let valid = detail.version === 1 && detail.contractHash === contractHash;
        if (detail.authenticatedWorker === true) {
            const artifact = database.prepare('SELECT * FROM artifacts WHERE id=? AND project_id=? AND contract_id=?').get(detail.artifactId, projectId, contractId);
            const run = database.prepare('SELECT * FROM verification_runs WHERE id=? AND project_id=? AND contract_id=?').get(row.run_id, projectId, contractId);
            valid &&= Boolean(artifact && run?.status === 'failed' && artifact.sha256 === detail.artifactSha256 && artifact.verification_run_id === row.run_id);
            if (detail.kind === 'worker_product_failure') valid &&= Boolean(database.prepare("SELECT id FROM verification_checks WHERE id=? AND contract_id=? AND run_id=? AND status='FAIL'").get(detail.checkId, contractId, row.run_id));
        } else valid &&= detail.kind === 'verification_controller_blocker';
        issues.push({ ...row, detail: valid ? detail : { kind: 'worker_verification_blocker', reason: 'Malformed worker repair provenance.' } });
    }
    return { issues, batchFingerprint: digest([...new Set(issues.map(row => row.fingerprint))].sort()) };
}
