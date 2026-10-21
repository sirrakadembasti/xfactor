// Filesystem availability is separate from historical verification evidence.
// No imports of db.js: audits may open the database read-only without migrations.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { getArtifactsRoot } from '../artifactPaths.js';
import { getProjectsRoot, isValidProjectId } from '../projectPaths.js';

const DAY = 86400000;
const digest = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const same = (a, b) => process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
const pathKey = value => process.platform === 'win32' ? path.resolve(value).toLowerCase() : path.resolve(value);
function directFile(root, filename) {
    const resolved = path.resolve(filename);
    if (!same(path.dirname(resolved), path.resolve(root))) throw new Error('Artifact path is outside its owned root');
    const rootStat = fs.lstatSync(root);
    if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) throw new Error('Storage root must be a real directory');
    if (fs.existsSync(resolved)) {
        const stat = fs.lstatSync(resolved);
        if (!stat.isFile() || stat.isSymbolicLink()
            || !same(path.dirname(fs.realpathSync(resolved)), fs.realpathSync(root))) {
            throw new Error('Artifact is not an owned regular file');
        }
    }
    return resolved;
}
export function artifactAvailability(artifact) {
    try {
        const stat = fs.lstatSync(artifact.path);
        if (!stat.isFile() || stat.isSymbolicLink()) return 'unsafe_path';
        if (stat.size !== artifact.size || digest(artifact.path) !== artifact.sha256) return 'hash_mismatch';
        return 'available';
    } catch (error) { return error.code === 'ENOENT' ? 'missing' : 'unreadable'; }
}
function roots(env) {
    const artifactsRoot = getArtifactsRoot(env), projectsRoot = getProjectsRoot(env);
    for (const root of [artifactsRoot, projectsRoot]) {
        const stat = fs.lstatSync(root);
        if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error(`Storage root is unavailable or unsafe: ${root}`);
        fs.readdirSync(root);
    }
    return { artifactsRoot, projectsRoot };
}
function hasQueue(database) {
    return Boolean(database.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='artifact_maintenance'").get());
}
export function auditArtifacts({ database, env = process.env, now = Date.now() }) {
    let storage;
    try { storage = roots(env); } catch (error) {
        return { success: false, error: error.message, artifacts: [], projects: [], orphans: [], candidates: [] };
    }
    const rows = database.prepare('SELECT * FROM artifacts').all();
    const protectedIds = new Set(database.prepare('SELECT artifact_id FROM completion_receipts').all().map(r => r.artifact_id));
    const activeIds = new Set(database.prepare("SELECT project_id FROM workflow_attempts WHERE status = 'running'").all().map(r => r.project_id));
    const projects = database.prepare('SELECT id, status FROM projects').all().map(p => ({
        id: p.id, status: p.status,
        sourceAvailability: (() => {
            try {
                if (!isValidProjectId(p.id)) return 'unsafe_path';
                const stat = fs.lstatSync(path.join(storage.projectsRoot, p.id));
                return stat.isDirectory() && !stat.isSymbolicLink() ? 'available' : 'unsafe_path';
            } catch (error) { return error.code === 'ENOENT' ? 'missing' : 'unreadable'; }
        })()
    }));
    const projectMap = new Map(projects.map(p => [p.id, p]));
    const known = new Set(rows.map(r => pathKey(r.path)));
    const maintenance = hasQueue(database) ? database.prepare('SELECT * FROM artifact_maintenance').all() : [];
    const pending = new Set(maintenance.filter(r => ['pending', 'quarantined'].includes(r.phase)).map(r => pathKey(r.source_path)));
    const artifacts = rows.map(row => {
        const protectedByReceipt = protectedIds.has(row.id);
        let availability = artifactAvailability(row);
        const quarantined = maintenance.find(m => m.phase === 'quarantined' && pathKey(m.source_path) === pathKey(row.path) && m.sha256 === row.sha256);
        if (availability === 'missing' && quarantined) {
            availability = artifactAvailability({ path: quarantined.quarantine_path, sha256: row.sha256, size: row.size }) === 'available' ? 'quarantined' : 'quarantine_missing';
        }
        let owned = false;
        try { directFile(storage.artifactsRoot, row.path); owned = true; } catch {}
        const eligible = owned && availability === 'available' && !protectedByReceipt
            && ['rejected', 'superseded'].includes(row.status) && !activeIds.has(row.project_id)
            && projectMap.has(row.project_id) && projectMap.get(row.project_id).status !== 'deleting'
            && now - Date.parse(row.created_at) >= 7 * DAY && !pending.has(pathKey(row.path));
        return { id: row.id, projectId: row.project_id, contractId: row.contract_id, status: row.status,
            sourcePath: row.path, sha256: row.sha256, availability, protectedByReceipt, eligible };
    });
    const orphans = [];
    for (const entry of fs.readdirSync(storage.artifactsRoot, { withFileTypes: true })) {
        if (!entry.name.endsWith('.zip') || !entry.isFile()) continue;
        const sourcePath = path.join(storage.artifactsRoot, entry.name);
        if (known.has(pathKey(sourcePath)) || pending.has(pathKey(sourcePath))) continue;
        try {
            directFile(storage.artifactsRoot, sourcePath);
            const stat = fs.statSync(sourcePath);
            orphans.push({ sourcePath, sha256: digest(sourcePath), size: stat.size,
                eligible: activeIds.size === 0 && now - stat.mtimeMs >= DAY, reason: 'unregistered' });
        } catch { /* Unsafe entries are never maintenance candidates. */ }
    }
    const groups = new Map();
    for (const row of [...artifacts.filter(a => a.availability === 'available'), ...orphans]) {
        const group = groups.get(row.sha256) || [];
        group.push(row.sourcePath); groups.set(row.sha256, group);
    }
    const duplicateContent = [...groups].filter(([, files]) => files.length > 1).map(([sha256, files]) => ({ sha256, files }));
    return { success: true, projects, artifacts, orphans, maintenance, duplicateContent,
        candidates: [...artifacts.filter(r => r.eligible).map(r => ({ ...r, reason: 'retention' })), ...orphans.filter(r => r.eligible)] };
}
function enqueue({ database, sourcePath, sha256, projectId = null, artifactId = null, reason, artifactsRoot, quarantineRoot = path.join(artifactsRoot, '.quarantine') }) {
    const existing = database.prepare("SELECT id,source_path FROM artifact_maintenance WHERE phase IN ('pending','quarantined')").all().find(r => pathKey(r.source_path) === pathKey(sourcePath));
    if (existing) return;
    const id = crypto.randomUUID();
    const target = path.join(quarantineRoot, `${id}.zip`);
    const now = new Date().toISOString();
    database.prepare(`INSERT INTO artifact_maintenance
        (id,project_id,artifact_id,source_path,quarantine_path,sha256,reason,phase,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,'pending',?,?)`).run(id, projectId, artifactId, sourcePath, target, sha256, reason, now, now);
}
// Called within the project deletion transaction, before CASCADE removes ownership.
export function queueProjectArtifacts({ database, projectId, env = process.env }) {
    const artifactsRoot = getArtifactsRoot(env);
    const rows = database.prepare('SELECT * FROM artifacts WHERE project_id = ?').all(projectId);
    // Do not lose ownership metadata while a configured storage volume is offline.
    if (rows.length) roots(env);
    for (const row of rows) {
        if (database.prepare('SELECT 1 FROM completion_receipts WHERE artifact_id = ?').get(row.id)) continue;
        let sourcePath;
        try {
            sourcePath = directFile(artifactsRoot, row.path);
        } catch { continue; /* External/unsafe files are never deletion targets. */ }
        // Journal failures must abort the surrounding project deletion transaction.
        enqueue({ database, sourcePath, sha256: row.sha256, projectId, artifactId: row.id, reason: 'project_deleted', artifactsRoot });
    }
    // An optional delivered copy is owned only if its bytes match a registered artifact.
    if (isValidProjectId(projectId)) {
        const copy = path.join(getProjectsRoot(env), `${projectId}.zip`);
        let copyHash = null;
        try {
            directFile(getProjectsRoot(env), copy);
            if (fs.existsSync(copy)) {
                copyHash = digest(copy);
            }
        } catch {}
        if (copyHash && rows.some(row => row.sha256 === copyHash)) enqueue({ database, sourcePath: copy, sha256: copyHash, projectId, reason: 'delivery_copy_deleted', artifactsRoot,
            quarantineRoot: path.join(getProjectsRoot(env), '.artifact-quarantine') });
    }
}
export function recoverArtifactMaintenance({ database, env = process.env }) {
    const result = { quarantined: [], pending: [], errors: [] };
    if (!hasQueue(database)) return result;
    let storage;
    try { storage = roots(env); } catch (error) { result.errors.push(error.message); return result; }
    for (const item of database.prepare("SELECT * FROM artifact_maintenance WHERE phase = 'pending' ORDER BY created_at,id").all()) {
        // Recheck while holding the write lock; another writer cannot pin a file during the move.
        database.exec('BEGIN IMMEDIATE');
        try {
            const current = database.prepare('SELECT phase FROM artifact_maintenance WHERE id = ?').get(item.id);
            if (current?.phase !== 'pending') { database.exec('COMMIT'); continue; }
            const refs = database.prepare('SELECT * FROM artifacts').all().filter(r => pathKey(r.path) === pathKey(item.source_path));
            const protectedRef = refs.some(r => database.prepare('SELECT 1 FROM completion_receipts WHERE artifact_id = ?').get(r.id)
                || !['rejected', 'superseded'].includes(r.status));
            if (protectedRef) throw new Error('Artifact acquired protected evidence or status');
            if (refs.some(r => r.sha256 !== item.sha256)) throw new Error('Artifact ownership hash changed');
            if (['project_deleted', 'unregistered'].includes(item.reason) && refs.length) throw new Error('Source now belongs to a registered artifact');
            if (refs.some(r => database.prepare("SELECT 1 FROM workflow_attempts WHERE project_id=? AND status='running'").get(r.project_id))) throw new Error('Referenced project has running production');
            if (item.reason === 'unregistered' && database.prepare("SELECT 1 FROM workflow_attempts WHERE status='running'").get()) throw new Error('Orphan maintenance waits for all production');
            if (item.project_id && database.prepare("SELECT 1 FROM workflow_attempts WHERE project_id = ? AND status = 'running'").get(item.project_id)) throw new Error('Project has running production');
            if (['project_deleted', 'delivery_copy_deleted'].includes(item.reason)
                && database.prepare('SELECT 1 FROM projects WHERE id = ?').get(item.project_id)) throw new Error('Project deletion has not committed');
            const sourceRoot = item.reason === 'delivery_copy_deleted' ? storage.projectsRoot : storage.artifactsRoot;
            const quarantineRoot = item.reason === 'delivery_copy_deleted' ? path.join(storage.projectsRoot, '.artifact-quarantine') : path.join(storage.artifactsRoot, '.quarantine');
            directFile(sourceRoot, item.source_path);
            fs.mkdirSync(quarantineRoot, { recursive: true });
            directFile(quarantineRoot, item.quarantine_path);
            if (!same(path.basename(item.quarantine_path), `${item.id}.zip`)) throw new Error('Invalid quarantine target');
            if (fs.existsSync(item.source_path)) {
                if (digest(item.source_path) !== item.sha256) throw new Error('Source hash changed');
                if (fs.existsSync(item.quarantine_path)) throw new Error('Quarantine target already exists');
                fs.renameSync(item.source_path, item.quarantine_path);
            } else if (!fs.existsSync(item.quarantine_path) || digest(item.quarantine_path) !== item.sha256) {
                throw new Error('Source and matching quarantine file are unavailable');
            }
            database.prepare("UPDATE artifact_maintenance SET phase='quarantined', error=NULL, updated_at=? WHERE id=?").run(new Date().toISOString(), item.id);
            database.exec('COMMIT'); result.quarantined.push(item.id);
        } catch (error) {
            try { database.exec('ROLLBACK'); } catch {}
            database.prepare('UPDATE artifact_maintenance SET error=?, updated_at=? WHERE id=?').run(error.message, new Date().toISOString(), item.id);
            result.pending.push(item.id); result.errors.push(error.message);
        }
    }
    return result;
}
export function quarantineCandidates({ database, env = process.env, candidates, now = Date.now() }) {
    database.exec('BEGIN IMMEDIATE');
    try {
        const fresh = auditArtifacts({ database, env, now });
        if (!fresh.success) throw new Error(fresh.error);
        const eligible = new Map(fresh.candidates.map(r => [pathKey(r.sourcePath), r]));
        for (const requested of candidates) {
            const row = eligible.get(pathKey(requested.sourcePath));
            if (!row || (requested.sha256 && requested.sha256 !== row.sha256)) continue;
            enqueue({ database, sourcePath: row.sourcePath, sha256: row.sha256, projectId: row.projectId,
                artifactId: row.id, reason: row.reason, artifactsRoot: getArtifactsRoot(env) });
        }
        database.exec('COMMIT');
    } catch (error) { database.exec('ROLLBACK'); throw error; }
    return recoverArtifactMaintenance({ database, env });
}
