import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readLatestAttemptObservation } from '../verification/attemptObservation.js';
import { createTestHarness } from './testHarness.js';
const { runTest, finish } = createTestHarness();
function fixture(test) {
    const database=new DatabaseSync(':memory:');
    database.exec(`CREATE TABLE workflow_attempts(id,project_id,status,started_epoch,started_at,ended_at,error);
        CREATE TABLE project_logs(id INTEGER PRIMARY KEY,project_id,attempt_id,node_id,action);
        CREATE TABLE verification_runs(id,project_id,contract_id,started_at);
        INSERT INTO workflow_attempts VALUES('a','p','failed',100,'2026-11-01T20:53:09Z','2026-11-01T21:08:11Z','Deadline exceeded; password=private');
        INSERT INTO project_logs VALUES(1,'p','a','dependency-preparation','start');
        INSERT INTO verification_runs VALUES('old','p','c','2026-11-01T12:54:28Z');`);
    try {test(database);}finally{database.close();}
}
runTest('a failed preparation is durable and cannot be mistaken for an older verification run',()=>fixture(database=>{
    const value=readLatestAttemptObservation(database,'p','c');
    assert.equal(value.id,'a');assert.equal(value.stage,'prepare_dependencies');assert.equal(value.status,'failed');
    assert.equal(value.verificationRunId,null);assert.equal(value.noVerificationRun,true);assert.ok(!value.error.includes('private'));
}));
runTest('a run that actually started within the attempt is attributed without inferring a passing result',()=>fixture(database=>{
    database.exec("INSERT INTO verification_runs VALUES('new','p','c','2026-11-01T20:55:00Z')");
    const value=readLatestAttemptObservation(database,'p','c');assert.equal(value.verificationRunId,'new');assert.equal(value.stage,'verify_artifact');assert.equal(value.noVerificationRun,false);
    assert.equal(value.passed,undefined);
}));
runTest('another project, contract or post-attempt run cannot fill a missing run',()=>fixture(database=>{
    database.exec("INSERT INTO verification_runs VALUES('foreign','other','c','2026-11-01T21:00:00Z'); INSERT INTO verification_runs VALUES('wrong-contract','p','other','2026-11-01T21:00:00Z'); INSERT INTO verification_runs VALUES('later','p','c','2026-11-01T21:20:00Z')");
    assert.equal(readLatestAttemptObservation(database,'p','c').verificationRunId,null);
    assert.equal(readLatestAttemptObservation(database,'unknown','c'),null);
}));
finish();
