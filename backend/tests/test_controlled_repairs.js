import assert from 'node:assert/strict';
import { executeControlledRepairs, assertControlledPackagePolicy, validateControlledRepairs } from '../engine/controlledRepairs.js';
import { inspectControlledRepairPlan, controlledRepairSourceHash } from '../engine/controlledRepairPlan.js';
import { digest } from '../verification/workerFailures.js';
import { createTestHarness } from './testHarness.js';
const { runAsyncTest, runTest, finish } = createTestHarness();
await runAsyncTest('fresh independent review keeps the complete union of bounded repair targets without optional unrelated source',async()=>{
 const fs=await import('node:fs/promises'),path=await import('node:path'),os=await import('node:os');
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'xfactor-review-union-'));
 try {
  const files=Array.from({length:3},(_,i)=>({path:`page${i}.js`,content:`export const value = ${JSON.stringify('x'.repeat(35000))};\n// terminal-${i}`}));
  for(const file of files)await fs.writeFile(path.join(root,file.path),file.content);
  const proposal={planHash:digest('plan'),targets:files.map(file=>({path:file.path,referencePaths:[]}))},workflow={controlledRepair:{proposal,phase:'patched'}},prompts=[];
  const result=await validateControlledRepairs({session:{proposal,assertCurrent:()=>{}},projectDir:root,workflow,contract:{contract_json:'{"requirements":[]}'},persistWorkflow:async()=>{},
   verificationFiles:files,services:{audit:()=>({passed:true})},callAgent:async(_role,prompt)=>{prompts.push(prompt);return {approved:true,assertionBindings:[]};}});
  assert.equal(result.passed,true,result.reason);assert.equal(prompts.length,2);
  for(const prompt of prompts)for(let i=0;i<3;i++)assert.ok(prompt.includes(`terminal-${i}`));
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
function fixture() {
    const files = [{ path:'src/app.ts', content:'export const original = true;' }, { path:'keep.ts', content:'keep all other source' }];
    const contract = { id:'c', status:'approved', revision:3, contract_hash:'a'.repeat(64), contract_json:JSON.stringify({ requirements:[{id:'REQ-1'}] }) };
    const context = { projectId:'p', contract, artifact:{id:'a',project_id:'p',contract_id:'c',sha256:'b'.repeat(64),verification_run_id:'r'},
        run:{id:'r',project_id:'p',contract_id:'c',status:'failed'}, files:files.map(f=>({...f,sha256:digest(f.content)})), projectedRequirementIds:[],
        checks:[{id:'check',run_id:'r',contract_id:'c',gate_name:'lint',status:'FAIL',applicability:'MANDATORY'}] };
    const payload = {summary:'Mevcut işlevi koruyarak düzelt.',targets:[{path:'src/app.ts',create:false,requirementIds:['REQ-1'],checkIds:['check'],instructions:'Gerçek lint hatasını düzelt.',referencePaths:['keep.ts']}]};
    const proposal = inspectControlledRepairPlan(payload,context), workflow = { generationCompletion:{preserved:true}, controlledRepair:{phase:'proposed',proposal} };
    let calls=0,writes=0,persists=0,active=true;
    const services = { loadContext:async()=>structuredClone(context), readSnapshot:()=>files.map(f=>({path:f.path,sha256:digest(f.content)})),
        assertActive:()=>{if(!active)throw new Error('Lost lease');}, buildContext:async()=> 'File: keep.ts (read-only)\nkeep all other source',
        writeFiles:async(_root,_coder,output,allowlist,fence)=>{fence.assertBeforeCommit();assert.deepEqual(allowlist,['src/app.ts']);writes++;
            for(const f of output){const old=files.find(file=>file.path===f.path);if(old)old.content=f.content;else files.push(f);}return output;} };
    const options = { projectDir:'fixture',contract,workflow,sourceFence:{projectId:'p',attemptId:'attempt',leaseOwner:'owner',contractId:'c',contractHash:contract.contract_hash,contractRevision:3},
        persistWorkflow:async()=>{persists++;},callAgent:async(role,_prompt,opts)=>{assert.equal(role,'coder');assert.equal(opts.maxAttempts,1);calls++;return {files:[{path:'src/app.ts',content:'export const repaired = true;'}]};},services };
    return {files,context,proposal,workflow,options,services,stop:()=>{active=false;},get calls(){return calls;},get writes(){return writes;},get persists(){return persists;}};
}
await runAsyncTest('controlled repair dispatches one Coder and writes only its explicit target, preserving generation metadata and unrelated bytes',async()=>{
    const f=fixture(),before=structuredClone(f.workflow.generationCompletion);const session=await executeControlledRepairs(f.options);
    assert.equal(f.calls,1);assert.equal(f.writes,1);assert.ok(f.persists>=3);assert.equal(f.files[1].content,'keep all other source');
    assert.deepEqual(f.workflow.generationCompletion,before);assert.equal(f.workflow.controlledRepair.phase,'patched');
    assert.equal(f.workflow.controlledRepair.attempts[0].outputSha256,digest('export const repaired = true;'));
    assert.equal(controlledRepairSourceHash(session.expected),controlledRepairSourceHash(f.files));session.assertCurrent();
});
await runAsyncTest('a changed source, wrong contract, missing fence or changed proposal consumes no model call',async()=>{
    for(const mutate of [f=>{f.files[1].content='changed';},f=>{f.options.contract={...f.options.contract,id:'other'};},f=>{f.options.sourceFence=null;},f=>{f.proposal.summary='tampered';}]){
        const f=fixture();mutate(f);await assert.rejects(executeControlledRepairs(f.options));assert.equal(f.calls,0);assert.equal(f.writes,0);
    }
});
await runAsyncTest('other output files, unchanged output, missing reference context and lost lease cannot write',async()=>{
    for(const result of [{files:[{path:'keep.ts',content:'overwrite'}]},{files:[{path:'src/app.ts',content:'export const original = true;'}]}]){
        const f=fixture();f.options.callAgent=async()=>result;await assert.rejects(executeControlledRepairs(f.options));assert.equal(f.writes,0);
    }
    const omitted=fixture();omitted.services.buildContext=async()=> 'OMITTED CONTEXT';await assert.rejects(executeControlledRepairs(omitted.options));assert.equal(omitted.calls,0);
    const lost=fixture();lost.options.callAgent=async()=>{lost.stop();return {files:[{path:'src/app.ts',content:'new source'}]};};await assert.rejects(executeControlledRepairs(lost.options));assert.equal(lost.writes,0);
});
await runAsyncTest('a concurrent unrelated edit during Coder is detected before source commit',async()=>{
    const f=fixture();f.options.callAgent=async()=>{f.files[1].content='external edit';return {files:[{path:'src/app.ts',content:'repaired'}]};};
    await assert.rejects(executeControlledRepairs(f.options),/Kaynaklar izinli onarım dışında değişti/);assert.equal(f.writes,0);
});
await runAsyncTest('an unknown provider result consumes the durable reservation and is never silently repeated',async()=>{
    const f=fixture();let calls=0;f.options.callAgent=async()=>{calls++;throw new Error('Provider disconnected after dispatch');};
    await assert.rejects(executeControlledRepairs(f.options));await assert.rejects(executeControlledRepairs(f.options));assert.equal(calls,1);assert.equal(f.writes,0);
    assert.equal(f.workflow.controlledRepair.attempts[0].phase,'dispatched');
});
await runAsyncTest('concurrent calls sharing the same proposal can consume only one Coder reservation',async()=>{
    const f=fixture();const results=await Promise.allSettled([executeControlledRepairs(f.options),executeControlledRepairs(f.options)]);
    assert.equal(results.filter(item=>item.status==='fulfilled').length,1);assert.equal(f.calls,1);assert.equal(f.writes,1);
});
await runAsyncTest('nested package targets cannot bypass dependency preservation',async()=>{
    const f=fixture(),original=JSON.stringify({dependencies:{express:'4.0.0'},scripts:{test:'node --test'}});
    f.files[0]={path:'frontend/package.json',content:original};f.context.files[0]={...f.files[0],sha256:digest(original)};
    f.workflow.controlledRepair.proposal=inspectControlledRepairPlan({summary:'Paketin çalışma komutunu tamamla.',targets:[{
        path:'frontend/package.json',create:false,requirementIds:['REQ-1'],checkIds:['check'],instructions:'Bağımlılıkları koru.',referencePaths:[]}]},f.context);
    f.options.callAgent=async()=>({files:[{path:'frontend/package.json',content:JSON.stringify({dependencies:{express:'5.0.0'},scripts:{test:'node --test'}})}]});
    await assert.rejects(executeControlledRepairs(f.options),/Paket bağımlılığı veya araç zinciri değiştirilemez/);assert.equal(f.writes,0);
});
runTest('package repairs preserve dependency/toolchain declarations and every existing quality command',()=>{
    const pkg={name:'fixture',dependencies:{express:'4.0.0'},scripts:{build:'next build',lint:'eslint .',typecheck:'tsc --noEmit',test:'npm run qa',qa:'node --test',start:'next start'}};
    assert.doesNotThrow(()=>assertControlledPackagePolicy(JSON.stringify(pkg),JSON.stringify({...pkg,scripts:{...pkg.scripts,'start:api':'tsx src/server.ts'}})));
    for(const change of [p=>{p.dependencies.express='5.0.0';},p=>{p.scripts.lint='echo passed';},p=>{delete p.scripts.build;},p=>{p.scripts.test='echo passed';},
        p=>{p.scripts.prelint='node disable-lint.js';},p=>{p.scripts.qa='echo passed';},p=>{p.scripts.start='echo passed';}]){
        const next=structuredClone(pkg);change(next);assert.throws(()=>assertControlledPackagePolicy(JSON.stringify(pkg),JSON.stringify(next)));
    }
});
runTest('an existing tsx loader can enable the same native Node test selection', () => {
    const before = { devDependencies: { tsx: '4.20.6' }, scripts: { test: 'node --test tests/*.test.js' } };
    const next = command => ({ ...before, scripts: { test: command } });
    const check = (original, proposed) => assertControlledPackagePolicy(JSON.stringify(original), JSON.stringify(proposed));
    assert.doesNotThrow(() => check(before, next('node --import tsx --test tests/*.test.js')));
    for (const command of ['node --import tsx --test tests/one.test.js', 'node --import ./fixture.js --test tests/*.test.js',
        'node --import tsx --test tests/*.test.js || exit 0']) {
        assert.throws(() => check(before, next(command)));
    }
    assert.throws(() => check({ scripts: before.scripts }, { scripts: next('node --import tsx --test tests/*.test.js').scripts }));
});
finish();
