import { createHash, randomUUID } from 'node:crypto';
import { executeInSandbox } from './sandboxRunner.js';
import { buildRequirementAssertionCommand, computeAssertionBindingHash, normalizeAssertionInventoryFile, reviewRequirementAssertionBindings, evaluateRequirementAssertionExecution } from '../contracts/requirementAssertionBindings.js';

const MAX_STREAM_BYTES = 128 * 1024;
const HASH = /^[a-f0-9]{64}$/;
const digest = value => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
const requireThat = (condition, message) => { if (!condition) throw new Error(message); };
const nonempty = value => typeof value === 'string' && value.trim().length > 0;
const SOURCE_FENCE_SCRIPT = `// xfactor-source-fence-v1: operator-owned; never load application code.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const input=JSON.parse(fs.readFileSync(0,'utf8')),root=fs.realpathSync(process.cwd());
try {
 for(const item of input.files){
  if(typeof item.path!=='string'||item.path.includes('\\\\')||item.path.includes(':')||item.path.startsWith('/')||item.path.split('/').some(s=>!s||s==='.'||s==='..'))throw Error('path');
  let target=root;for(const part of item.path.split('/')){target=path.join(target,part);if(fs.lstatSync(target).isSymbolicLink())throw Error('link');}
  const fd=fs.openSync(target,fs.constants.O_RDONLY|(fs.constants.O_NOFOLLOW||0));
  try{const stat=fs.fstatSync(fd);if(!stat.isFile()||stat.size!==item.size)throw Error('size');
   const hash=crypto.createHash('sha256'),buffer=Buffer.alloc(65536);let total=0,n;
   while((n=fs.readSync(fd,buffer,0,buffer.length,null))>0){total+=n;if(total>item.size)throw Error('growth');hash.update(buffer.subarray(0,n));}
   if(total!==item.size||hash.digest('hex')!==item.sha256)throw Error('changed');
  }finally{fs.closeSync(fd);}
 }
 process.stdout.write(JSON.stringify({version:1,nonce:input.nonce,sourceHash:input.sourceHash,matched:true}));
}catch{process.stdout.write(JSON.stringify({version:1,nonce:input.nonce,sourceHash:input.sourceHash,matched:false}));process.exitCode=1;}`;

async function measureSource({ adapter, workspace, signal, timeoutMs, files, sourceHash }) {
  const nonce = digest(randomUUID());
  const inventory = files.map(normalizeAssertionInventoryFile).map(file => ({ path:file.path,sha256:file.sha256,size:Buffer.from(file.contentBase64,'base64').length }));
  const result = await executeInSandbox('node', ['-e', SOURCE_FENCE_SCRIPT], { adapter,workspace,signal,
    timeoutMs:Math.min(timeoutMs,30000),env:{},input:JSON.stringify({files:inventory,sourceHash,nonce}) });
  requireThat(result.exitCode === 0 && result.passed === true && !result.timedOut && !result.stdoutTruncated && !result.stderrTruncated
    && typeof result.stdout === 'string' && Buffer.byteLength(result.stdout) <= 1024, 'Worker source inventory measurement failed.');
  const proof = JSON.parse(result.stdout);
  requireThat(proof.version === 1 && proof.matched === true && proof.nonce === nonce && proof.sourceHash === sourceHash, 'Reviewed worker source changed before or during assertions.');
  return { ...proof, observedAt:new Date().toISOString() };
}

/**
 * Executes only explicitly reviewed node:test cases. The adapter and workspace must
 * be worker-owned, with files already staged to the exact supplied source inventory;
 * this module never stages files, selects a default adapter, or trusts job-supplied
 * approval flags. The worker caller authenticates durable Reviewer/Tester records.
 * The backend must separately authenticate the outer worker receipt before consuming
 * this evidence. Our receipt callback trusts only the exact locally observed result.
 *
 * Review meaning remains advisory; passing these structurally bound assertions is
 * not proof of arbitrary requirement semantics or universal application acceptance.
 * Raw TAP is retained only when complete and bounded. Known secret output blocks
 * without retaining it, rather than silently redacting a source-bound test name.
 * Tests must be standalone local subject fixtures; smoke-test services may already
 * be torn down. Only the declared tsx loader can be derived for local TS subjects;
 * this verifier never installs dependencies or accepts custom loader/runner flags.
 */
export async function verifyReviewedRequirementAssertions(options = {}) {
  const check = { id: randomUUID(), name: 'requirement_assertions', gateName: 'requirement_assertions', applicability: 'MANDATORY', status: 'blocked', passed: false, requirementIds: [] };
  const blocked = reason => ({ passed: false, checks: [{ ...check, reason }], issues: [reason] });
  const secrets = Array.isArray(options.redactSecrets) ? options.redactSecrets.filter(nonempty) : [];
  const redact = value => secrets.reduce((text, secret) => text.split(secret).join('[redacted]'), String(value));
  try {
    const { adapter, workspace, signal } = options;
    requireThat(typeof options.authenticateReservation === 'function', 'Independent reservation authentication is required.');
    requireThat(adapter && typeof adapter.execute === 'function', 'An explicit worker-owned sandbox adapter is required.');
    requireThat(nonempty(workspace), 'An explicit isolated workspace is required.');
    requireThat(!signal?.aborted, 'Assertion execution was cancelled.');
    const timeoutMs = options.timeoutMs ?? 60000;
    requireThat(Number.isSafeInteger(timeoutMs) && timeoutMs > 0 && timeoutMs <= 300000, 'Invalid assertion execution timeout.');
    const { files, review, job } = structuredClone({ files: options.files, review: options.review, job: options.job });
    requireThat(job && ['jobId', 'runId', 'artifactId', 'contractId'].every(key => nonempty(job[key])) && HASH.test(job.inputSha256), 'Authoritative worker job/artifact identity is incomplete.');
    requireThat(review && Array.isArray(review.reservations) && review.reservations.length === 2 && Array.isArray(review.bindings), 'Exact reviewed reservations and bindings are required.');
    const context = { sourceHash: review.sourceHash, planHash: review.planHash, bindingHash: computeAssertionBindingHash(review.bindings) };
    const authenticated = new Set();
    for (const reservation of review.reservations) {
      const candidate = structuredClone(reservation), authContext = structuredClone(context);
      const before = digest({ reservation: candidate, context: authContext });
      requireThat(await options.authenticateReservation(candidate, authContext) === true, 'Review reservation was not independently authenticated.');
      requireThat(digest({ reservation: candidate, context: authContext }) === before, 'Reservation authentication mutated the reviewed record.');
      authenticated.add(before);
    }
    const authenticateReservation = (reservation, authContext) => authenticated.has(digest({ reservation, context: authContext }));
    const input = { ...review, files };
    const reviewed = reviewRequirementAssertionBindings(input, { authenticateReservation });
    requireThat(reviewed.status === 'ready', reviewed.issues.join('; '));
    requireThat(!signal?.aborted, 'Assertion execution was cancelled.');
    const [command, ...args] = buildRequirementAssertionCommand(input, reviewed.testFiles);
    requireThat(!secrets.some(secret => [command, ...args].some(value => value.includes(secret))), 'Execution command contains a known secret.');
    const expectedExecution = { jobId: job.jobId, runId: job.runId, artifactId: job.artifactId, artifactHash: job.inputSha256, contractId: job.contractId, checkId: check.id, sourceHash: reviewed.sourceHash };
    const beforeSource = await measureSource({adapter,workspace,signal,timeoutMs,files,sourceHash:reviewed.sourceHash});
    const startedAt = new Date().toISOString();
    let observation;
    try {
      observation = await executeInSandbox(command, args, { adapter, workspace, timeoutMs, signal, env: {} });
    } catch (error) {
      // Real adapters may reject nonzero exits while attaching their actual result.
      if (!error.result || typeof error.result !== 'object' || !Number.isInteger(error.result.exitCode) || error.result.exitCode <= 0) throw error;
      observation = error.result;
    }
    const completedAt = new Date().toISOString();
    requireThat(!signal?.aborted && !observation?.timedOut && !observation?.aborted && !observation?.cancelled && !observation?.signal && !observation?.executionObservation?.cancelled, 'Assertion execution was cancelled, signalled or timed out.');
    requireThat(typeof observation.stdout === 'string' && typeof observation.stderr === 'string' && observation.stdoutTruncated === false && observation.stderrTruncated === false && Buffer.byteLength(observation.stdout) <= MAX_STREAM_BYTES && Buffer.byteLength(observation.stderr) <= MAX_STREAM_BYTES, 'Assertion output is missing, truncated or exceeds the 128 KiB stream ceiling.');
    requireThat(!secrets.some(secret => observation.stdout.includes(secret) || observation.stderr.includes(secret)), 'Assertion output contains a known secret; raw evidence was withheld.');
    for (const stream of ['stdout', 'stderr']) {
      requireThat(observation[`${stream}Sha256`] === undefined || observation[`${stream}Sha256`] === digest(observation[stream]), 'Adapter output digest does not match the complete retained stream.');
      requireThat(observation[`${stream}Bytes`] === undefined || observation[`${stream}Bytes`] === Buffer.byteLength(observation[stream]), 'Adapter output byte count does not match the complete retained stream.');
    }
    const afterSource = await measureSource({adapter,workspace,signal,timeoutMs,files,sourceHash:reviewed.sourceHash});
    const execution = {
      ...expectedExecution, kind: 'test_suite_execution', planHash: reviewed.planHash, bindingHash: reviewed.bindingHash,
      command: [command, ...args], commandHash: digest([command, ...args]), exitCode: observation.exitCode,
      startedAt, completedAt, stdout: observation.stdout, stderr: observation.stderr,
      stdoutHash: digest(observation.stdout), stderrHash: digest(observation.stderr),
      stdoutTruncated: false, stderrTruncated: false,
      adapterId: observation.adapterId || adapter.id || null,
      sourceFence: {version:1,sourceHash:reviewed.sourceHash,before:beforeSource,after:afterSource},
    };
    Object.assign(check, { command: [command, ...args].map(value => JSON.stringify(value)).join(' '), commandArgs: [command, ...args], cwd: workspace,
      exitCode: execution.exitCode, startedAt, endedAt: completedAt, stdout: execution.stdout, stderr: execution.stderr,
      stdoutDigest: execution.stdoutHash, stderrDigest: execution.stderrHash, stdoutTruncated: false, stderrTruncated: false,
      executionObservation: { normalExit: Number.isInteger(execution.exitCode) && execution.exitCode >= 0, cancelled: false },
      evidence: { producer: 'requirement-assertion-verifier', assertionExecution: execution, bindingHash: reviewed.bindingHash, sourceHash: reviewed.sourceHash, scope: 'reviewed-assertions' } });
    if (Number.isInteger(observation.exitCode) && observation.exitCode > 0) {
      check.status = 'failed';
      return blocked('Reviewed assertion test-suite command exited unsuccessfully.');
    }
    requireThat(observation.exitCode === 0 && observation.passed === true && (observation.status === undefined || ['PASS', 'PASSED'].includes(String(observation.status).toUpperCase())), 'Adapter did not observe a normal successful process exit.');
    const actualReceiptDigest = digest(execution), actualResultDigest = digest(observation);
    const evaluated = evaluateRequirementAssertionExecution({ ...input, expectedExecution, execution }, {
      authenticateReservation,
      authenticateReceipt: (receipt, identity) => receipt === execution && digest(receipt) === actualReceiptDigest && digest(observation) === actualResultDigest && digest(identity) === digest(expectedExecution),
      now: Date.now(), maxAgeMs: timeoutMs + 10000,
    });
    requireThat(evaluated.status === 'passed', evaluated.issues.join('; '));
    Object.assign(check, { status: 'passed', passed: true, requirementIds: [...new Set(evaluated.reviewedBindings.map(binding => binding.requirementId))].sort(), reason: 'Independently reviewed source-bound named assertions executed successfully.' });
    return { passed: true, checks: [check], issues: [] };
  } catch (error) {
    return blocked(redact(error.message || 'Reviewed assertion execution failed closed.'));
  }
}
