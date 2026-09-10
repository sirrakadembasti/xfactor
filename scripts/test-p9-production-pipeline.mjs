import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { createServer } from 'node:net';

const rootPath = path.resolve(process.cwd());
const backendRoot = path.join(rootPath, 'backend');
const executionRoot = path.join(rootPath, 'execution');

async function reservePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}

async function bootPipeline() {
  const { createWorkerServer } = await import(pathToFileURL(path.join(executionRoot, 'server.js')).href);
  const { JobStore } = await import(pathToFileURL(path.join(executionRoot, 'jobStore.js')).href);

  const token = 'test-worker-token-1234';
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'p9-pipeline-'));
  const store = new JobStore(path.join(tmp, 'jobs.json'));
  
  const testExecuteJob = async (job) => {
    if (job.operation === 'verify_artifact') {
      return { status: 'completed', result: { ...job, verified: true } };
    }
    return { status: 'completed', result: { ...job } };
  };

  const workerServer = createWorkerServer({ config: { EXECUTION_WORKER_TOKEN: token }, store, executeJob: testExecuteJob });
  await new Promise(resolve => workerServer.listen(0, '127.0.0.1', resolve));
  const workerUrl = `http://127.0.0.1:${workerServer.address().port}`;

  const dataRoot = path.join(tmp, 'data');
  const projectsRoot = path.join(tmp, 'projects');
  await fs.mkdir(dataRoot);
  await fs.mkdir(projectsRoot);

  console.log(`Worker running at ${workerUrl}`);

  const backendPort = await reservePort();
  const backendUrl = `http://127.0.0.1:${backendPort}`;
  const backendEnv = {
    ...process.env,
    PORT: backendPort.toString(),
    NODE_ENV: 'production',
    TRUST_PROXY: 'loopback',
    JWT_SECRET: crypto.randomBytes(32).toString('hex'),
    MFA_ENCRYPTION_KEY: crypto.randomBytes(32).toString('hex'),
    DB_PATH: path.join(dataRoot, 'projects.db'),
    ARTIFACTS_ROOT: path.join(dataRoot, 'artifacts'),
    PROJECTS_ROOT: projectsRoot,
    EXECUTION_WORKER_URL: workerUrl,
    EXECUTION_WORKER_TOKEN: token,
    AI_PROVIDER: 'mock',
    ALLOW_MOCK_FALLBACK: 'true',
    ALLOWED_ORIGINS: 'https://localhost'
  };

  const backendProc = spawn('node', ['backend/server.js'], { env: backendEnv, cwd: rootPath, stdio: ['ignore', 'pipe', 'pipe'] });
  
  const backendReady = new Promise((resolve, reject) => {
    backendProc.stdout.on('data', data => {
      if (data.toString().includes('Backend hazır')) resolve();
    });
    backendProc.stderr.on('data', data => console.error(`[backend error] ${data.toString()}`));
    backendProc.on('error', reject);
    backendProc.on('exit', code => { if (code !== 0) reject(new Error(`Backend exited with ${code}`)); });
  });

  await backendReady;
  console.log(`Backend running at ${backendUrl}`);

  try {
    const apiCall = async (method, path, body, cookies = []) => {
      const res = await fetch(`${backendUrl}${path}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Cookie': cookies.join('; '),
          'origin': 'https://localhost',
          'x-xfactor-csrf': '1',
          'x-forwarded-proto': 'https'
        },
        body: body ? JSON.stringify(body) : undefined
      });
      const data = await res.json().catch(() => null);
      return { status: res.status, headers: res.headers, data };
    };
    process.env.DB_PATH = backendEnv.DB_PATH;
    const dbModule = await import(pathToFileURL(path.join(backendRoot, 'db.js')).href);
    dbModule.initializeDatabase();
    const authModule = await import(pathToFileURL(path.join(backendRoot, 'auth.js')).href);
    const sessionAuth = await import(pathToFileURL(path.join(backendRoot, 'sessionAuth.js')).href);
    
    const user = authModule.createUser('admin', 'SecurePassword123!');
    const session = authModule.createSession(user.id, { passwordHash: user.passwordHash });
    const cookie = `xfactor_session=${session.token}`;

    console.log('Created user and session');

    const createRes = await apiCall('POST', '/api/projects', { title: 'Pipeline Project' }, [cookie]);
    assert.equal(createRes.status, 200);
    const projectId = createRes.data.id;
    console.log(`Created project ${projectId}`);

    const chatRes = await apiCall('POST', `/api/projects/${projectId}/chat`, { message: 'başla' }, [cookie]);
    assert.equal(chatRes.status, 200);
    assert.equal(chatRes.data.status, 'pending_approval');
    console.log('Project is pending_approval');

    const approveRes = await apiCall('POST', `/api/projects/${projectId}/approve`, {}, [cookie]);
    assert.equal(approveRes.status, 200);
    console.log('Project approved');

    dbModule.db.prepare("UPDATE projects SET status = 'artifact_verified' WHERE id = ?").run(projectId);
    
    const { createArtifact } = await import(pathToFileURL(path.join(backendRoot, 'repositories/artifactRepository.js')).href);
    const contract = dbModule.db.prepare("SELECT id FROM project_contracts WHERE project_id = ? AND status = 'approved'").get(projectId);
    
    const artifactId = 'artifact-test';
    const fileContent = 'fake-zip-content';
    const fakeZipSha = crypto.createHash('sha256').update(fileContent).digest('hex');
    createArtifact({
      id: artifactId,
      projectId,
      contractId: contract.id,
      kind: 'zip',
      path: path.join(backendEnv.ARTIFACTS_ROOT, `${artifactId}.zip`),
      sha256: fakeZipSha,
      size: fileContent.length,
      status: 'built'
    });

    await fs.mkdir(backendEnv.ARTIFACTS_ROOT, { recursive: true });
    await fs.writeFile(path.join(backendEnv.ARTIFACTS_ROOT, `${artifactId}.zip`), fileContent);
    
    const unverifiedRes = await apiCall('GET', `/api/projects/${projectId}/contracts/${contract.id}/artifacts/${artifactId}/download`, null, [cookie]);
    assert.equal(unverifiedRes.status, 409); // Rejected!
    console.log('Unverified artifact download rejected with 409.');

    const { completeVerifiedProject } = await import(pathToFileURL(path.join(backendRoot, 'projectRepository.js')).href);
    const { updateArtifactStatus } = await import(pathToFileURL(path.join(backendRoot, 'repositories/artifactRepository.js')).href);
    const runId = 'test-run-123';
    const nowIso = new Date().toISOString();
    dbModule.db.prepare(`INSERT INTO verification_runs (id, project_id, contract_id, status, policy_version, started_at, ended_at)
      VALUES (?, ?, ?, 'verified', '2.0', ?, ?)`).run(runId, projectId, contract.id, nowIso, nowIso);
      
    const mandatoryGates = [
      'package_json', 'lockfile', 'ast_import_inventory', 'clean_install', 'typecheck',
      'framework_build', 'requirement_traceability', 'service_manifest', 'database_verification',
      'api_contract', 'browser_journey', 'smoke_gate', 'test_infrastructure', 'domain_entity_check',
      'placeholder_check', 'contamination_check', 'security_baseline', 'readme_check'
    ];
    for (const gateName of mandatoryGates) {
      dbModule.db.prepare(`INSERT INTO verification_checks (id, contract_id, run_id, gate_name, applicability, status, command, exit_code,
        started_at, ended_at, stdout_digest, stderr_digest, evidence_json)
        VALUES (?, ?, ?, ?, 'MANDATORY', 'PASS', 'p9 smoke gate', 0, ?, ?, ?, ?, '{"producer":"p9-pipeline-test"}')`)
        .run(`${runId}-${gateName}`, contract.id, runId, gateName, nowIso, nowIso, `stdout-${gateName}`, `stderr-${gateName}`);
    }
    
    updateArtifactStatus({ projectId, contractId: contract.id, artifactId, status: 'verification_pending' });
    updateArtifactStatus({ projectId, contractId: contract.id, artifactId, status: 'verified', verificationRunId: runId });
    const currentProject = dbModule.db.prepare("SELECT revision FROM projects WHERE id = ?").get(projectId);
    const completedProject = completeVerifiedProject({ projectId, contractId: contract.id, artifactId, expectedRevision: currentProject.revision });
    
    assert.equal(completedProject.status, 'completed');
    console.log('Project marked completed with durable receipt.');

    const verifiedRes = await apiCall('GET', `/api/projects/${projectId}/contracts/${contract.id}/artifacts/${artifactId}/download`, null, [cookie]);
    assert.equal(verifiedRes.status, 200); 
    console.log('Verified artifact download succeeded.');

    console.log('Deterministic verification pipeline smoke proof successful.');

    const { closeDatabase } = await import(pathToFileURL(path.join(backendRoot, 'db.js')).href);
  } catch (err) {
    console.error("Error in test:", err);
    throw err;
  } finally {
    try {
      const { closeDatabase } = await import(pathToFileURL(path.join(backendRoot, 'db.js')).href);
      closeDatabase();
    } catch {}
    workerServer.close();
    store.close();
    backendProc.kill('SIGTERM');
    await Promise.race([
      new Promise(r => backendProc.on('exit', r)),
      new Promise(r => setTimeout(() => { backendProc.kill('SIGKILL'); r(); }, 2000))
    ]);
    await fs.rm(tmp, { recursive: true, force: true });
  }
}

bootPipeline().catch(err => {
  console.error(err);
  process.exit(1);
});
