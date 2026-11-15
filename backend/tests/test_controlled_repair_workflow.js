import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { db } from '../db.js';
import { createProject, deleteProject, getProjectDir } from '../projectRepository.js';
import { executeProjectTasks, computePlanHash } from '../engine/workflow.js';
import { normalizeManagerPlan } from '../agents/schemas.js';
import { collectArtifactFiles } from '../artifactInventory.js';
import { readControlledRepairContext } from '../engine/controlledRepairContext.js';
import { inspectControlledRepairPlan, controlledRepairSourceHash } from '../engine/controlledRepairPlan.js';
import { bindWorkerCheck } from '../verification/artifactEvidencePolicy.js';
import { createCheck } from '../repositories/verificationRepository.js';
import { readControlledLocaleObservation } from '../engine/controlledSemanticAuthority.js';
import { acquireWorkflowLease, releaseWorkflowLease } from '../workflowAttempts.js';
import { createProjectRouter } from '../routes/projectRoutes.js';
import { digest } from '../verification/workerFailures.js';
import { createTestHarness } from './testHarness.js';
const { runAsyncTest, finish } = createTestHarness();
async function fixture(test) {
    const project = await createProject({title:'Controlled source repair fixture'}), dir=getProjectDir(project.id);
    try {
        const plan=normalizeManagerPlan({summary:'Preserve current Express implementation',talimatname:'# Existing scope',domains:[{name:'backend',prefix:'backend'}],
            requirements:[{id:'REQ-1',statement:'Preserve existing behavior',mandatory:true,kind:'functional',priority:'high',acceptance:['Real check']}],management:{needed:false,reason:'Isolated fixture'}});
        const contractId=crypto.randomUUID(),json=JSON.stringify(plan),contractHash=digest(json),runId=crypto.randomUUID(),artifactId=crypto.randomUUID(),checkId=crypto.randomUUID();
        await fs.mkdir(process.env.ARTIFACTS_ROOT,{recursive:true});
        const artifactPath=path.join(process.env.ARTIFACTS_ROOT,`${artifactId}.zip`);await fs.writeFile(artifactPath,'fixture');
        db.prepare("INSERT INTO project_contracts(id,project_id,revision,status,contract_json,contract_hash) VALUES(?,?,1,'approved',?,?)").run(contractId,project.id,json,contractHash);
        await fs.mkdir(path.join(dir,'src'),{recursive:true});await fs.writeFile(path.join(dir,'src/app.ts'),'export const original = true;');
        await fs.writeFile(path.join(dir,'package.json'),JSON.stringify({name:'controlled-fixture',version:'1.0.0',scripts:{test:'node --test'}}));
        await fs.writeFile(path.join(dir,'keep.txt'),'Keep unrelated bytes');
        db.prepare("INSERT INTO verification_runs(id,project_id,contract_id,status,policy_version,started_at,ended_at) VALUES(?,?,?,'failed','fixture',?,?)").run(runId,project.id,contractId,new Date().toISOString(),new Date().toISOString());
        db.prepare("INSERT INTO artifacts(id,project_id,contract_id,kind,path,sha256,size,manifest_json,status,verification_run_id) VALUES(?,?,?,'zip',?,?,0,'[]','rejected',?)").run(artifactId,project.id,contractId,artifactPath,'a'.repeat(64),runId);
        for(const file of await collectArtifactFiles(dir))db.prepare('INSERT INTO artifact_files(contract_id,artifact_id,path,sha256,size) VALUES(?,?,?,?,?)').run(contractId,artifactId,file.path,digest(file.content),file.content.length);
        db.prepare("INSERT INTO verification_checks(id,contract_id,run_id,gate_name,applicability,status,started_at,evidence_json) VALUES(?,?,?,'lint','MANDATORY','FAIL',?,'{\"reason\":\"Actual fixture error\"}')").run(checkId,contractId,runId,new Date().toISOString());
        const proposal=inspectControlledRepairPlan({summary:'Correct only the current source',targets:[{path:'src/app.ts',create:false,requirementIds:['REQ-1'],checkIds:[checkId],instructions:'Preserve the public export and correct its value.',referencePaths:[]}]},await readControlledRepairContext(project.id));
        const marker={stage:'generation_finished',contractId,contractHash,planHash:computePlanHash(plan)};
        const workflow={planHash:computePlanHash(plan),generationCompletion:marker,directorSpecs:{preserved:true},teamleaderPlans:{preserved:{tasks:[]}},controlledRepair:{phase:'proposed',proposal}};
        db.prepare("UPDATE projects SET status='implementing',workflow_state=? WHERE id=?").run(JSON.stringify(workflow),project.id);
        const lease=acquireWorkflowLease(project.id,'controlled-fixture');
        workflow.controlledRepair.authorizedAttemptId=lease.attempt.id;
        db.prepare('UPDATE projects SET workflow_state=? WHERE id=?').run(JSON.stringify(workflow),project.id);
        await test({project,dir,proposal,marker,workflow,lease});
    } finally {await deleteProject(project.id);}
}
await runAsyncTest('controlled workflow uses the real fenced writer and fresh review/testing without scaffold, DAG or cache regeneration',()=>fixture(async f=>{
    const calls=[],llmOptions=[];let preparations=0;
    await executeProjectTasks(f.project.id,null,f.lease.attempt.id,'controlled-fixture',{
        controlledRepairHash:f.proposal.planHash,
        callAgent:async(role,_prompt,options)=>{calls.push(role);llmOptions.push({role,timeoutMs:options?.timeoutMs,googleThinkingLevel:options?.googleThinkingLevel});if(role==='coder')return {files:[{path:'src/app.ts',content:'export const original = false;'}]};return {approved:true,summary:'Fresh fixture acceptance',issues:[]};},
        createExecutionClient:()=>({prepareDependencies:async()=>{assert.deepEqual(calls,['coder'],'reviews must wait for the final worker lock');preparations++;return {status:'completed',result:{packageLockBase64:Buffer.from('{"lockfileVersion":3,"packages":{}}').toString('base64')}};}}),
        verifyArtifactAndProject:async({options,complete})=>{assert.equal(complete,false);assert.ok(options.verificationPlan?.sourceHash);return {passed:false,completed:false,error:'fixture diagnostic boundary'};}
    });
    assert.deepEqual(calls,['coder','reviewer','tester']);assert.equal(preparations,1);
    // Coder and both independent reviews get the same bounded budget and low-thinking request.
    assert.deepEqual(llmOptions,['coder','reviewer','tester'].map(role=>({role,timeoutMs:240000,googleThinkingLevel:'low'})));
    assert.equal(await fs.readFile(path.join(f.dir,'src/app.ts'),'utf8'),'export const original = false;');
    assert.equal(await fs.readFile(path.join(f.dir,'keep.txt'),'utf8'),'Keep unrelated bytes');
    const saved=JSON.parse(db.prepare('SELECT workflow_state FROM projects WHERE id=?').get(f.project.id).workflow_state);
    assert.deepEqual(saved.generationCompletion,f.marker);assert.deepEqual(saved.directorSpecs,f.workflow.directorSpecs);assert.deepEqual(saved.teamleaderPlans,f.workflow.teamleaderPlans);
    assert.equal(saved.controlledRepair.validations.filter(item=>item.phase==='passed').length,2);
}));
await runAsyncTest('a stale authorized proposal hash cannot fall through to ordinary generation',()=>fixture(async f=>{
    let calls=0;const original=await fs.readFile(path.join(f.dir,'src/app.ts'),'utf8');
    await executeProjectTasks(f.project.id,null,f.lease.attempt.id,'controlled-fixture',{controlledRepairHash:'f'.repeat(64),callAgent:async()=>{calls++;throw new Error('No dispatch allowed');}});
    assert.equal(calls,0);assert.equal(await fs.readFile(path.join(f.dir,'src/app.ts'),'utf8'),original);
}));
await runAsyncTest('explicit semantic continuation reviews authenticated snapshots without Coder and binds catalogue to a fresh worker run',()=>fixture(async f=>{
    const files=await collectArtifactFiles(f.dir),lock='{"lockfileVersion":3,"packages":{}}';
    const sourceHash=controlledRepairSourceHash([...files,{path:'package-lock.json',content:lock}]);
    const inventory={version:1,truncated:false,snapshots:[{route:'/',role:'anonymous',state:'initial',truncated:false,entries:[{kind:'text',text:'Giriş yap'}]}]};
    const catalogue={language:'tr',reviewed:true,scopeDeclared:true,surfaces:[{route:'/',role:'anonymous',state:'initial',labels:['Giriş yap']}]};
    const identity={version:1,operation:'verify_artifact',projectId:f.project.id,contractId:f.proposal.contractId,contractHash:f.proposal.contractHash,revision:1,
        jobId:'diagnostic-job',nonce:'diagnostic-nonce',artifactId:f.proposal.baselineArtifactId,inputSha256:f.proposal.baselineArtifactSha256,runId:f.proposal.baselineRunId};
    db.prepare("UPDATE verification_runs SET status='running' WHERE id=?").run(identity.runId);
    createCheck(bindWorkerCheck({id:crypto.randomUUID(),contractId:identity.contractId,runId:identity.runId,gateName:'ui_language_evidence',status:'BLOCKED',applicability:'MANDATORY',startedAt:new Date().toISOString(),endedAt:new Date().toISOString(),stdoutDigest:digest(''),stderrDigest:digest(''),
        evidenceJson:{controlledSemanticSourceHash:sourceHash,controlledSemanticPlanHash:f.proposal.planHash,advisory:true,needsReview:true,inventory,
            observationBinding:{sourceHash,artifactHash:identity.inputSha256,contractId:identity.contractId,runId:identity.runId}}},identity));
    db.prepare("UPDATE verification_runs SET status='failed' WHERE id=?").run(identity.runId);
    assert.ok(readControlledLocaleObservation(db,{projectId:f.project.id,contractId:identity.contractId,sourceHash,artifactId:identity.artifactId,runId:identity.runId}));
    const ledger=f.workflow.controlledRepair;
    Object.assign(ledger,{phase:'patched',controlledAcceptancePolicy:'controlled-acceptance-v1',outputSourceHash:controlledRepairSourceHash(files),reviewedArtifactSourceHash:sourceHash,
        validations:[{id:'diagnostic-reservation',stage:'worker_verification',artifactId:identity.artifactId,artifactSha256:identity.inputSha256,runId:identity.runId}]});
    db.prepare('UPDATE projects SET workflow_state=? WHERE id=?').run(JSON.stringify(f.workflow),f.project.id);
    const calls=[];let workerCalls=0;
    await executeProjectTasks(f.project.id,null,f.lease.attempt.id,'controlled-fixture',{
        controlledRepairHash:f.proposal.planHash,controlledRepairSemanticReview:true,loadRecordedDependencyLock:async()=>null,
        callAgent:async(role,prompt)=>{calls.push(role);assert.notEqual(role,'coder');assert.match(prompt,/uiLanguageObservation/);return {approved:true,summary:'Independent observed labels',uiLanguageCatalogue:catalogue,uiLanguageObservationHash:digest(inventory)};},
        createExecutionClient:()=>({prepareDependencies:async()=>({status:'completed',result:{packageLockBase64:Buffer.from(lock).toString('base64')}})}),
        verifyArtifactAndProject:async({options,complete})=>{workerCalls++;assert.equal(complete,false,'missing real assertions remains diagnostic');assert.ok(options.verificationPlan.uiLanguageReview);
            assert.equal(options.verificationPlan.uiLanguageReview.binding.runId,options.runId);assert.notEqual(options.runId,identity.runId);return {passed:false,completed:false,error:'Real assertions are absent.'};}
    });
    assert.deepEqual(calls,['reviewer','tester']);assert.equal(workerCalls,1);assert.equal(controlledRepairSourceHash(await collectArtifactFiles(f.dir)),ledger.outputSourceHash);
    const saved=JSON.parse(db.prepare('SELECT workflow_state FROM projects WHERE id=?').get(f.project.id).workflow_state);
    assert.equal(saved.controlledRepair.semanticReviewHistory.length,1);assert.equal(saved.controlledRepair.validations.filter(row=>row.stage==='worker_verification').length,1);
}));
await runAsyncTest('source changes after fresh reviews cannot reach worker verification under those reviews',()=>fixture(async f=>{
    let verifications=0;
    await executeProjectTasks(f.project.id,null,f.lease.attempt.id,'controlled-fixture',{
        controlledRepairHash:f.proposal.planHash,
        callAgent:async role=>role==='coder'?{files:[{path:'src/app.ts',content:'export const original = false;'}]}:{approved:true,summary:'Fresh acceptance',issues:[]},
        createExecutionClient:()=>({prepareDependencies:async()=>{await fs.writeFile(path.join(f.dir,'keep.txt'),'concurrent source edit');return {status:'completed',result:{packageLockBase64:Buffer.from('{"lockfileVersion":3,"packages":{}}').toString('base64')}};}}),
        verifyArtifactAndProject:async()=>{verifications++;return {passed:true,completed:false};}
    });
    assert.equal(verifications,0,'worker must not verify source changed after the pinned reviews');
}));
await runAsyncTest('the separate owner action authorizes only the exact proposal and preserves normal planning metadata; double click dispatches once',()=>fixture(async f=>{
    releaseWorkflowLease(f.lease.attempt.id,'failed',{leaseOwner:'controlled-fixture',error:'fixture setup complete'});
    db.prepare("UPDATE projects SET status='paused' WHERE id=?").run(f.project.id);
    let dispatches=0,invocation;
    const router=createProjectRouter({requireAuth:(req,_res,next)=>{req.user={id:'owner'};next();},projectAccess:level=>(_req,_res,next)=>{assert.equal(level,'owner');next();},
        projectExecutor:async(...args)=>{dispatches++;invocation=args;}});
    const request=body=>new Promise(resolve=>{
        const req={method:'POST',url:`/${f.project.id}/repair`,body,headers:{},get:()=>undefined};
        const res={statusCode:200,status(code){this.statusCode=code;return this;},json(value){resolve({status:this.statusCode,value});}};
        router.handle(req,res,error=>res.status(error?.status||500).json({error:error?.message||'Route missing'}));
    });
    const stale=await request({contractId:'other',proposalHash:f.proposal.planHash});assert.equal(stale.status,409);assert.equal(dispatches,0);
    const result=await request({contractId:f.proposal.contractId,proposalHash:f.proposal.planHash});
    assert.equal(result.status,200,JSON.stringify(result));assert.equal(invocation?.[4]?.controlledRepairHash,f.proposal.planHash);assert.equal(dispatches,1);
    const again=await request({contractId:f.proposal.contractId,proposalHash:f.proposal.planHash});assert.equal(again.status,200);assert.equal(again.value.idempotent,true);assert.equal(dispatches,1);
    assert.match(again.value.workflow.controlledRepair.proposal.summary,/öneriliyor/);
    assert.equal(again.value.workflow.controlledRepair.authorizedAttemptId,undefined,'idempotent response must keep the internal ledger private');
    const saved=JSON.parse(db.prepare('SELECT workflow_state FROM projects WHERE id=?').get(f.project.id).workflow_state);
    assert.deepEqual(saved.generationCompletion,f.marker);assert.deepEqual(saved.teamleaderPlans,f.workflow.teamleaderPlans);
    assert.equal(saved.controlledRepair.authorizedAttemptId,invocation[2]);
    releaseWorkflowLease(invocation[2],'failed',{leaseOwner:invocation[3],error:'fixture action complete'});
}));
finish();
