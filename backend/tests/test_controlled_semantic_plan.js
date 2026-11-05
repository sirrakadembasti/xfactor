import test from 'node:test';
import assert from 'node:assert/strict';
import { buildControlledVerificationPlan, authenticateControlledAssertionReservation } from '../engine/controlledSemanticPlan.js';
import { computeAssertionSourceHash, computeAssertionBindingHash } from '../contracts/requirementAssertionBindings.js';
import { digest } from '../verification/workerFailures.js';
import { validateControlledRepairs } from '../engine/controlledRepairs.js';
import { inspectControlledSemanticEvidence } from '../engine/controlledSemanticEvidence.js';
import { hashUiLanguageCatalogue } from '../contracts/uiLanguageEvidence.js';

function fixture() {
 const files = [{path:'subject.mjs',content:'export const double = n => n * 2;'}, {path:'subject.test.mjs',content:"import test from 'node:test';\nimport assert from 'node:assert/strict';\nimport { double } from './subject.mjs';\ntest('double', () => {\n const actual = double(4);\n assert.equal(actual, 8);\n});\n"}, {path:'package-lock.json',content:'{}'}];
 const sourceHash=computeAssertionSourceHash(files), planHash=digest('approved repair');
 const binding={requirementId:'REQ-1',testFile:'subject.test.mjs',testName:'double',assertionLine:6,expectation:'Double supplied numeric input.'};
 const ledger={phase:'patched',proposal:{planHash},reviewedArtifactSourceHash:sourceHash,validations:['reviewer','tester'].map(stage=>({id:`${stage}-id`,stage,role:stage,phase:'passed',planHash,sourceHash,result:{approved:true,assertionBindings:[binding]}}))};
 return {files,ledger,requirements:[{id:'database-id',stable_key:'REQ-1',statement:'Double numeric input.',mandatory:1}],identity:{contractId:'contract',runId:'run',inputSha256:digest('ZIP')}};
}
test('maps exact independent assertions to authoritative database identities, never stable names',()=>{
 const input=fixture(), result=buildControlledVerificationPlan(input);
 assert.equal(result.assertionReview.bindings[0].requirementId,'database-id');
 assert.equal(result.assertionReview.requirements[0].statementHash,digest('Double numeric input.'));
 assert.equal(result.assertionReview.reservations[0].bindingHash,computeAssertionBindingHash(result.assertionReview.bindings));
 assert.equal(authenticateControlledAssertionReservation(input.ledger,input.requirements,result.assertionReview.reservations[0]),true);
 assert.equal(result.uiLanguageObservation.binding.sourceHash,result.sourceHash);
 assert.equal(result.uiLanguageReview,undefined);
});
test('diagnostic locale scope includes only bounded approved UI and explicit browser navigation routes',()=>{
 const input=fixture();input.approvedContract={management:{resources:[{uiPath:'/products'},{uiPath:'/products/:id'},{uiPath:'//external.test/unsafe'},{uiPath:'/secret?token=value'}]},browser:{url:'http://localhost:3000/login',roleJourneys:[{steps:[{action:'goto',url:'/stock-movements'}]}]}};
 assert.deepEqual(buildControlledVerificationPlan(input).uiLanguageObservation.routeTemplates,['/','/login','/products','/products/:id','/stock-movements']);
});
test('diagnostic locale scope includes the approved management login page but not the API endpoint', () => {
 const input = fixture();
 input.approvedContract = { management: { authentication: { login: '/oturum-ac', apiLogin: { path: '/api/login' } } } };
 assert.deepEqual(buildControlledVerificationPlan(input).uiLanguageObservation.routeTemplates, ['/', '/oturum-ac']);
});
test('model approval, stale lock/source, mismatched independent meaning and foreign requirement cannot compile assertions',()=>{
 for(const mutate of [x=>delete x.ledger.validations[0].result.assertionBindings,x=>x.files[2].content='changed lock',x=>x.ledger.validations[1].result.assertionBindings=[{...x.ledger.validations[1].result.assertionBindings[0],expectation:'Other meaning'}],x=>x.ledger.validations[0].result.assertionBindings[0].requirementId='database-id',x=>x.ledger.validations[1].id=x.ledger.validations[0].id]) {
  const input=fixture(); mutate(input); assert.equal(buildControlledVerificationPlan(input).assertionReview,undefined);
 }
});
test('reservation authentication rechecks durable role source plan approval and exact reviewed arrays',()=>{
 const input=fixture(), result=buildControlledVerificationPlan(input), reservation=result.assertionReview.reservations[0];
 for(const change of [{reservationId:'invented'},{role:'tester'},{sourceHash:digest('other')},{planHash:digest('other')},{bindingHash:digest('other')},{approved:false}]) assert.equal(authenticateControlledAssertionReservation(input.ledger,input.requirements,{...reservation,...change}),false);
 input.ledger.validations[0].result.assertionBindings[0].expectation='later change';
 assert.equal(authenticateControlledAssertionReservation(input.ledger,input.requirements,reservation),false);
});
test('fresh source review reserves final ZIP inventory before dispatch and retains bounded explicit assertion bindings',async()=>{
 const input=fixture(), validations=[], persisted=[];
 input.ledger.validations=validations;
 const session={files:input.files.slice(0,-1),expected:[],proposal:{targets:[],planHash:input.ledger.proposal.planHash},assertCurrent(){}};
 const options={session,projectDir:'isolated-fixture',workflow:{controlledRepair:input.ledger},contract:{contract_json:'{}'},verificationFiles:input.files,
  services:{audit:()=>({passed:true}),buildContext:async()=> 'Exact fixture source'},persistWorkflow:async()=>persisted.push(structuredClone(validations)),
  callAgent:async(role,prompt)=>{const reservation=validations.find(row=>row.stage===role);assert.ok(reservation.id);assert.equal(reservation.role,role);assert.equal(reservation.sourceHash,computeAssertionSourceHash(input.files));assert.ok(persisted.some(rows=>rows.some(row=>row.id===reservation.id)));assert.match(prompt,/assertionBindings/);return {approved:true,assertionBindings:[{requirementId:'REQ-1',testFile:'subject.test.mjs',testName:'double',assertionLine:6,expectation:'Double supplied input.'}],untrustedPass:true};}};
 assert.equal((await validateControlledRepairs(options)).passed,true);
 assert.notEqual(validations[0].id,validations[1].id);
 assert.equal(validations[0].result.assertionBindings.length,1);
 assert.equal(validations[0].result.untrustedPass,undefined);
 assert.equal(input.ledger.reviewedArtifactSourceHash,computeAssertionSourceHash(input.files));
});
test('failed fresh source review stays diagnostic and never dispatches a hidden retry',async()=>{
 const input=fixture(); input.ledger.validations=[];let calls=0;
 const result=await validateControlledRepairs({session:{files:input.files,expected:[],proposal:{targets:[],planHash:input.ledger.proposal.planHash},assertCurrent(){}},
  workflow:{controlledRepair:input.ledger},contract:{contract_json:'{}'},verificationFiles:input.files,services:{audit:()=>({passed:true}),buildContext:async()=> 'source'},
  persistWorkflow:async()=>{},callAgent:async()=>{calls++;return {approved:false,summary:'Missing real test.'};}});
 assert.equal(result.passed,false);assert.equal(calls,1);assert.equal(input.ledger.phase,'patched');
});
test('oversized or nonstring assertion meaning is rejected rather than truncated into a different approved binding',async()=>{
 for(const expectation of [false,'x'.repeat(2049)]) {
  const input=fixture();input.ledger.validations=[];
  await validateControlledRepairs({session:{proposal:{targets:[],planHash:input.ledger.proposal.planHash},assertCurrent(){}},workflow:{controlledRepair:input.ledger},contract:{contract_json:'{}'},verificationFiles:input.files,
   services:{audit:()=>({passed:true}),buildContext:async()=> 'source'},persistWorkflow:async()=>{},
   callAgent:async()=>({approved:true,assertionBindings:[{requirementId:'REQ-1',testFile:'subject.test.mjs',testName:'double',assertionLine:6,expectation}]})});
  assert.deepEqual(input.ledger.validations[0].result.assertionBindings,[]);
 }
});
test('canonical semantic proof independently checks actual assertion TAP, identities, bindings and locale inventory',()=>{
 const input=fixture(), plan=buildControlledVerificationPlan(input), sourceHash=plan.sourceHash;
 const catalogue={language:'tr',reviewed:true,scopeDeclared:true,surfaces:[{route:'/',role:'anonymous',state:'initial',labels:['Giriş yap']}]};
 const binding={sourceHash,artifactHash:plan.artifactHash,contractId:plan.contractId,runId:plan.runId,catalogueHash:hashUiLanguageCatalogue(catalogue)};
 plan.uiLanguageReview={catalogue,binding};
 const command=['node','--test','--test-reporter=tap','subject.test.mjs'], now=new Date().toISOString();
 const stdout='TAP version 13\n# Subtest: double\nok 1 - double\n1..1\n# tests 1\n# suites 0\n# pass 1\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n';
 const identity={...input.identity,jobId:'worker',artifactId:'artifact'};
 const execution={kind:'test_suite_execution',jobId:'worker',runId:plan.runId,artifactId:'artifact',artifactHash:plan.artifactHash,contractId:plan.contractId,checkId:'actual-check',sourceHash,
  planHash:plan.planHash,bindingHash:plan.assertionReview.reservations[0].bindingHash,command,commandHash:digest(command),exitCode:0,startedAt:now,completedAt:now,stdout,stderr:'',stdoutHash:digest(stdout),stderrHash:digest('')};
 execution.sourceFence={version:1,sourceHash,before:{version:1,matched:true,sourceHash,nonce:digest('before'),observedAt:now},after:{version:1,matched:true,sourceHash,nonce:digest('after'),observedAt:now}};
 const checks=[{id:'actual-check',name:'requirement_assertions',status:'passed',requirementIds:['database-id'],evidence:{assertionExecution:execution}},
  {id:'locale',name:'ui_language_evidence',status:'passed',evidence:{binding,inventory:{version:1,truncated:false,snapshots:[{route:'/',role:'anonymous',state:'initial',truncated:false,entries:[{text:'Giriş yap',kind:'text'}]}]}}}];
 const args={plan,files:input.files,checks,identity,authenticateReservation:r=>authenticateControlledAssertionReservation(input.ledger,input.requirements,r),authenticateReceipt:()=>true};
 assert.equal(inspectControlledSemanticEvidence(args).passed,true);
 assert.equal(inspectControlledSemanticEvidence({...args,authenticateReceipt:()=>false}).passed,false);
 for(const mutate of [x=>x.checks[0].evidence.assertionExecution.stdout='old PASS',x=>x.checks[0].evidence.assertionExecution.jobId='old-worker',x=>x.checks[1].evidence.inventory.snapshots[0].entries[0].text='Login',x=>x.checks[1].evidence.binding.runId='old-run',x=>x.checks.push(x.checks[0])]){
  const changed={...args,checks:structuredClone(checks)};mutate(changed);assert.equal(inspectControlledSemanticEvidence(changed).passed,false);
 }
});
test('locale catalogue requires two exact durable reviews of an independently authenticated same-source runtime observation',()=>{
 const input=fixture(), catalogue={language:'tr',reviewed:true,scopeDeclared:true,surfaces:[{route:'/',role:'anonymous',state:'initial',labels:['Giriş yap']}]};
 const observation={sourceHash:computeAssertionSourceHash(input.files),inventory:{version:1,truncated:false,snapshots:[{route:'/',role:'anonymous',state:'initial',truncated:false,entries:[{kind:'text',text:'Giriş yap'}]}]}};
 observation.observationHash=digest(observation.inventory);
 for(const row of input.ledger.validations) Object.assign(row.result,{uiLanguageCatalogue:catalogue,uiLanguageObservationHash:observation.observationHash});
 const args={...input,localeObservation:observation,authenticateLocaleObservation:x=>x===observation};
 assert.ok(buildControlledVerificationPlan(args).uiLanguageReview);
 assert.equal(buildControlledVerificationPlan({...args,authenticateLocaleObservation:()=>false}).uiLanguageReview,undefined);
 input.ledger.validations[1].result.uiLanguageObservationHash=digest('other snapshot');
 assert.equal(buildControlledVerificationPlan(args).uiLanguageReview,undefined);
});
