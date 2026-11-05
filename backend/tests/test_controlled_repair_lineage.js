import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { digest } from '../verification/workerFailures.js';
import { controlledRepairSourceHash as hash } from '../engine/controlledRepairPlan.js';
import { bindWorkerCheck } from '../verification/artifactEvidencePolicy.js';
import { CONTROLLED_LINEAGE_LIMIT,archiveControlledRepairLineage,inspectControlledRepairLineage,readAuthenticatedControlledLineageIssueIds } from '../engine/controlledRepairLineage.js';
import { inspectControlledRepairAcceptance, assertControlledRepairSemanticProof } from '../engine/controlledRepairAcceptance.js';
const context={projectId:'p',contractId:'c',contractHash:digest('contract'),revision:3};
const files=[...Array.from({length:4},(_,i)=>({path:'source'+i+'.ts',sha256:digest('old'+i)})),{path:'package.json',sha256:digest('package-input')}];
function proposal(id,baseline,targets){
 const body={version:1,projectId:'p',contractId:'c',contractHash:context.contractHash,contractRevision:3,ready:true,
  baselineRunId:'run-'+id,baselineArtifactId:'artifact-'+id,baselineArtifactSha256:digest('zip-'+id),baselineSourceHash:hash(baseline),targets};
 return {...body,planHash:digest(body)};
}
function fixture(){
 const database=new DatabaseSync(':memory:');
 database.exec([
 'CREATE TABLE project_contracts(id TEXT,project_id TEXT,status TEXT,contract_hash TEXT,revision INTEGER)',
 'CREATE TABLE artifacts(id TEXT,project_id TEXT,contract_id TEXT,verification_run_id TEXT,sha256 TEXT)',
 'CREATE TABLE artifact_files(artifact_id TEXT,contract_id TEXT,path TEXT,sha256 TEXT)',
 'CREATE TABLE verification_runs(id TEXT,project_id TEXT,contract_id TEXT,status TEXT)',
 'CREATE TABLE verification_checks(id TEXT,contract_id TEXT,run_id TEXT,gate_name TEXT,status TEXT,applicability TEXT,started_at TEXT,ended_at TEXT,evidence_json TEXT)',
 'CREATE TABLE repair_issues(id TEXT,project_id TEXT,contract_id TEXT,run_id TEXT,status TEXT,detail_json TEXT)'
 ].join(';'));
 database.prepare('INSERT INTO project_contracts VALUES (?,?,?,?,?)').run('c','p','approved',context.contractHash,3);
 const old=proposal('old',files,files.map((f,i)=>({path:f.path,sourceSha256:f.sha256,checkIds:['check-'+i]})));
 const attempts=files.slice(0,3).map((f,i)=>({phase:'patched',target:f.path,planHash:old.planHash,outputSha256:digest('fixed'+i)}));
 attempts.push({phase:'dispatched',target:files[3].path,planHash:old.planHash,proposedOutputSha256:digest('NEVER WRITTEN')});
 const partial=files.map((f,i)=>i<3?{...f,sha256:attempts[i].outputSha256}:f);
 const next=proposal('diagnostic',partial,[{path:files[3].path,sourceSha256:files[3].sha256,checkIds:['check-new']}]);
 const prior={phase:'repairing',proposal:old,baseline:files,attempts};
 const identity={version:1,operation:'verify_artifact',...context,jobId:'old-job',nonce:'old-nonce',runId:old.baselineRunId,
  artifactId:old.baselineArtifactId,inputSha256:old.baselineArtifactSha256};
 const stamp='2026-11-02T13:00:00.000Z';
 const action=bindWorkerCheck({id:'check-0',gateName:'typecheck',status:'FAIL',applicability:'MANDATORY',startedAt:stamp,endedAt:stamp,evidenceJson:{reason:'compiler failure'}},identity);
 database.prepare('INSERT INTO artifacts VALUES (?,?,?,?,?)').run(identity.artifactId,'p','c',identity.runId,identity.inputSha256);
 database.prepare('INSERT INTO verification_runs VALUES (?,?,?,?)').run(identity.runId,'p','c','failed');
 for(const f of files)database.prepare('INSERT INTO artifact_files VALUES (?,?,?,?)').run(identity.artifactId,'c',f.path,f.sha256);
 database.prepare('INSERT INTO verification_checks VALUES (?,?,?,?,?,?,?,?,?)').run(action.id,'c',identity.runId,action.gateName,action.status,action.applicability,stamp,stamp,JSON.stringify(action.evidenceJson));
 const common={version:1,authenticatedWorker:true,contractHash:context.contractHash,contractRevision:3,runId:identity.runId,
  artifactId:identity.artifactId,artifactSha256:identity.inputSha256,jobId:identity.jobId,nonce:identity.nonce};
 const issue=(id,d)=>database.prepare('INSERT INTO repair_issues VALUES (?,?,?,?,?,?)').run(id,'p','c',identity.runId,'open',JSON.stringify(d));
 issue('product',{...common,kind:'worker_product_failure',checkId:action.id,filePath:files[0].path,sourceSha256:files[0].sha256});
 issue('blocker',{...common,kind:'worker_verification_blocker',reason:'recorded aggregate blocker'});
 issue('unrelated',{...common,kind:'worker_product_failure',checkId:'foreign',filePath:'foreign.ts',sourceSha256:digest('foreign')});
 database.exec('BEGIN');
 const lineage=archiveControlledRepairLineage(database,{previousLedger:prior,nextProposal:next,currentSource:partial});
 database.exec('COMMIT');
 const final=partial.map((f,i)=>i===3?{...f,sha256:digest('fixed3')}:f);
 const ledger={phase:'patched',proposal:next,baseline:partial,lineage,outputSourceHash:hash(final),
  attempts:[{phase:'patched',target:files[3].path,planHash:next.planHash,outputSha256:final[3].sha256}]};
 return {database,prior,next,partial,final,ledger};
}
test('three patches plus truncated fourth archive only exact authenticated origins; unrelated remains open',()=>{
 const f=fixture();try{
  assert.equal(f.ledger.lineage[0].attempts.length,4);
  assert.equal(f.ledger.lineage[0].attempts.filter(attempt=>attempt.phase==='patched').length,3);
  assert.equal(f.ledger.lineage[0].attempts[3].phase,'dispatched');assert.equal(f.ledger.lineage[0].lineage,undefined);
  assert.deepEqual(readAuthenticatedControlledLineageIssueIds(f.database,{context,ledger:f.ledger,currentSource:f.final}),['blocker','product']);
  assert.equal(f.database.prepare("SELECT status FROM repair_issues WHERE id='unrelated'").get().status,'open');
 }finally{f.database.close();}
});
test('pinned issue mutation and changed authoritative worker checks deny closure',()=>{
 for(const sql of ["UPDATE repair_issues SET detail_json='{}' WHERE id='blocker'","UPDATE verification_checks SET evidence_json='{}'"]){
  const f=fixture();try{f.database.exec(sql);assert.throws(()=>readAuthenticatedControlledLineageIssueIds(f.database,{context,ledger:f.ledger,currentSource:f.final}),/origin|evidence/);}finally{f.database.close();}
 }
});
test('missing proposal links, changed baseline and unconfirmed fourth write fail closed',()=>{
 const f=fixture();try{
  for(const mutate of [x=>x.lineage[0].nextPlanHash=digest('foreign'),x=>x.baseline[3].sha256=digest('unconfirmed')]){
   const ledger=structuredClone(f.ledger);mutate(ledger);
   assert.throws(()=>inspectControlledRepairLineage({context,ledger,currentSource:f.final,authenticateEntry:()=>true}),/changed|link|baseline/);
  }
  f.database.exec('BEGIN');
  assert.throws(()=>archiveControlledRepairLineage(f.database,{previousLedger:f.prior,nextProposal:f.next,currentSource:f.partial.map((p,i)=>i===3?{...p,sha256:digest('unconfirmed')}:p)}),/source fence/);
  f.database.exec('ROLLBACK');
 }finally{f.database.close();}
});
test('legacy controller-recorded baseline retains exact issue/check authority without fabricating action receipts',()=>{
 const f=fixture();try{
  const raw=JSON.parse(f.database.prepare('SELECT evidence_json FROM verification_checks').get().evidence_json);
  delete raw.workerReceipt;
  f.database.prepare('UPDATE verification_checks SET evidence_json=?').run(JSON.stringify(raw));
  f.database.exec('BEGIN');
  const lineage=archiveControlledRepairLineage(f.database,{previousLedger:f.prior,nextProposal:f.next,currentSource:f.partial});
  f.database.exec('COMMIT');
  assert.deepEqual(lineage[0].origins.map(origin=>origin.id),['blocker','product']);
  assert.ok(lineage[0].origins.every(origin=>origin.kind==='controller-recorded-baseline'));
  assert.deepEqual(readAuthenticatedControlledLineageIssueIds(f.database,{context,ledger:{...f.ledger,lineage},currentSource:f.final}),['blocker','product']);
 }finally{f.database.close();}
});
test('unexecuted incomplete drafts do not prevent preparing a corrected proposal',()=>{
 const f=fixture();try{
  const ledger={phase:'proposed',proposal:{...f.prior.proposal,ready:false}};
  assert.deepEqual(archiveControlledRepairLineage(f.database,{previousLedger:ledger,nextProposal:f.next,currentSource:f.partial}),[]);
 }finally{f.database.close();}
});
test('foreign origin run and mutated pinned job/nonce never inherit baseline authority',()=>{
 for(const key of ['runId','artifactId','jobId','nonce']){
  const f=fixture();try{
   const detail=JSON.parse(f.database.prepare("SELECT detail_json FROM repair_issues WHERE id='blocker'").get().detail_json);
   detail[key]='foreign';
   f.database.prepare("UPDATE repair_issues SET detail_json=? WHERE id='blocker'").run(JSON.stringify(detail));
   assert.throws(()=>readAuthenticatedControlledLineageIssueIds(f.database,{context,ledger:f.ledger,currentSource:f.final}),/origin|evidence/);
  }finally{f.database.close();}
 }
 const f=fixture();try{
  const detail=JSON.parse(f.database.prepare("SELECT detail_json FROM repair_issues WHERE id='blocker'").get().detail_json);
  detail.runId='foreign';f.database.prepare("UPDATE repair_issues SET run_id=?,detail_json=? WHERE id='blocker'").run('foreign',JSON.stringify(detail));
  f.database.exec('BEGIN');
  const history=archiveControlledRepairLineage(f.database,{previousLedger:f.prior,nextProposal:f.next,currentSource:f.partial});
  f.database.exec('COMMIT');
  assert.deepEqual(history[0].origins.map(origin=>origin.id),['product']);
 }finally{f.database.close();}
});
test('original controller identity is pinned separately; foreign controller work stays unresolved',()=>{
 const f=fixture();try{
  const expectedIdentity={version:1,operation:'verify_artifact',projectId:'p',contractId:'c',contractHash:context.contractHash,
   runId:f.prior.proposal.baselineRunId,artifactId:f.prior.proposal.baselineArtifactId,inputSha256:f.prior.proposal.baselineArtifactSha256,jobId:'controller-job',nonce:'controller-nonce'};
  const detail={version:1,kind:'verification_controller_blocker',authenticatedWorker:false,contractHash:context.contractHash,expectedIdentity,reason:'original controller failure'};
  for(const id of ['controller','foreign-controller'])f.database.prepare('INSERT INTO repair_issues VALUES (?,?,?,?,?,?)').run(id,'p','c',null,'open',
   JSON.stringify(id==='controller'?detail:{...detail,expectedIdentity:{...expectedIdentity,runId:'foreign'}}));
  f.database.exec('BEGIN');
  const history=archiveControlledRepairLineage(f.database,{previousLedger:f.prior,nextProposal:f.next,currentSource:f.partial});f.database.exec('COMMIT');
  assert.deepEqual(readAuthenticatedControlledLineageIssueIds(f.database,{context,ledger:{...f.ledger,lineage:history},currentSource:f.final}),['blocker','controller','product']);
 }finally{f.database.close();}
});
test('new full reviewed worker reservation admits only authenticated ancestor issues at the canonical policy boundary',()=>{
 const f=fixture();try{
  const sourceHash=hash(f.final),planHash=f.ledger.proposal.planHash;
  const worker={id:'fresh-reservation',stage:'worker_verification',phase:'reserved',planHash,sourceHash,runId:'fresh-run',
   artifactId:'fresh-artifact',artifactSha256:digest('fresh-zip'),jobId:'fresh-job',nonce:'fresh-nonce'};
  Object.assign(f.ledger,{controlledAcceptancePolicy:'controlled-acceptance-v1',reviewedArtifactSourceHash:sourceHash,
   validations:[...['reviewer','tester'].map(stage=>({stage,phase:'passed',planHash,sourceHash,result:{approved:true}})),worker]});
  const args={context,ledger:f.ledger,planHash,validationId:worker.id,artifact:{id:worker.artifactId,sha256:worker.artifactSha256},
   run:{id:worker.runId},receipt:{jobId:worker.jobId,nonce:worker.nonce,runId:worker.runId,artifactId:worker.artifactId,inputSha256:worker.artifactSha256},
   manifest:f.final,currentSource:f.final,issues:f.database.prepare('SELECT * FROM repair_issues ORDER BY id').all().map(row=>({...row,detail:JSON.parse(row.detail_json)}))};
  assert.deepEqual(inspectControlledRepairAcceptance(args).issueIds,[]);
  args.authenticatedLineageIssueIds=readAuthenticatedControlledLineageIssueIds(f.database,{context,ledger:f.ledger,currentSource:f.final});
  assert.deepEqual(inspectControlledRepairAcceptance(args).issueIds,['blocker','product']);
  worker.nonce='wrong-worker';
  assert.throws(()=>inspectControlledRepairAcceptance(args),/receipt|reservation/);
  assert.throws(()=>assertControlledRepairSemanticProof({passed:false},{sourceHash}),/semantic/);
  assert.equal(f.database.prepare("SELECT status FROM repair_issues WHERE id='unrelated'").get().status,'open');
 }finally{f.database.close();}
});
test('history cap never silently drops old authority',()=>{
 const f=fixture();try{f.database.exec('BEGIN');assert.throws(()=>archiveControlledRepairLineage(f.database,
  {previousLedger:{...f.prior,lineage:Array(CONTROLLED_LINEAGE_LIMIT).fill({})},nextProposal:f.next,currentSource:f.partial}),/budget/);f.database.exec('ROLLBACK');}finally{f.database.close();}
});

test('repeated identical partial-source diagnostics pin only exact blockers, including a zero-check controller timeout',()=>{
 const f=fixture();try{
  const add=(id,source,controller=false)=>{
   const artifactId='artifact-'+id,runId='run-'+id,artifactSha256=digest('zip-'+id);
   f.database.prepare('INSERT INTO artifacts VALUES (?,?,?,?,?)').run(artifactId,'p','c',runId,artifactSha256);
   f.database.prepare('INSERT INTO verification_runs VALUES (?,?,?,?)').run(runId,'p','c','failed');
   for(const file of source)f.database.prepare('INSERT INTO artifact_files VALUES (?,?,?,?)').run(artifactId,'c',file.path,file.sha256);
   const identity={projectId:'p',contractId:'c',contractHash:context.contractHash,revision:3,runId,artifactId,inputSha256:artifactSha256,jobId:'job-'+id,nonce:'nonce-'+id};
   const detail=controller?{version:1,kind:'verification_controller_blocker',authenticatedWorker:false,contractHash:context.contractHash,expectedIdentity:identity}
    :{version:1,kind:'worker_verification_blocker',authenticatedWorker:true,contractHash:context.contractHash,contractRevision:3,runId,artifactId,artifactSha256,jobId:identity.jobId,nonce:identity.nonce};
   if(!controller)f.database.prepare('INSERT INTO verification_checks VALUES (?,?,?,?,?,?,?,?,?)').run('check-'+id,'c',runId,'lint','FAIL','MANDATORY','start','end','{}');
   f.database.prepare('INSERT INTO repair_issues VALUES (?,?,?,?,?,?)').run(id,'p','c',controller?null:runId,'open',JSON.stringify(detail));
  };
  add('same-source',f.partial);add('old-source-diagnostic',files);add('timeout',f.partial,true);
  add('foreign-source',files.map((file,i)=>i===0?{...file,sha256:digest('unrelated')}:file));
  const inputSha256=files.find(file=>file.path==='package.json').sha256;
  const expectedIdentity={operation:'prepare_dependencies',projectId:'p',contractId:'c',contractHash:context.contractHash,inputSha256,runId:'preparation',jobId:'prep-job',nonce:'prep-nonce'};
  for(const id of ['prepare-timeout','foreign-prepare'])f.database.prepare('INSERT INTO repair_issues VALUES (?,?,?,?,?,?)').run(id,'p','c',null,'open',JSON.stringify({version:1,kind:'verification_controller_blocker',authenticatedWorker:false,contractHash:context.contractHash,expectedIdentity:id==='prepare-timeout'?expectedIdentity:{...expectedIdentity,inputSha256:digest('foreign-package')}}));
  f.database.exec('BEGIN');const history=archiveControlledRepairLineage(f.database,{previousLedger:f.prior,nextProposal:f.next,currentSource:f.partial});f.database.exec('COMMIT');
  const ledger={...f.ledger,lineage:history};
  assert.deepEqual(readAuthenticatedControlledLineageIssueIds(f.database,{context,ledger,currentSource:f.final}).sort(),['blocker','old-source-diagnostic','prepare-timeout','product','same-source','timeout']);
  f.database.exec("UPDATE verification_checks SET evidence_json='{\"changed\":true}' WHERE id='check-same-source'");
  assert.throws(()=>readAuthenticatedControlledLineageIssueIds(f.database,{context,ledger,currentSource:f.final}),/origin|evidence/);
 }finally{f.database.close();}
});
