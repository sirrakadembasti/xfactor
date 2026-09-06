import fs from 'node:fs';
import path from 'node:path';

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
          for (const [jobId, job] of Object.entries(data)) {
            if (job.status === 'running') job.status = 'failed_interrupted';
            this.jobs.set(jobId, job);
          }
        } catch {}
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
         j.status = 'failed_timeout';
         j.completedAt = now;
      }
      if (j.completedAt && (now - j.completedAt) > 24 * 60 * 60 * 1000) {
         this.jobs.delete(id);
      }
    }
    
    if (this.jobs.has(job.jobId)) {
      const existing = this.jobs.get(job.jobId);
      const isExactMatch = 
        existing.version === job.version &&
        existing.operation === job.operation &&
        existing.projectId === job.projectId &&
        existing.contractId === job.contractId &&
        existing.contractHash === job.contractHash &&
        existing.revision === job.revision &&
        existing.artifactId === job.artifactId &&
        existing.archiveBase64 === job.archiveBase64 &&
        existing.nonce === job.nonce &&
        existing.inputSha256 === job.inputSha256 &&
        JSON.stringify(existing.contract) === JSON.stringify(job.contract);
        
      if (!isExactMatch) {
        throw new Error('Duplicate jobId with different input');
      }
      return 'exists';
    }

    let active = 0;
    for (const j of this.jobs.values()) {
      if (j.status === 'pending' || j.status === 'running') active++;
    }
    if (active >= 8) throw new Error('Queue capacity exceeded');

    this.jobs.set(job.jobId, { ...job, status: 'pending' });
    this._save();
    return 'inserted';
  }
  
  getNextPendingJob() {
    for (const j of this.jobs.values()) {
      if (j.status === 'pending') return j;
    }
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
    if (result) {
       job.result = result;
    }
    if (toStatus === 'completed' || toStatus === 'failed' || toStatus === 'cancelled') {
       job.completedAt = Date.now();
    }
    this._save();
    return true;
  }

  deleteJob(jobId) {
    const deleted = this.jobs.delete(jobId);
    if (deleted) this._save();
  }

  close() {}
}
