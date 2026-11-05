import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readControlledRepairContext } from '../engine/controlledRepairContext.js';
import { digest } from '../verification/workerFailures.js';
import { createTestHarness } from './testHarness.js';
const { runAsyncTest, finish } = createTestHarness();
async function fixture(test) {
    const database = new DatabaseSync(':memory:');
    database.exec(`CREATE TABLE project_contracts(id,project_id,status,revision,contract_hash,contract_json);
        CREATE TABLE verification_runs(id,project_id,contract_id,status,started_at);
        CREATE TABLE artifacts(id,project_id,contract_id,sha256,verification_run_id);
        CREATE TABLE artifact_files(artifact_id,contract_id,path,sha256);
        CREATE TABLE verification_checks(id,contract_id,run_id,gate_name,status,applicability,evidence_json);
        CREATE TABLE requirements(id,contract_id,stable_key);
        CREATE TABLE contract_tasks(id,contract_id);
        CREATE TABLE requirement_task_links(contract_id,requirement_id,task_id);`);
    database.prepare('INSERT INTO project_contracts VALUES (?,?,?,?,?,?)').run('c','p','approved',3,'a'.repeat(64),JSON.stringify({ requirements: [{ id: 'REQ-1' }] }));
    database.exec(`INSERT INTO verification_runs VALUES ('r','p','c','failed','2026-11-01'); INSERT INTO artifacts VALUES ('a','p','c','hash','r');
        INSERT INTO requirements VALUES ('uuid','c','REQ-1'); INSERT INTO contract_tasks VALUES ('task','c');
        INSERT INTO requirement_task_links VALUES ('c','uuid','task');
        INSERT INTO verification_checks VALUES ('check','c','r','lint','FAIL','MANDATORY','{"reason":"real failure"}');`);
    database.prepare('INSERT INTO artifact_files VALUES (?,?,?,?)').run('a','c','src/app.ts',digest('source'));
    const files = [{ path: 'src/app.ts', content: Buffer.from('source') }];
    let duringRead = () => {};
    const read = () => readControlledRepairContext('p', { database, getDir: () => 'fixture', readFiles: async () => { duringRead(); return files.map(file => ({ ...file, content: Buffer.from(file.content) })); } });
    try { await test({ database, files, read, duringRead: callback => { duringRead = callback; } }); } finally { database.close(); }
}
await runAsyncTest('context uses only the latest approved contract/run and normalizes persisted evidence and current source hashes', () => fixture(async f => {
    const c = await f.read(); assert.equal(c.contract.id, 'c'); assert.equal(c.checks[0].reason,'real failure');
    assert.equal(c.files[0].sha256,digest('source')); assert.deepEqual(c.projectedRequirementIds,['REQ-1']);
}));
await runAsyncTest('latest queued/running run cannot fall back to old failed evidence', () => fixture(async f => {
    f.database.exec("INSERT INTO verification_runs VALUES ('new','p','c','running','2026-11-02')");
    await assert.rejects(f.read(), { code: 'CONTROLLED_REPAIR_STALE' });
}));
await runAsyncTest('modified, added and deleted non-lock source is rejected against the failed artifact', async () => {
    for (const mutate of [files => { files[0].content = Buffer.from('changed'); }, files => { files.push({ path:'new.ts', content:Buffer.from('new') }); }, files => { files.pop(); }]) {
        await fixture(async f => { mutate(f.files); await assert.rejects(f.read(), { code: 'CONTROLLED_REPAIR_STALE' }); });
    }
});
await runAsyncTest('a freshly prepared artifact lock does not hide the actual current lock in the approval inventory', () => fixture(async f => {
    f.database.prepare('INSERT INTO artifact_files VALUES (?,?,?,?)').run('a','c','package-lock.json',digest('worker lock'));
    f.files.push({ path:'package-lock.json', content:Buffer.from('current lock') });
    assert.equal((await f.read()).files.find(file => file.path === 'package-lock.json').sha256,digest('current lock'));
}));
await runAsyncTest('a newer unrelated artifact, invalid evidence and missing task ownership fail closed', async () => {
    await fixture(async f => { f.database.exec("INSERT INTO artifacts VALUES ('new','p','c','hash','other')"); await assert.rejects(f.read(), { code:'CONTROLLED_REPAIR_STALE' }); });
    await fixture(async f => { f.database.exec("UPDATE verification_checks SET evidence_json='broken'"); await assert.rejects(f.read(), { code:'CONTROLLED_REPAIR_STALE' }); });
    await fixture(async f => { f.database.exec('DELETE FROM contract_tasks'); assert.deepEqual((await f.read()).projectedRequirementIds,[]); });
});
await runAsyncTest('nested static-gate stdout/stderr remain available as diagnostic evidence', () => fixture(async f => {
    f.database.prepare('UPDATE verification_checks SET evidence_json=?').run(JSON.stringify({ reason: 'Static failure', evidence: { stdout: 'src/app.ts:59 lint failure', stderr: 'other actual error' } }));
    const c = await f.read(); assert.equal(c.checks[0].stdout, 'src/app.ts:59 lint failure'); assert.equal(c.checks[0].stderr, 'other actual error');
}));
await runAsyncTest('a new run or approved identity during asynchronous source reading invalidates the context', async () => {
    for (const sql of ["INSERT INTO verification_runs VALUES ('new','p','c','running','2026-11-02')", "UPDATE project_contracts SET contract_hash='changed'"]) {
        await fixture(async f => { f.duringRead(() => f.database.exec(sql)); await assert.rejects(f.read(), { code:'CONTROLLED_REPAIR_STALE' }); });
    }
});
await runAsyncTest('service exit tail survives large transpiled output and is redacted before Manager context', () => fixture(async f => {
    f.database.prepare('UPDATE verification_checks SET gate_name=?,evidence_json=?').run('service_spawn',JSON.stringify({stderr:'prefix-only',
        processObservation:{exited:true,exitCode:1,stderr:'compiled '.repeat(5000)+'\npassword=fixture-secret\nRangeError: Maximum call stack size exceeded\n at /workspace/src/routes/product.routes.ts:285:29'}}));
    const c=await f.read(), diagnostic=c.checks[0].stderr;
    assert.ok(diagnostic.includes('RangeError: Maximum call stack size exceeded'));
    assert.ok(diagnostic.includes('product.routes.ts:285:29'));
    assert.ok(!diagnostic.includes('fixture-secret')); assert.ok(diagnostic.length<=8000);
}));
await runAsyncTest('running service stderr retains the request failure stack', () => fixture(async f => {
    f.database.prepare('UPDATE verification_checks SET gate_name=?,status=?,evidence_json=?').run('service_spawn','PASS',JSON.stringify({
        processObservation:{exited:false,stderr:'TypeError: argument callback is required\n at /workspace/src/routes/index.ts:81:36'}
    }));
    const context = await f.read();
    assert.match(context.checks[0].stderr, /argument callback is required/);
}));
finish();
