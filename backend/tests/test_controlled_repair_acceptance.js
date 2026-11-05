import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectControlledRepairAcceptance, acceptControlledRepairInTransaction, assertControlledRepairSemanticProof, readAuthenticatedControlledDiagnostics } from '../engine/controlledRepairAcceptance.js';
import { verifyArtifactAndProject } from '../verification/verificationCli.js';
import { digest } from '../verification/workerFailures.js';
import { controlledRepairSourceHash } from '../engine/controlledRepairPlan.js';
import { DatabaseSync } from 'node:sqlite';
import { bindWorkerCheck } from '../verification/artifactEvidencePolicy.js';

function fixture() {
    const manifest = [{path:'src/app.ts',sha256:digest('repaired')}];
    const sourceHash = controlledRepairSourceHash(manifest);
    const proposalBody = {version:1,projectId:'p',contractId:'c',contractHash:digest('contract'),contractRevision:3,
        baselineRunId:'old-run',baselineArtifactId:'old-artifact',baselineArtifactSha256:digest('old-zip'),
        ready:true,targets:[{path:'src/app.ts',sourceSha256:digest('old'),checkIds:['old-check']}]};
    const proposal = {...proposalBody,planHash:digest(proposalBody)};
    const reservation = {id:'reservation',stage:'worker_verification',phase:'reserved',planHash:proposal.planHash,sourceHash,
        runId:'new-run',artifactId:'new-artifact',artifactSha256:digest('new-zip'),jobId:'new-job',nonce:'new-nonce'};
    const ledger = {controlledAcceptancePolicy:'controlled-acceptance-v1',phase:'patched',proposal,outputSourceHash:sourceHash,reviewedArtifactSourceHash:sourceHash,
        attempts:[{phase:'patched',target:'src/app.ts',outputSha256:manifest[0].sha256}],
        validations:[...['reviewer','tester'].map(stage=>({stage,phase:'passed',planHash:proposal.planHash,sourceHash,result:{approved:true}})),reservation]};
    const detail = {version:1,kind:'worker_product_failure',contractHash:proposal.contractHash,contractRevision:3,
        authenticatedWorker:true,runId:'old-run',artifactId:'old-artifact',artifactSha256:proposal.baselineArtifactSha256,
        jobId:'old-job',nonce:'old-nonce',checkId:'old-check',filePath:'src/app.ts',sourceSha256:digest('old')};
    const issue={id:'issue',run_id:'old-run',detail};
    return {ledger,planHash:proposal.planHash,validationId:reservation.id,context:{projectId:'p',contractId:'c',contractHash:proposal.contractHash,revision:3},
        artifact:{id:'new-artifact',sha256:reservation.artifactSha256},run:{id:'new-run'},
        receipt:{jobId:'new-job',nonce:'new-nonce',runId:'new-run',artifactId:'new-artifact',inputSha256:reservation.artifactSha256},
        manifest,currentSource:manifest,issues:[issue]};
}
function workerLockFixture() {
    const f=fixture(),pkg={path:'package.json',sha256:digest('{"name":"fixture"}')},lock={path:'package-lock.json',sha256:digest('fresh lock')};
    f.currentSource=[...f.currentSource,pkg];f.manifest=[...f.currentSource,lock];
    f.ledger.outputSourceHash=controlledRepairSourceHash(f.currentSource);
    f.ledger.reviewedArtifactSourceHash=controlledRepairSourceHash(f.manifest);
    for(const validation of f.ledger.validations)validation.sourceHash=f.ledger.reviewedArtifactSourceHash;
    f.dependencyInput={runId:f.run.id,contractId:f.context.contractId,packageJsonSha256:pkg.sha256,lockSha256:lock.sha256};
    return f;
}
test('fresh reviewed worker lock input may exist only in ZIP without writing generated source',()=>{
    const f=workerLockFixture(),before=structuredClone(f.currentSource);
    assert.deepEqual(inspectControlledRepairAcceptance(f).issueIds,['issue']);
    assert.deepEqual(f.currentSource,before);
});
test('ZIP-only lock needs exact current run contract package and lock provenance',()=>{
    for(const mutate of [f=>delete f.dependencyInput,...['runId','contractId','packageJsonSha256','lockSha256'].map(key=>f=>f.dependencyInput[key]='foreign'),
        f=>delete f.ledger.reviewedArtifactSourceHash,f=>f.ledger.validations[0].sourceHash=f.ledger.outputSourceHash]){
        const f=workerLockFixture();mutate(f);assert.throws(()=>inspectControlledRepairAcceptance(f));
    }
});
test('worker lock exception never authorizes other artifact differences or disk changes',()=>{
    for(const path of ['package.json','src/app.ts','nested/package-lock.json']){
        const f=workerLockFixture();f.manifest=[...f.manifest.filter(file=>file.path!==path),{path,sha256:digest('foreign')}];
        f.ledger.reviewedArtifactSourceHash=controlledRepairSourceHash(f.manifest);
        for(const validation of f.ledger.validations)validation.sourceHash=f.ledger.reviewedArtifactSourceHash;
        assert.throws(()=>inspectControlledRepairAcceptance(f));
    }
    const f=workerLockFixture();f.currentSource.push({path:'external.ts',sha256:digest('external')});
    assert.throws(()=>inspectControlledRepairAcceptance(f));
});
test('fresh exact proposal/source proof covers only the baseline finding',()=>{
    const f=fixture(); f.issues.push({...f.issues[0],id:'unrelated',run_id:'older-run',detail:{...f.issues[0].detail,runId:'older-run'}});
    assert.deepEqual(inspectControlledRepairAcceptance(f).issueIds,['issue']);
});

test('only authenticated same-source same-plan diagnostic findings are superseded by fresh full acceptance',()=>{
    const f=fixture(), identity={runId:'diagnostic',artifactId:'diagnostic-artifact',artifactSha256:digest('diagnostic'),jobId:'diagnostic-job',nonce:'diagnostic-nonce',sourceHash:f.ledger.reviewedArtifactSourceHash,planHash:f.planHash};
    const issue={...f.issues[0],id:'diagnostic-blocker',run_id:identity.runId,detail:{...f.issues[0].detail,...identity,kind:'worker_verification_blocker'}};
    f.issues.push(issue);assert.deepEqual(inspectControlledRepairAcceptance(f).issueIds,['issue']);
    f.authenticatedDiagnostics=[identity];assert.deepEqual(inspectControlledRepairAcceptance(f).issueIds,['issue','diagnostic-blocker']);
    for(const key of Object.keys(identity)) {
        const changed=structuredClone(f);changed.authenticatedDiagnostics[0][key]='foreign';
        assert.deepEqual(inspectControlledRepairAcceptance(changed).issueIds,['issue'],key);
    }
    f.issues.push({...issue,id:'unrelated',detail:{...issue.detail,jobId:'other-job'}});
    assert.deepEqual(inspectControlledRepairAcceptance(f).issueIds,['issue','diagnostic-blocker']);
});

test('persisted failed diagnostic requires exact reserved worker action before its blocker can close',()=>{
    const database=new DatabaseSync(':memory:'), f=fixture();
    database.exec('CREATE TABLE artifacts(id TEXT,project_id TEXT,contract_id TEXT,verification_run_id TEXT,sha256 TEXT); CREATE TABLE verification_runs(id TEXT,project_id TEXT,contract_id TEXT,status TEXT); CREATE TABLE verification_checks(id TEXT,contract_id TEXT,run_id TEXT,gate_name TEXT,status TEXT,applicability TEXT,started_at TEXT,ended_at TEXT,evidence_json TEXT);');
    const identity={version:1,operation:'verify_artifact',projectId:'p',contractId:'c',contractHash:f.context.contractHash,revision:3,
        jobId:'diagnostic-job',nonce:'diagnostic-nonce',runId:'diagnostic-run',artifactId:'diagnostic-artifact',inputSha256:digest('diagnostic-zip')};
    const reservation={stage:'worker_verification',...identity,artifactSha256:identity.inputSha256,sourceHash:f.ledger.reviewedArtifactSourceHash,planHash:f.planHash};
    f.ledger.semanticReviewHistory=[{validations:[reservation]}];
    const timestamp=new Date().toISOString();
    const action=bindWorkerCheck({id:'diagnostic-locale',gateName:'ui_language_evidence',status:'BLOCKED',applicability:'MANDATORY',startedAt:timestamp,endedAt:timestamp,
        evidenceJson:{controlledSemanticSourceHash:reservation.sourceHash,controlledSemanticPlanHash:f.planHash,advisory:true}},identity);
    database.prepare('INSERT INTO artifacts VALUES (?,?,?,?,?)').run(identity.artifactId,'p','c',identity.runId,identity.inputSha256);
    database.prepare('INSERT INTO verification_runs VALUES (?,?,?,?)').run(identity.runId,'p','c','failed');
    database.prepare('INSERT INTO verification_checks VALUES (?,?,?,?,?,?,?,?,?)').run(action.id,'c',identity.runId,action.gateName,action.status,action.applicability,timestamp,timestamp,JSON.stringify(action.evidenceJson));
    const args={context:f.context,ledger:f.ledger,currentRunId:f.run.id};
    try {
        const admitted=readAuthenticatedControlledDiagnostics(database,args);assert.equal(admitted.length,1);
        f.authenticatedDiagnostics=admitted;
        f.issues.push({id:'diagnostic-blocker',run_id:identity.runId,detail:{...f.issues[0].detail,...identity,artifactSha256:identity.inputSha256,kind:'worker_verification_blocker'}});
        assert.deepEqual(inspectControlledRepairAcceptance(f).issueIds,['issue','diagnostic-blocker']);
        const changed=structuredClone(action.evidenceJson);changed.advisory=false;
        database.prepare('UPDATE verification_checks SET evidence_json=?').run(JSON.stringify(changed));
        assert.deepEqual(readAuthenticatedControlledDiagnostics(database,args),[]);
        f.authenticatedDiagnostics=[];assert.deepEqual(inspectControlledRepairAcceptance(f).issueIds,['issue']);
        database.prepare('UPDATE verification_checks SET evidence_json=?').run(JSON.stringify(action.evidenceJson));
        reservation.sourceHash=digest('changed source');assert.deepEqual(readAuthenticatedControlledDiagnostics(database,args),[]);
    } finally {database.close();}
});
test('no old run, artifact, archive, job or nonce can supply fresh acceptance',()=>{
    for(const key of ['runId','artifactId','artifactSha256','jobId','nonce']) {
        const f=fixture(), old=f.issues[0].detail;
        const value=key==='artifactSha256'?old.artifactSha256:old[key];
        Object.assign(f.ledger.validations[2],{[key]:value});
        if(key==='runId')f.run.id=f.receipt.runId=value;
        if(key==='artifactId')f.artifact.id=f.receipt.artifactId=value;
        if(key==='artifactSha256')f.artifact.sha256=f.receipt.inputSha256=value;
        if(['jobId','nonce'].includes(key))f.receipt[key]=value;
        assert.throws(()=>inspectControlledRepairAcceptance(f),/fresh|reuse/i,key);
    }
});
test('resolved historical runs cannot donate a worker nonce/job/archive either',()=>{
    for(const identity of [{nonce:'new-nonce'},{jobId:'new-job'},{inputSha256:digest('new-zip')},{runId:'new-run'}]){
        const f=fixture();f.historicalIdentities=[identity];
        assert.throws(()=>inspectControlledRepairAcceptance(f),/reuse/i);
    }
});
test('changed contract, proposal, source, reviewer, tester and worker reservation stay closed',()=>{
    for(const mutate of [f=>f.context.contractHash=digest('other'),f=>f.ledger.controlledAcceptancePolicy='2.0',f=>f.ledger.proposal.targets[0].path='other',
        f=>f.currentSource=[{path:'extra',sha256:digest('extra')}],f=>f.manifest=[],
        f=>f.ledger.validations[0].sourceHash=digest('old'),f=>f.ledger.validations[1].result.approved=false,
        f=>f.ledger.validations[2].phase='passed',f=>f.receipt.nonce='forged',f=>f.ledger.attempts[0].outputSha256=digest('other')]) {
        const f=fixture();mutate(f);assert.throws(()=>inspectControlledRepairAcceptance(f));
    }
});
test('same baseline unrelated check/path and malformed provenance never close',()=>{
    for(const mutate of [d=>d.checkId='different',d=>d.filePath='unlisted',d=>d.sourceSha256=digest('other'),d=>d.authenticatedWorker=false]){
        const f=fixture();mutate(f.issues[0].detail);assert.deepEqual(inspectControlledRepairAcceptance(f).issueIds,[]);
    }
});
test('controller blocker requires exact baseline expected identity',()=>{
    const f=fixture(),p=f.ledger.proposal;
    f.issues=[{id:'controller',detail:{version:1,kind:'verification_controller_blocker',contractHash:p.contractHash,
        authenticatedWorker:false,expectedIdentity:{projectId:'p',contractId:'c',contractHash:p.contractHash,
            runId:p.baselineRunId,artifactId:p.baselineArtifactId,inputSha256:p.baselineArtifactSha256,jobId:'old-job',nonce:'old-nonce'}}}];
    assert.deepEqual(inspectControlledRepairAcceptance(f).issueIds,['controller']);
    f.issues[0].detail.expectedIdentity.runId='unrelated';
    assert.deepEqual(inspectControlledRepairAcceptance(f).issueIds,[]);
});
test('transaction adapter cannot close issues outside canonical completion transaction',()=>{
    assert.throws(()=>acceptControlledRepairInTransaction({}, {}, {isTransaction:false}),/canonical completion transaction/);
});
test('missing real assertion binding and locale authority stays BLOCKED before closure',()=>{
    assert.throws(()=>acceptControlledRepairInTransaction({}, {assertCurrent:()=>{}}, {isTransaction:true}),/semantic evidence authority required/);
});
test('semantic authority needs exact current binding and catalogue hash, not a bare verdict or Promise',()=>{
    const expected={sourceHash:digest('source'),artifactHash:digest('artifact'),contractId:'c',runId:'r'};
    const valid={passed:true,controlledAcceptancePolicy:'controlled-acceptance-v1',...expected,assertionBindingHash:digest('assertions'),localeCatalogueHash:digest('catalogue')};
    assert.doesNotThrow(()=>assertControlledRepairSemanticProof(valid,expected));
    for(const value of [undefined,{passed:true},Promise.resolve(valid),...Object.keys(valid).map(key=>({...valid,[key]:'foreign'}))]){
        assert.throws(()=>assertControlledRepairSemanticProof(value,expected),/semantic binding and locale/);
    }
});
test('CLI rejects controlled closure without completion or mixed legacy repair authority',async()=>{
    for(const options of [{complete:false,options:{controlledRepairAcceptance:{}}},
        {complete:true,options:{controlledRepairAcceptance:{},workerRepairValidationId:'legacy'}}]){
        await assert.rejects(verifyArtifactAndProject({projectId:'fixture',contractId:'contract',artifactId:'artifact',...options}),/exclusive canonical completion/);
    }
});
