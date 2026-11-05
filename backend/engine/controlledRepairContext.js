import { db } from '../db.js';
import { collectArtifactFiles } from '../artifactInventory.js';
import { getProjectDir } from '../projectRepository.js';
import { digest } from '../verification/workerFailures.js';
import { snapshotHash } from './workerRepairs.js';
import { redactSensitiveText } from '../observability.js';

const stale = message => { throw Object.assign(new Error(message), { code: 'CONTROLLED_REPAIR_STALE', status: 409 }); };
function diagnosticStream(evidence, name) {
    let value = typeof evidence[name] === 'string' ? evidence[name] : typeof evidence.evidence?.[name] === 'string' ? evidence.evidence[name] : '';
    const observation = evidence.processObservation || evidence.evidence?.processObservation;
    if (typeof observation?.[name] === 'string' && observation[name] && observation[name] !== value) {
        value += `\nObserved service output:\n${observation[name]}`;
    }
    value = redactSensitiveText(value);
    const marker = '\n[diagnostic excerpt truncated; final stack retained]\n';
    return value.length <= 8000 ? value : value.slice(0, 3000) + marker + value.slice(-(8000 - 3000 - marker.length));
}
export function assertControlledRepairBaseline(context, database = db) {
    const { projectId, contract, run, artifact } = context;
    const current = database.prepare("SELECT * FROM project_contracts WHERE project_id=? AND status='approved' ORDER BY revision DESC LIMIT 1").get(projectId);
    const latestRun = database.prepare('SELECT * FROM verification_runs WHERE project_id=? AND contract_id=? ORDER BY started_at DESC,rowid DESC LIMIT 1').get(projectId, contract.id);
    const latestArtifact = database.prepare('SELECT * FROM artifacts WHERE project_id=? AND contract_id=? ORDER BY rowid DESC LIMIT 1').get(projectId, contract.id);
    if (current?.id !== contract.id || current?.contract_hash !== contract.contract_hash || current?.revision !== contract.revision
        || latestRun?.id !== run.id || latestRun?.status !== 'failed' || latestArtifact?.id !== artifact.id
        || latestArtifact?.sha256 !== artifact.sha256 || latestArtifact?.verification_run_id !== run.id) stale('Onarımın sözleşme veya doğrulama kaydı değişti.');
}
// This application-owned reader is the only source access in proposal preparation.
// A fresh worker lock may differ from disk; every other artifact byte must match.
export async function readControlledRepairContext(projectId, options = {}) {
    const database = options.database ?? db;
    const contract = database.prepare("SELECT * FROM project_contracts WHERE project_id=? AND status='approved' ORDER BY revision DESC LIMIT 1").get(projectId);
    if (!contract) stale('Onaylı sözleşme bulunamadı.');
    const run = database.prepare('SELECT * FROM verification_runs WHERE project_id=? AND contract_id=? ORDER BY started_at DESC,rowid DESC LIMIT 1').get(projectId, contract.id);
    if (run?.status !== 'failed') stale('En son doğrulama başarısız ve tamamlanmış olmalıdır.');
    const artifact = database.prepare('SELECT * FROM artifacts WHERE project_id=? AND contract_id=? ORDER BY rowid DESC LIMIT 1').get(projectId, contract.id);
    if (!artifact || artifact.verification_run_id !== run.id) stale('Son kaynak paketi ile doğrulama eşleşmiyor.');
    const baseline = database.prepare('SELECT path,sha256 FROM artifact_files WHERE artifact_id=? AND contract_id=?').all(artifact.id, contract.id);
    const rawFiles = await (options.readFiles ?? collectArtifactFiles)((options.getDir ?? getProjectDir)(projectId));
    const files = rawFiles.map(file => ({ ...file, sha256: digest(file.content) }));
    assertControlledRepairBaseline({ projectId, contract, run, artifact }, database);
    if (!baseline.length || snapshotHash(baseline) !== snapshotHash(files)) stale('Mevcut kaynak başarısız paketten sonra değişmiş; eski hatalarla onarım önerilemez.');
    const checks = database.prepare('SELECT * FROM verification_checks WHERE run_id=? AND contract_id=?').all(run.id, contract.id).map(check => {
        let evidence;
        try { evidence = JSON.parse(check.evidence_json || '{}'); } catch { stale('Doğrulama kanıtı okunamıyor.'); }
        if (!evidence || typeof evidence !== 'object' || Array.isArray(evidence)) stale('Doğrulama kanıtı geçersiz.');
        return { id: check.id, run_id: check.run_id, contract_id: check.contract_id, gate_name: check.gate_name,
            status: check.status, applicability: check.applicability,
            reason: redactSensitiveText([
                evidence.reason,
                ...(Array.isArray(evidence.issues) ? evidence.issues : []),
                ...(Array.isArray(evidence.journeys) ? evidence.journeys.map(journey => journey?.reason) : [])
            ].filter(value => typeof value === 'string' && value).join('\n')).slice(0, 4000),
            stdout: diagnosticStream(evidence, 'stdout'),
            stderr: diagnosticStream(evidence, 'stderr') };
    });
    const projectedRequirementIds = database.prepare(`SELECT DISTINCT r.stable_key FROM requirements r
        JOIN requirement_task_links l ON l.contract_id=r.contract_id AND l.requirement_id=r.id
        JOIN contract_tasks t ON t.contract_id=l.contract_id AND t.id=l.task_id WHERE r.contract_id=? ORDER BY r.stable_key`).all(contract.id).map(row => row.stable_key);
    return { projectId, contract, run, artifact, files, checks, projectedRequirementIds };
}
