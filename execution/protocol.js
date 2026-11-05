import crypto from 'node:crypto';
import { ARTIFACT_LIMITS } from '../backend/artifactLimits.js';
import { MAX_JOB_MS } from './limits.js';
const MAX_PACKAGE_BYTES = 4 * 1024 * 1024;
const MAX_ARCHIVE_BYTES = ARTIFACT_LIMITS.maxArchiveBytes;
const HEX64 = /^[a-f0-9]{64}$/;
function validId(value, max = 200) { return typeof value === 'string' && value.length > 0 && value.length <= max; }
function decodeBase64(value, maxBytes, field) {
  if (typeof value !== 'string' || value.length === 0 || value.length > Math.ceil(maxBytes * 4 / 3) + 4 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) return { error: `Invalid ${field}` };
  const bytes = Buffer.from(value, 'base64');
  if (bytes.length === 0 || bytes.length > maxBytes || bytes.toString('base64') !== value) return { error: `Invalid ${field}` };
  return { bytes };
}
export function validateJob(input, now = Date.now()) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { valid: false, reason: 'Invalid input format' };
  const allowed = new Set(['version','jobId','operation','projectId','contractId','contractHash','revision','artifactId','packageJsonBase64','archiveBase64','archiveSha256','contract','deadline','nonce','inputSha256','runId','verificationPlan']);
  for (const key of Object.keys(input)) if (!allowed.has(key)) return { valid: false, reason: `Unsupported field: ${key}` };
  const { version, jobId, operation, projectId, contractId, contractHash, revision, artifactId, packageJsonBase64, archiveBase64, archiveSha256, contract, deadline, nonce, inputSha256, runId } = input;
  if (version !== 1 || !validId(jobId, 100)) return { valid: false, reason: version !== 1 ? 'Invalid version' : 'Invalid jobId' };
  if (!['prepare_dependencies','verify_artifact'].includes(operation)) return { valid: false, reason: 'Invalid operation' };
  if (!validId(projectId) || !validId(contractId) || !validId(artifactId) || !validId(runId)) return { valid: false, reason: 'Invalid identity' };
  if (typeof contractHash !== 'string' || !HEX64.test(contractHash)) return { valid: false, reason: 'Invalid contractHash' };
  if (!Number.isSafeInteger(revision) || revision < 1) return { valid: false, reason: 'Invalid revision' };
  if (typeof nonce !== 'string' || !HEX64.test(nonce)) return { valid: false, reason: 'Invalid nonce' };
  if (typeof inputSha256 !== 'string' || !HEX64.test(inputSha256)) return { valid: false, reason: 'Invalid inputSha256' };
  if (archiveSha256 !== undefined && (typeof archiveSha256 !== 'string' || !HEX64.test(archiveSha256))) return { valid: false, reason: 'Invalid archiveSha256' };
  if (!Number.isSafeInteger(deadline) || deadline <= now || deadline - now > MAX_JOB_MS) return { valid: false, reason: 'Expired or invalid deadline' };
  if (!contract || typeof contract !== 'object' || Array.isArray(contract)) return { valid: false, reason: 'Invalid contract' };
  const forbidden = ['hostPath','image','dockerParams','workspace','cwd','inputPaths','artifactPath'];
  if (forbidden.some(key => key in input) || forbidden.some(key => key in contract)) return { valid: false, reason: 'Forbidden host/Docker field' };
  const job = { version, jobId, operation, projectId, contractId, contractHash, revision, artifactId, contract, deadline, nonce, inputSha256, runId, ...(archiveSha256 === undefined ? {} : { archiveSha256 }) };
  if (input.verificationPlan !== undefined) {
    const plan = input.verificationPlan;
    const fields = new Set(['version','contractId','runId','artifactHash','sourceHash','planHash','assertionReview','uiLanguageReview','uiLanguageObservation']);
    if (operation !== 'verify_artifact' || !plan || typeof plan !== 'object' || Array.isArray(plan)
        || Object.keys(plan).some(key => !fields.has(key)) || plan.version !== 1 || plan.contractId !== contractId || plan.runId !== runId
        || plan.artifactHash !== inputSha256 || !HEX64.test(plan.sourceHash || '') || !HEX64.test(plan.planHash || '')) {
      return { valid: false, reason: 'Invalid or foreign verification plan' };
    }
    try {
      const serialized = JSON.stringify(plan, (_key, value) => {
        if (typeof value === 'function' || typeof value === 'symbol' || typeof value === 'bigint' || (typeof value === 'number' && !Number.isFinite(value))) throw Error('Non-JSON plan');
        return value;
      });
      if (Buffer.byteLength(serialized) > 262144) return { valid: false, reason: 'Verification plan limit exceeded' };
      job.verificationPlan = JSON.parse(serialized);
    } catch { return { valid: false, reason: 'Invalid verification plan JSON' }; }
  }
  if (operation === 'prepare_dependencies') {
    const decoded = decodeBase64(packageJsonBase64, MAX_PACKAGE_BYTES, 'packageJsonBase64');
    if (decoded.error) return { valid: false, reason: decoded.error };
    if (crypto.createHash('sha256').update(decoded.bytes).digest('hex') !== inputSha256) return { valid: false, reason: 'Digest mismatch' };
    if (archiveBase64 !== undefined) return { valid: false, reason: 'verify_artifact payload is not allowed' };
    job.packageJsonBase64 = packageJsonBase64;
  } else {
    const decoded = decodeBase64(archiveBase64, MAX_ARCHIVE_BYTES, 'archiveBase64');
    if (decoded.error) return { valid: false, reason: decoded.error };
    if (packageJsonBase64 !== undefined) return { valid: false, reason: 'prepare_dependencies payload is not allowed' };
    job.archiveBase64 = archiveBase64;
  }
  return { valid: true, job };
}
