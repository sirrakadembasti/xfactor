import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import JSZip from 'jszip';

const DEFAULT_LIMITS = Object.freeze({ maxFiles: 20_000, maxBytes: 512 * 1024 * 1024 });
const HEX_SHA256 = /^[a-f0-9]{64}$/i;

const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const resolveRoot = value => path.resolve(String(value || ''));

async function assertDirectory(root, label, { create = false } = {}) {
    const resolved = resolveRoot(root);
    if (!resolved || resolved === path.parse(resolved).root) throw new Error(`${label} root is unsafe.`);
    if (create) await fs.mkdir(resolved, { recursive: true });
    const stat = await fs.lstat(resolved).catch(() => null);
    if (!stat || !stat.isDirectory() || stat.isSymbolicLink()) throw new Error(`${label} root must be an owned directory.`);
    return resolved;
}

function safeRelative(relative, label) {
    const normalized = path.posix.normalize(String(relative).replace(/\\/g, '/'));
    if (!normalized || normalized === '.' || normalized.startsWith('../') || path.posix.isAbsolute(normalized)) {
        throw new Error(`${label} contains an unsafe path: ${relative}`);
    }
    return normalized;
}

function ensureWithin(root, candidate, label) {
    const relative = path.relative(root, candidate);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error(`${label} escapes its owned root.`);
    return relative;
}

async function collectFiles(root, section, limits) {
    const files = [];
    let totalBytes = 0;
    async function walk(current, relative = '') {
        const stat = await fs.lstat(current);
        if (stat.isSymbolicLink()) throw new Error(`Symlink is not allowed in ${section}: ${relative}`);
        if (stat.isDirectory()) {
            for (const entry of (await fs.readdir(current, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
                await walk(path.join(current, entry.name), path.posix.join(relative, entry.name));
            }
            return;
        }
        if (!stat.isFile()) throw new Error(`Unsupported ${section} entry: ${relative}`);
        if (files.length >= limits.maxFiles || totalBytes + stat.size > limits.maxBytes) {
            throw new Error(`Backup limits exceeded in ${section}.`);
        }
        const rel = safeRelative(relative, section);
        const bytes = await fs.readFile(current);
        if (bytes.length !== stat.size) throw new Error(`${section} changed while backing up: ${rel}`);
        totalBytes += bytes.length;
        files.push({ section, path: rel, size: bytes.length, sha256: digest(bytes) });
    }
    await walk(root);
    return { files, totalBytes };
}

async function copyManifestFiles(sourceRoot, destinationRoot, entries) {
    for (const entry of entries) {
        const relative = safeRelative(entry.path, entry.section);
        const source = path.join(sourceRoot, relative);
        const destination = path.join(destinationRoot, relative);
        ensureWithin(sourceRoot, source, entry.section);
        ensureWithin(destinationRoot, destination, entry.section);
        const stat = await fs.lstat(source);
        if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`Snapshot entry is not a regular file: ${entry.section}/${relative}`);
        const bytes = await fs.readFile(source);
        if (bytes.length !== Number(entry.size) || digest(bytes) !== entry.sha256) {
            throw new Error(`Snapshot hash mismatch: ${entry.section}/${relative}`);
        }
        await fs.mkdir(path.dirname(destination), { recursive: true });
        await fs.writeFile(destination, bytes, { flag: 'wx' });
    }
}

async function withQuiescence(lifecycle, work) {
    let release = null;
    if (lifecycle?.quiesce) release = await lifecycle.quiesce();
    else lifecycle?.refuseNewGeneration?.();
    try { return await work(); } finally { await release?.(); }
}

export async function createBackup({
    dbPath,
    projectsRoot,
    artifactsRoot,
    destination,
    lifecycle = null,
    offline = false,
    checkpoint = null,
    limits = DEFAULT_LIMITS
} = {}) {
    const databasePath = String(dbPath || '');
    if (!lifecycle?.quiesce && !offline) throw new Error('Backup requires a quiesced lifecycle or offline mode with all writers stopped.');
    if (!databasePath || databasePath === ':memory:' || !path.isAbsolute(databasePath)) throw new Error('Backup requires an absolute SQLite DB path.');
    const databaseFile = resolveRoot(databasePath);
    const projects = await assertDirectory(projectsRoot, 'Projects');
    const artifacts = await assertDirectory(artifactsRoot, 'Artifacts');
    const target = await assertDirectory(destination, 'Backup destination', { create: true });
    if ((await fs.readdir(target)).length !== 0) throw new Error('Backup destination must be empty.');
    const dbParent = path.dirname(databaseFile);
    if (target === projects || target === artifacts || target === dbParent
        || target.startsWith(`${projects}${path.sep}`) || target.startsWith(`${artifacts}${path.sep}`)) {
        throw new Error('Backup destination overlaps a source root.');
    }

    return withQuiescence(lifecycle, async () => {
        await checkpoint?.();
        const dbStat = await fs.lstat(databaseFile).catch(() => null);
        if (!dbStat?.isFile() || dbStat.isSymbolicLink()) throw new Error('SQLite DB must be a regular owned file.');
        await fs.mkdir(path.join(target, 'db'), { recursive: true });
        // SQLite reads committed WAL pages too; copying the main file alone loses them.
        const sourceDatabase = new DatabaseSync(databaseFile, { readOnly: true });
        try {
            sourceDatabase.exec(`VACUUM INTO '${path.join(target, 'db', 'projects.db').replace(/'/g, "''")}'`);
        } finally { sourceDatabase.close(); }
        const dbBytes = await fs.readFile(path.join(target, 'db', 'projects.db'));
        const projectInventory = await collectFiles(projects, 'projects', limits);
        const artifactInventory = await collectFiles(artifacts, 'artifacts', limits);
        const manifest = {
            schemaVersion: 1,
            createdAt: new Date().toISOString(),
            roots: { dbPath: databaseFile, projectsRoot: projects, artifactsRoot: artifacts },
            files: [
                { section: 'db', path: 'projects.db', size: dbBytes.length, sha256: digest(dbBytes) },
                ...projectInventory.files,
                ...artifactInventory.files
            ]
        };
        await fs.mkdir(path.join(target, 'db'), { recursive: true });
        await fs.mkdir(path.join(target, 'projects'), { recursive: true });
        await fs.mkdir(path.join(target, 'artifacts'), { recursive: true });
        await copyManifestFiles(projects, path.join(target, 'projects'), projectInventory.files);
        await copyManifestFiles(artifacts, path.join(target, 'artifacts'), artifactInventory.files);
        await fs.writeFile(path.join(target, 'manifest.json'), JSON.stringify(manifest, null, 2), { flag: 'wx' });
        return { root: target, manifest };
    });
}

function parseManifest(value) {
    if (!value || value.schemaVersion !== 1 || !Array.isArray(value.files) || !value.roots) throw new Error('Invalid backup manifest.');
    const seen = new Set();
    for (const file of value.files) {
        if (!['db', 'projects', 'artifacts'].includes(file.section)) throw new Error('Backup manifest has an invalid section.');
        const key = `${file.section}/${safeRelative(file.path, file.section)}`;
        if (seen.has(key) || !Number.isSafeInteger(Number(file.size)) || Number(file.size) < 0 || !HEX_SHA256.test(file.sha256)) throw new Error(`Invalid backup manifest entry: ${key}`);
        seen.add(key);
    }
    if (!value.files.some(file => file.section === 'db' && file.path === 'projects.db')) throw new Error('Backup manifest has no database entry.');
    return value;
}

async function assertSnapshotComplete(root, manifest) {
    for (const section of ['db', 'projects', 'artifacts']) {
        const sectionRoot = path.join(root, section);
        const entries = await fs.lstat(sectionRoot).catch(() => null);
        if (!entries?.isDirectory() || entries.isSymbolicLink()) throw new Error(`Snapshot section ${section} is missing or unsafe.`);
    }
    const expected = new Set(manifest.files.map(file => `${file.section}/${safeRelative(file.path, file.section)}`));
    async function walk(section, current, relative = '') {
        for (const entry of await fs.readdir(current, { withFileTypes: true })) {
            const nextRelative = path.posix.join(relative, entry.name);
            const full = path.join(current, entry.name);
            const stat = await fs.lstat(full);
            if (stat.isSymbolicLink()) throw new Error(`Symlink is not allowed in snapshot: ${section}/${nextRelative}`);
            if (stat.isDirectory()) await walk(section, full, nextRelative);
            else if (!expected.has(`${section}/${nextRelative}`)) throw new Error(`Unexpected snapshot file: ${section}/${nextRelative}`);
        }
    }
    for (const section of ['db', 'projects', 'artifacts']) await walk(section, path.join(root, section));
    for (const entry of manifest.files) {
        const full = path.join(root, entry.section, safeRelative(entry.path, entry.section));
        const bytes = await fs.readFile(full);
        if (bytes.length !== Number(entry.size) || digest(bytes) !== entry.sha256) throw new Error(`Snapshot hash mismatch: ${entry.section}/${entry.path}`);
    }
}

async function validateReceiptArtifacts(database, stagingRoot, originalArtifactsRoot) {
    const hasTable = database.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='completion_receipts'").get();
    if (!hasTable) return 0;
    const receipts = database.prepare(`SELECT DISTINCT a.id, a.contract_id, a.path, a.sha256, a.size, a.manifest_json
        FROM completion_receipts r JOIN artifacts a ON a.contract_id = r.contract_id AND a.id = r.artifact_id`).all();
    for (const artifact of receipts) {
        const originalRoot = path.resolve(originalArtifactsRoot);
        const sourcePath = path.isAbsolute(artifact.path)
            ? artifact.path
            : path.resolve(originalRoot, artifact.path);
        const relative = path.relative(originalRoot, sourcePath);
        if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
            throw new Error(`Receipt artifact path escapes owned artifacts root: ${artifact.id}`);
        }
        const archivePath = path.join(stagingRoot, 'artifacts', relative);
        const bytes = await fs.readFile(archivePath).catch(() => { throw new Error(`Receipt artifact is missing: ${artifact.id}`); });
        if (bytes.length !== Number(artifact.size) || digest(bytes) !== artifact.sha256) throw new Error(`Receipt artifact hash mismatch: ${artifact.id}`);
        const zip = await JSZip.loadAsync(bytes).catch(() => null);
        if (!zip) continue;
        const rows = database.prepare('SELECT path, sha256, size FROM artifact_files WHERE contract_id = ? AND artifact_id = ? ORDER BY path').all(artifact.contract_id, artifact.id);
        for (const row of rows) {
            const relativePath = safeRelative(row.path, 'artifact');
            const entry = zip.file(relativePath);
            if (!entry) throw new Error(`Receipt-linked file is missing: ${artifact.id}/${relativePath}`);
            const fileBytes = await entry.async('nodebuffer');
            if (fileBytes.length !== Number(row.size) || digest(fileBytes) !== row.sha256) throw new Error(`Receipt-linked file hash mismatch: ${artifact.id}/${relativePath}`);
        }
    }
    return receipts.length;
}

export async function restoreBackup(snapshotRoot, targetRoot, { limits = DEFAULT_LIMITS } = {}) {
    const snapshot = await assertDirectory(snapshotRoot, 'Snapshot');
    const target = resolveRoot(targetRoot);
    if (!target || target === path.parse(target).root) throw new Error('Restore target is unsafe.');
    const existing = await fs.lstat(target).catch(() => null);
    if (existing?.isSymbolicLink() || (existing && !existing.isDirectory())) throw new Error('Restore target must be a fresh empty directory.');
    if (existing && (await fs.readdir(target)).length !== 0) throw new Error('Restore target must be a fresh empty directory.');
    const rawManifest = JSON.parse(await fs.readFile(path.join(snapshot, 'manifest.json'), 'utf8'));
    const manifest = parseManifest(rawManifest);
    if (manifest.files.length > limits.maxFiles || manifest.files.reduce((sum, file) => sum + Number(file.size), 0) > limits.maxBytes) throw new Error('Restore limits exceeded.');
    await assertSnapshotComplete(snapshot, manifest);

    const staging = `${target}.staging-${crypto.randomUUID()}`;
    await fs.mkdir(staging, { recursive: true });
    try {
        await fs.mkdir(path.join(staging, 'data'), { recursive: true });
        await fs.mkdir(path.join(staging, 'projects'), { recursive: true });
        await fs.mkdir(path.join(staging, 'artifacts'), { recursive: true });
        const dbEntry = manifest.files.find(file => file.section === 'db' && file.path === 'projects.db');
        await fs.copyFile(path.join(snapshot, 'db', dbEntry.path), path.join(staging, 'data', 'projects.db'), fsSync.constants.COPYFILE_EXCL);
        await copyManifestFiles(path.join(snapshot, 'projects'), path.join(staging, 'projects'), manifest.files.filter(file => file.section === 'projects'));
        await copyManifestFiles(path.join(snapshot, 'artifacts'), path.join(staging, 'artifacts'), manifest.files.filter(file => file.section === 'artifacts'));

        const database = new DatabaseSync(path.join(staging, 'data', 'projects.db'));
        try {
            const integrity = database.prepare('PRAGMA integrity_check').get();
            if (integrity?.integrity_check !== 'ok') throw new Error('Restored SQLite integrity check failed.');
            const receiptCount = await validateReceiptArtifacts(database, staging, manifest.roots.artifactsRoot);
            database.exec('BEGIN IMMEDIATE;');
            try {
                const artifacts = database.prepare('SELECT id, contract_id, path FROM artifacts').all();
                const sourceRoot = path.resolve(manifest.roots.artifactsRoot);
                for (const artifact of artifacts) {
                    const sourcePath = path.isAbsolute(artifact.path) ? artifact.path : path.resolve(sourceRoot, artifact.path);
                    const relative = path.relative(sourceRoot, sourcePath);
                    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error(`Artifact path escapes owned artifacts root: ${artifact.id}`);
                    const restoredPath = path.join(staging, 'artifacts', relative);
                    if (!fsSync.existsSync(restoredPath)) throw new Error(`Artifact file missing during restore: ${artifact.id}`);
                    database.prepare('UPDATE artifacts SET path = ? WHERE id = ? AND contract_id = ?').run(path.join(target, 'artifacts', relative), artifact.id, artifact.contract_id);
                }
                database.exec('COMMIT;');
            } catch (error) {
                try { database.exec('ROLLBACK;'); } catch {}
                throw error;
            }
            database.close();
            await fs.rename(staging, target);
            return {
                root: target,
                dbPath: path.join(target, 'data', 'projects.db'),
                projectsRoot: path.join(target, 'projects'),
                artifactsRoot: path.join(target, 'artifacts'),
                receiptCount,
                manifest
            };
        } finally {
            try { database.close(); } catch {}
        }
    } catch (error) {
        await fs.rm(staging, { recursive: true, force: true }).catch(() => {});
        throw error;
    }
}
