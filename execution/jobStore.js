import fs from 'node:fs';
import path from 'node:path';
import { sanitizeCommandEvent, sanitizePhaseDiagnostic } from './commandDiagnostics.js';

const identityOf = job => Object.fromEntries(['version', 'jobId', 'operation', 'projectId', 'contractId', 'contractHash', 'revision', 'artifactId', 'nonce', 'inputSha256', 'runId']
  .map(key => [key, job[key]]));
function failureDiagnostics(job, status, result) {
  if (!job.diagnostics || !['failed', 'cancelled', 'failed_timeout', 'failed_interrupted'].includes(status)) return result;
  return { ...result, diagnostics: { phases: structuredClone(job.diagnostics.phases || []), commands: job.diagnostics.commands.slice(-64).map(command => ({ ...command,
    ...(status === 'failed_timeout' && command.endedAt === undefined ? { timedOut: true } : {}) })) } };
}

export class JobStore {
  constructor(dbPath = ':memory:') {
    this.dbPath = dbPath;
    this.isMemory = dbPath === ':memory:';
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
            } else if (['completed', 'failed', 'cancelled', 'failed_timeout', 'failed_interrupted'].includes(job.status) && !Number.isFinite(job.completedAt)) {
              job.completedAt = Date.now();
              recovered = true;
            }
            this.jobs.set(jobId, job);
          }
          if (recovered) this._save();
        } catch (error) {
          throw new Error('Cannot load job store: corrupt or unreadable persistence. Restore it before starting the worker.', { cause: error });
        }
      }
    }
  }

  _save() {
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
      const sameIdentity = identity.every(key => existing[key] === job[key])
        && existing.packageJsonBase64 === job.packageJsonBase64
        && existing.archiveBase64 === job.archiveBase64
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
    if (toStatus === 'completed' || toStatus === 'failed' || toStatus === 'cancelled' || toStatus === 'failed_timeout' || toStatus === 'failed_interrupted') {
      job.completedAt = Date.now();
      delete job.diagnosticsLease;
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
    this._save();
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
    phases.push(safe); this._save(); return true;
  }
  

  hasJob(jobId) {
    return this.jobs.has(jobId);
  }
  deleteJob(jobId) {
    const deleted = this.jobs.delete(jobId);
    if (deleted) this._save();
  }

  close() {}
}
