import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { sanitizeCommandEvent, sanitizePhaseDiagnostic } from './commandDiagnostics.js';

const identityOf = job => Object.fromEntries(['version', 'jobId', 'operation', 'projectId', 'contractId', 'contractHash', 'revision', 'artifactId', 'nonce', 'inputSha256', 'runId']
  .map(key => [key, job[key]]));
const TERMINAL_STATUSES = ['completed', 'failed', 'cancelled', 'failed_timeout', 'failed_interrupted'];
const SAVE_COALESCE_MS = 1000;
const bulkInputOf = job => job.archiveBase64 ?? job.packageJsonBase64;
const digestOf = value => createHash('sha256').update(String(value ?? '')).digest('hex');
// A finished job keeps its identity, result and an input digest; the multi-megabyte
// payload is only needed while the job can still run.
function dropBulkInputs(job) {
  const source = bulkInputOf(job);
  if (source === undefined) return false;
  job.inputDigest = digestOf(source);
  delete job.archiveBase64;
  delete job.packageJsonBase64;
  return true;
}
function failureDiagnostics(job, status, result) {
  if (!job.diagnostics || !['failed', 'cancelled', 'failed_timeout', 'failed_interrupted'].includes(status)) return result;
  return { ...result, diagnostics: { phases: structuredClone(job.diagnostics.phases || []), commands: job.diagnostics.commands.slice(-64).map(command => ({ ...command,
    ...(status === 'failed_timeout' && command.endedAt === undefined ? { timedOut: true } : {}) })) } };
}

export class JobStore {
  constructor(dbPath = ':memory:', { saveCoalesceMs = SAVE_COALESCE_MS } = {}) {
    this.dbPath = dbPath;
    this.isMemory = dbPath === ':memory:';
    this.saveCoalesceMs = saveCoalesceMs;
    this.saveTimer = null;
    this.lastDiagnosticSaveAt = 0;
    this.jobs = new Map();

    if (!this.isMemory) {
      fs.mkdirSync(path.dirname(dbPath), { recursive: true });
      if (fs.existsSync(dbPath)) {
        try {
          const data = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
          if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Invalid jobs document');
          let recovered = false;
          for (const [jobId, job] of Object.entries(data)) {
            if (!job || typeof job !== 'object' || job.jobId !== jobId || typeof job.status !== 'string') throw new Error('Invalid job record');
            if (job.status === 'running') {
              job.status = 'failed_interrupted';
              job.completedAt = Date.now();
              if (job.diagnostics) job.result = { ...failureDiagnostics(job, job.status, { error: 'Worker interrupted during execution' }), ...identityOf(job) };
              delete job.diagnosticsLease;
              recovered = true;
            } else if (TERMINAL_STATUSES.includes(job.status) && !Number.isFinite(job.completedAt)) {
              job.completedAt = Date.now();
              recovered = true;
            }
            if (TERMINAL_STATUSES.includes(job.status) && dropBulkInputs(job)) recovered = true;
            this.jobs.set(jobId, job);
          }
          if (recovered) this._save();
        } catch (error) {
          throw new Error('Cannot load job store: corrupt or unreadable persistence. Restore it before starting the worker.', { cause: error });
        }
      }
    }
  }

  // Diagnostic events arrive per command; rewriting the whole file for each one blocks the
  // event loop. The first event of a quiet period is written at once so a crash still keeps it;
  // later ones within the interval share one trailing write. Terminal transitions, begin and
  // close always write immediately.
  _saveSoon() {
    if (this.isMemory || this.saveTimer) return;
    const wait = this.saveCoalesceMs - (Date.now() - this.lastDiagnosticSaveAt);
    if (wait <= 0) { this._saveDiagnostics(); return; }
    this.saveTimer = setTimeout(() => this._saveDiagnostics(), wait);
    this.saveTimer.unref?.();
  }

  _saveDiagnostics() {
    this._save();
    this.lastDiagnosticSaveAt = Date.now();
  }

  _save() {
    if (this.saveTimer) { clearTimeout(this.saveTimer); this.saveTimer = null; }
    if (this.isMemory) return;
    const tmp = this.dbPath + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(Object.fromEntries(this.jobs)));
    fs.renameSync(tmp, this.dbPath);
  }

  insertJob(job) {
    const now = Date.now();
    for (const [id, j] of this.jobs.entries()) {
      if (j.deadline <= now && (j.status === 'pending' || j.status === 'running')) {
        this.updateJobStatus(id, j.status, 'failed_timeout', { error: 'Deadline exceeded during expiry sweep' });
      }
      if (j.completedAt && (now - j.completedAt) > 24 * 60 * 60 * 1000) this.jobs.delete(id);
    }

    const identity = ['version', 'jobId', 'operation', 'projectId', 'contractId', 'contractHash', 'revision', 'artifactId', 'nonce', 'inputSha256', 'runId'];
    if (this.jobs.has(job.jobId)) {
      const existing = this.jobs.get(job.jobId);
      // Finished jobs no longer hold their payload; compare the digest recorded when it was dropped.
      const sameInput = existing.inputDigest !== undefined
        ? existing.inputDigest === digestOf(bulkInputOf(job))
        : existing.packageJsonBase64 === job.packageJsonBase64 && existing.archiveBase64 === job.archiveBase64;
      const sameIdentity = identity.every(key => existing[key] === job[key])
        && sameInput
        && JSON.stringify(existing.contract) === JSON.stringify(job.contract);
      if (!sameIdentity) throw new Error('Duplicate jobId with different input');
      return 'exists';
    }
    let active = 0;
    for (const j of this.jobs.values()) if (j.status === 'pending' || j.status === 'running') active++;
    if (active >= 8) throw new Error('Queue capacity exceeded');
    this.jobs.set(job.jobId, { ...job, status: 'pending' });
    this._save();
    return 'inserted';
  }
  
  getNextPendingJob() {
    for (const j of this.jobs.values()) if (j.status === 'pending') return j;
    return null;
  }

  getJob(jobId, projectId) {
    const job = this.jobs.get(jobId);
    if (!job || job.projectId !== projectId) return null;
    return job;
  }

  updateJobStatus(jobId, fromStatus, toStatus, result = null) {
    const job = this.jobs.get(jobId);
    if (!job || job.status !== fromStatus) return false;
    job.status = toStatus;
    if (result) result = failureDiagnostics(job, toStatus, result);
    if (result) {
      job.result = { ...result, ...identityOf(job) };
    }
    if (TERMINAL_STATUSES.includes(toStatus)) {
      job.completedAt = Date.now();
      delete job.diagnosticsLease;
      dropBulkInputs(job);
    }
    this._save();
    return true;
  }

  beginDiagnostics(jobId, lease) {
    const job = this.jobs.get(jobId);
    if (!job || job.status !== 'running' || job.diagnosticsLease || typeof lease !== 'string' || !lease) return false;
    job.diagnosticsLease = lease;
    job.diagnostics = { commands: [] };
    this._save();
    return true;
  }

  recordCommandDiagnostic(jobId, lease, event) {
    const job = this.jobs.get(jobId);
    if (!job || job.status !== 'running' || job.diagnosticsLease !== lease) return false;
    const safe = sanitizeCommandEvent(event);
    if (!safe) return false;
    const commands = job.diagnostics.commands;
    const existing = commands.find(command => command.commandId === safe.commandId);
    if (event.state === 'started') {
      if (existing) return false;
      commands.push(safe);
      if (commands.length > 64) commands.shift();
    } else {
      if (!existing || existing.endedAt !== undefined || safe.endedAt < existing.startedAt) return false;
      Object.assign(existing, safe);
    }
    this._saveSoon();
    return true;
  }

  recordPhaseDiagnostic(jobId, lease, event) {
    const job = this.jobs.get(jobId);
    if (!job || job.status !== 'running' || job.diagnosticsLease !== lease) return false;
    const safe = sanitizePhaseDiagnostic(event);
    if (!safe) return false;
    const phases = job.diagnostics.phases ||= [];
    if (phases.some(row => row.phase === safe.phase)) return false;
    while (safe.checks.length && Buffer.byteLength(JSON.stringify([...phases, safe])) > 512 * 1024) {
      safe.checks.pop(); safe.truncated = true;
    }
    phases.push(safe); this._saveSoon(); return true;
  }
  

  hasJob(jobId) {
    return this.jobs.has(jobId);
  }
  deleteJob(jobId) {
    const deleted = this.jobs.delete(jobId);
    if (deleted) this._save();
  }

  close() {
    if (this.saveTimer) this._save();
  }
}
