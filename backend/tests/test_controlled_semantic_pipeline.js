import test from 'node:test';
import assert from 'node:assert/strict';

test('completed phases are observable before later verifier failure without mutating acceptance checks', async()=>{
 const input=fixture(), phases=[];
 input.verifiers.build=async()=>({passed:false,checks:[{name:'typecheck',status:'failed',stdout:'fixture compiler error',exitCode:2}]});
 input.verifiers.readme=async()=>{throw Error('later fixture interruption');};
 input.onPhaseComplete=event=>{phases.push(structuredClone(event));event.checks.length=0;};
 await assert.rejects(runVerificationChecks(input),/later fixture interruption/);
 assert.deepEqual(phases.map(row=>row.phase),['dependencies','build']);
 assert.equal(phases[1].checks[0].stdout,'fixture compiler error');
 assert.equal(phases[1].checks[0].status,'failed');
});
import { runVerificationChecks } from '../verification/runChecks.js';
import { computeAssertionSourceHash } from '../contracts/requirementAssertionBindings.js';
import { digest } from '../verification/workerFailures.js';
import { isMandatoryArtifactCheck } from '../verification/artifactVerifier.js';
import { inspectControlledSemanticReviewEligibility, readControlledLocaleObservation, reserveControlledSemanticReviewCycle } from '../engine/controlledSemanticAuthority.js';
import { bindWorkerCheck } from '../verification/artifactEvidencePolicy.js';
import { normalizeAssertionInventoryFile as semanticInventoryFile } from '../contracts/requirementAssertionBindings.js';

const files=[{path:'source.mjs',content:'export const value = 1;'}];
test('failed dependency setup blocks service and reviewed assertion execution instead of testing an incomplete installation',async()=>{
 const input=fixture();let runtimeCalls=0;
 input.verifiers.dependencies=async()=>({passed:false,checks:[{name:'clean_install',status:'failed',timedOut:true}]});
 input.verifiers.smoke=async()=>{runtimeCalls++;return {checks:[]};};
 input.verifiers.assertions=async()=>{runtimeCalls++;return {checks:[]};};
 input.verifiers.readme=async(_contract,_files,options)=>{assert.equal(options.dependencyResult.passed,false);return {passed:false,issues:[],checks:[{name:'readme_build',status:'blocked'}]};};
 const result=await runVerificationChecks(input);assert.equal(runtimeCalls,0);
 assert.equal(result.checks.find(c=>c.name==='smoke_gate')?.status,'blocked');
 assert.equal(result.checks.find(c=>c.name==='requirement_assertions')?.status,'blocked');
 assert.equal(result.checks.find(c=>c.name==='readme_check')?.status,'blocked');
});
test('semantic inventory preserves full binary bytes and rejects conflicting content/hash declarations',()=>{
 const bytes=Buffer.from([255,0,154,128]), file=semanticInventoryFile({path:'asset.bin',content:bytes});
 assert.equal(file.content,null);assert.equal(file.contentBase64,bytes.toString('base64'));assert.equal(file.sha256,digest(bytes));
 assert.throws(()=>semanticInventoryFile({...file,content:'different text'}));
 assert.throws(()=>semanticInventoryFile({...file,sha256:digest('different')}));
 const text=semanticInventoryFile({path:'source.mjs',content:'export const answer = 42;'});
 assert.equal(text.content,'export const answer = 42;');
});
function fixture() {
 const identity={jobId:'job',runId:'run',artifactId:'artifact',contractId:'contract',inputSha256:digest('ZIP')};
 const plan={version:1,sourceHash:computeAssertionSourceHash(files),artifactHash:identity.inputSha256,runId:'run',contractId:'contract',planHash:digest('plan'),uiLanguageObservation:{binding:{sourceHash:computeAssertionSourceHash(files),artifactHash:identity.inputSha256,runId:'run',contractId:'contract'},routeTemplates:['/']}};
 const empty=async()=>({passed:true,checks:[]});
 return {files,job:identity,verificationPlan:plan,runId:'run',verifiers:{dependencies:empty,build:empty,readme:empty,smoke:empty}};
}
test('semantic detail gates are always mandatory without changing the base gate count',()=>{
 assert.equal(isMandatoryArtifactCheck('requirement_assertions',{}),true);
 assert.equal(isMandatoryArtifactCheck('ui_language_evidence',{}),true);
});
test('a controlled diagnostic with no meanings or browser never omits mandatory semantic blockers',async()=>{
 const result=await runVerificationChecks(fixture());
 for(const name of ['requirement_assertions','ui_language_evidence']) {
  const check=result.checks.find(row=>row.name===name);
  assert.equal(check?.status,'blocked'); assert.deepEqual(check.requirementIds,[]);
 }
 assert.equal(result.passed,false);
});
test('worker binds independently supplied locale identity and rejects changed extracted source before any verifier',async()=>{
 const input=fixture(); let calls=0;
 input.verifiers.smoke=async(_root,_contract,options)=>{calls++; assert.deepEqual(options.uiLanguageObservationBinding,input.verificationPlan.uiLanguageObservation.binding);assert.equal(options.uiLanguageRequired,true);return {checks:[]};};
 await runVerificationChecks(input); assert.equal(calls,1);
 input.files=[{...files[0],content:'changed'}];
 await assert.rejects(runVerificationChecks(input),/source|identity/i); assert.equal(calls,1);
 input.files=files; input.job={...input.job,runId:'foreign'};
 await assert.rejects(runVerificationChecks(input),/identity/i); assert.equal(calls,1);
});
test('review-only eligibility fences disk/latest diagnostic and a durable three-cycle budget',()=>{
 const sourceHash=computeAssertionSourceHash(files), reservation={stage:'worker_verification',artifactId:'artifact',artifactSha256:digest('zip'),runId:'run'};
 const input={workflow:{controlledRepair:{phase:'patched',controlledAcceptancePolicy:'controlled-acceptance-v1',proposal:{planHash:digest('plan'),contractId:'contract'},outputSourceHash:sourceHash,validations:[reservation]}},
  latestArtifact:{id:'artifact',sha256:digest('zip'),verification_run_id:'run'},latestRun:{id:'run',status:'failed'},currentSourceHash:sourceHash,contractId:'contract'};
 assert.equal(inspectControlledSemanticReviewEligibility(input).eligible,true);
 const archived=structuredClone(input);archived.workflow.controlledRepair.semanticReviewHistory=[{validations:archived.workflow.controlledRepair.validations}];archived.workflow.controlledRepair.validations=[];
 assert.equal(inspectControlledSemanticReviewEligibility(archived).eligible,true,'failure after durable reservation may use archived last diagnostic in a new explicit action');
 for(const mutate of [x=>x.currentSourceHash=digest('changed'),x=>x.latestRun.id='other',x=>x.latestRun.status='running',x=>x.workflow.controlledRepair.semanticReviewHistory=[{},{},{}],x=>x.workflow.controlledRepair.phase='accepted']){
  const changed=structuredClone(input);mutate(changed);assert.equal(inspectControlledSemanticReviewEligibility(changed).eligible,false);
 }
});
test('review cycle archives prior proof durably and consumes each explicit attempt once',()=>{
 const ledger={phase:'patched',controlledAcceptancePolicy:'controlled-acceptance-v1',authorizedAttemptId:'attempt',reviewedArtifactSourceHash:digest('source'),proposal:{planHash:digest('plan')},validations:[{id:'previous',stage:'worker_verification'}]};
 const observation={sourceHash:digest('source'),observationHash:digest('observation'),checkId:'check',artifactId:'artifact',runId:'run'};
 reserveControlledSemanticReviewCycle({ledger,attemptId:'attempt',observation});
 assert.equal(ledger.semanticReviewHistory[0].validations[0].id,'previous');assert.deepEqual(ledger.validations,[]);
 assert.throws(()=>reserveControlledSemanticReviewCycle({ledger,attemptId:'attempt',observation}),/tüketilmiş/);
});
test('diagnostic locale observation is authenticated from actual persisted worker action, not claimed reviewed flags',()=>{
 const identity={version:1,operation:'verify_artifact',jobId:'job',nonce:'nonce',projectId:'project',contractId:'contract',contractHash:digest('contract'),revision:3,artifactId:'artifact',inputSha256:digest('zip'),runId:'run'};
 const sourceHash=computeAssertionSourceHash(files), inventory={version:1,truncated:false,snapshots:[]};
 const row=bindWorkerCheck({id:'locale',gateName:'ui_language_evidence',status:'BLOCKED',applicability:'MANDATORY',startedAt:new Date().toISOString(),endedAt:new Date().toISOString(),evidenceJson:{advisory:true,needsReview:true,controlledSemanticSourceHash:sourceHash,controlledSemanticPlanHash:digest('plan'),observationBinding:{sourceHash,artifactHash:identity.inputSha256,contractId:'contract',runId:'run'},inventory}},identity);
 const stored={...row,evidence_json:JSON.stringify(row.evidenceJson),run_status:'failed',source_artifact_id:'artifact',source_artifact_sha256:identity.inputSha256};
 const database={prepare:()=>({all:()=>[stored]})}, args={projectId:'project',contractId:'contract',sourceHash,artifactId:'artifact',runId:'run'};
 assert.equal(readControlledLocaleObservation(database,args)?.observationHash,digest(inventory));
 const data=JSON.parse(stored.evidence_json);data.inventory.truncated=true;stored.evidence_json=JSON.stringify(data);
 assert.equal(readControlledLocaleObservation(database,args),null);
});
