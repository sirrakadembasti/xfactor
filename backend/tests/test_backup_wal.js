import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createBackup } from '../backupRestore.js';

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'xfactor-wal-'));
const dbPath = path.join(root, 'source.db');
const db = new DatabaseSync(dbPath);
try {
  db.exec('PRAGMA journal_mode=WAL; PRAGMA wal_autocheckpoint=0; CREATE TABLE evidence(value TEXT);');
  db.prepare('INSERT INTO evidence VALUES (?)').run('committed-in-wal');
  await fs.mkdir(path.join(root, 'projects'));
  await fs.mkdir(path.join(root, 'artifacts'));
  const snapshot = await createBackup({ dbPath, projectsRoot: path.join(root, 'projects'),
    artifactsRoot: path.join(root, 'artifacts'), destination: path.join(root, 'snapshot'), offline: true });
  const copy = new DatabaseSync(path.join(snapshot.root, 'db', 'projects.db'));
  try { assert.equal(copy.prepare('SELECT value FROM evidence').get().value, 'committed-in-wal'); }
  finally { copy.close(); }
} finally { db.close(); await fs.rm(root, { recursive: true, force: true }); }
console.log('test_backup_wal passed');
