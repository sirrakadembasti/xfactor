import assert from 'node:assert/strict';
import { executeControlledRepairs, assertControlledPackagePolicy, validateControlledRepairs, controlledRepairContextOverflow, controlledRepairContextBase, controlledRepairBatchGrowth, CONTROLLED_BATCH_FILE_RESERVE_BYTES, controlledSourceSyntaxError,
    CONTROLLED_CODER_CONTEXT_BYTES } from '../engine/controlledRepairs.js';
import { inspectControlledRepairPlan, controlledRepairSourceHash } from '../engine/controlledRepairPlan.js';
import { parseTypecheckErrors } from '../engine/controlledTypeProbe.js';
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
await runAsyncTest('a package answer that breaks the policy gets one correction with the reason before anything is written',async()=>{
    const f=fixture(),original=JSON.stringify({scripts:{start:'next start',build:'next build'}});
    f.files[0]={path:'package.json',content:original};f.context.files[0]={...f.files[0],sha256:digest(original)};
    f.workflow.controlledRepair.proposal=inspectControlledRepairPlan({summary:'Paketi koru.',targets:[{
        path:'package.json',create:false,requirementIds:['REQ-1'],checkIds:['check'],instructions:'Komutları koru.',referencePaths:[]}]},f.context);
    const rejected=JSON.stringify({scripts:{start:'next start',build:'next build',prestart:'npm run build'}});
    const corrected=JSON.stringify({name:'fixture',scripts:{start:'next start',build:'next build'}});
    const prompts=[],tasks=[];
    f.services.writeFiles=async(_root,_coder,output,allowlist,fence)=>{fence.assertBeforeCommit();assert.deepEqual(allowlist,['package.json']);f.files[0].content=output[0].content;return output;};
    f.options.callAgent=async(_role,prompt,opts)=>{prompts.push(prompt);tasks.push(opts.taskId);return {files:[{path:'package.json',content:prompts.length===1?rejected:corrected}]};};
    await executeControlledRepairs(f.options);
    assert.equal(prompts.length,2);assert.deepEqual(tasks,['controlled-repair.package.json','controlled-repair.package.json.policy-retry']);
    assert.match(prompts[1],/Yeni yaşam döngüsü veya kalite komutu eklenemez: prestart/);assert.ok(prompts[1].includes(rejected));
    assert.equal(f.files[0].content,corrected);
    const again=fixture();again.files[0]={path:'package.json',content:original};again.context.files[0]={...again.files[0],sha256:digest(original)};
    again.workflow.controlledRepair.proposal=f.workflow.controlledRepair.proposal;let calls=0;
    again.options.callAgent=async()=>{calls++;return {files:[{path:'package.json',content:rejected}]};};
    await assert.rejects(executeControlledRepairs(again.options),/prestart/);assert.equal(calls,2);assert.equal(again.writes,0);
});
await runAsyncTest('a target the Coder returns unchanged is recorded byte-identical and the other targets still repair',async()=>{
    const f=fixture(),kept='export const kept = true;';
    f.files[1].content=kept;f.context.files[1]={...f.context.files[1],content:kept,sha256:digest(kept)};
    f.workflow.controlledRepair.proposal=inspectControlledRepairPlan({summary:'Yalnız gerekeni düzelt.',targets:[
        {path:'keep.ts',create:false,requirementIds:['REQ-1'],checkIds:['check'],instructions:'Yalnız gerçek hata varsa değiştir.',referencePaths:[]},
        {path:'src/app.ts',create:false,requirementIds:['REQ-1'],checkIds:['check'],instructions:'Lint hatasını düzelt.',referencePaths:[]}]},f.context);
    f.options.callAgent=async(_role,prompt)=>prompt.startsWith('Repair exactly one file: keep.ts.')
        ?{files:[{path:'keep.ts',content:kept}]}:{files:[{path:'src/app.ts',content:'export const repaired = true;'}]};
    await executeControlledRepairs(f.options);
    const [same,repaired]=f.workflow.controlledRepair.attempts;
    assert.equal(f.writes,1);assert.equal(f.workflow.controlledRepair.phase,'patched');
    assert.deepEqual([same.phase,same.unchanged,same.outputSha256],['patched',true,digest(kept)]);
    assert.deepEqual([repaired.phase,repaired.unchanged],['patched',undefined]);
});
runTest('compiler output is grouped by project path with line, column and code',()=>{
    const errors=parseTypecheckErrors('src/a.ts(3,5): error TS2345: Argument mismatch.\r\n./tests/b.ts(1,1): error TS1005: x\nFound 2 errors.\nsrc/a.ts(9,2): error TS2339: Missing stock.');
    assert.deepEqual([...errors.keys()],['src/a.ts','tests/b.ts']);
    assert.deepEqual(errors.get('src/a.ts')[1],{line:9,column:2,code:'TS2339',message:'Missing stock.'});
});
await runAsyncTest('compiler errors in a written target get one Coder correction before review; other files are left alone',async()=>{
    const f=fixture(),prompts=[],tasks=[],summaries=[];
    f.options.callAgent=async(_role,prompt,opts)=>{prompts.push(prompt);tasks.push(opts.taskId);
        return {files:[{path:'src/app.ts',content:prompts.length===1?'export const repaired: number = "x";':'export const repaired: number = 1;'}]};};
    f.services.typeProbe=async({files})=>{assert.equal(files.find(file=>file.path==='src/app.ts').content.toString(),'export const repaired: number = "x";');
        return {passed:false,errors:new Map([['src/app.ts',[{line:1,column:14,code:'TS2322',message:"Type 'string' is not assignable to type 'number'."}]],['keep.ts',[{line:1,column:1,code:'TS1',message:'other'}]]])};};
    f.services.onTypeProbe=summary=>summaries.push(summary);
    await executeControlledRepairs(f.options);
    assert.deepEqual(tasks,['controlled-repair.src/app.ts','controlled-repair.src/app.ts.typecheck-retry']);
    assert.ok(prompts[1].includes("src/app.ts(1,14): TS2322 Type 'string' is not assignable to type 'number'."));
    assert.ok(prompts[1].includes('Current file:\nexport const repaired: number = "x";'));
    const [attempt]=f.workflow.controlledRepair.attempts;
    assert.deepEqual([attempt.phase,attempt.typecheckCorrected,attempt.outputSha256],['patched',true,digest('export const repaired: number = 1;')]);
    assert.equal(f.files[0].content,'export const repaired: number = 1;');assert.equal(f.writes,2);
    assert.deepEqual(summaries,[{status:'failed',targets:['src/app.ts'],otherFiles:['keep.ts']}]);
});
await runAsyncTest('a probe that cannot answer is skipped and the repair still reaches review',async()=>{
    for(const typeProbe of [async()=>null,async()=>{throw new Error('worker offline');}]){
        const f=fixture(),summaries=[];f.services.typeProbe=typeProbe;f.services.onTypeProbe=summary=>summaries.push(summary);
        await executeControlledRepairs(f.options);
        assert.equal(f.calls,1);assert.equal(f.writes,1);assert.equal(f.workflow.controlledRepair.phase,'patched');
        assert.equal(summaries[0].status,'unavailable');
    }
});
await runAsyncTest('a source answer that does not parse gets one correction with the line before anything is written',async()=>{
    const broken="export const role = 'admin';\\n\nexport const ok = true;";
    const f=fixture(),prompts=[],tasks=[];
    f.options.callAgent=async(_role,prompt,opts)=>{prompts.push(prompt);tasks.push(opts.taskId);
        return {files:[{path:'src/app.ts',content:prompts.length===1?broken:'export const repaired = true;'}]};};
    await executeControlledRepairs(f.options);
    assert.deepEqual(tasks,['controlled-repair.src/app.ts','controlled-repair.src/app.ts.syntax-retry']);
    assert.match(prompts[1],/does not parse and nothing was written/);
    assert.ok(prompts[1].includes("satır 1: export const role = 'admin';\\n"));
    assert.equal(f.writes,1);assert.equal(f.files[0].content,'export const repaired = true;');
    const again=fixture();let calls=0;
    again.options.callAgent=async()=>{calls++;return {files:[{path:'src/app.ts',content:broken}]};};
    await assert.rejects(executeControlledRepairs(again.options),/Coder çıktısı ayrıştırılamıyor: src\/app\.ts/);
    assert.equal(calls,2);assert.equal(again.writes,0);
});
runTest('the syntax check covers JS and TS variants and leaves other files alone',()=>{
    assert.equal(controlledSourceSyntaxError('src/page.tsx','export default function P(){ return <div>Merhaba</div>; }'),null);
    assert.equal(controlledSourceSyntaxError('tests/a.test.js',"import test from 'node:test';\nawait Promise.resolve();"),null);
    assert.equal(controlledSourceSyntaxError('src/types.ts','export type A = { id: string };'),null);
    assert.match(controlledSourceSyntaxError('tests/a.mjs','const a = ;'),/^tests\/a\.mjs: .*satır 1: const a = ;$/);
    assert.equal(controlledSourceSyntaxError('README.md','\\n broken ('),null);
    assert.equal(controlledSourceSyntaxError('package.json','{'),null);
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
await runAsyncTest('context overflow names each target whose references do not fit the Coder budget',async()=>{
    const files=[{path:'tests/a.test.js'},{path:'tests/b.test.js'},{path:'src/big.tsx'},{path:'src/small.ts'}];
    const budgets=[];
    const buildContext=async({dependencyTargetFiles,targetFiles,maxBytes})=>{budgets.push(maxBytes);
        return dependencyTargetFiles.includes('src/big.tsx')?`File: ${targetFiles[0]} (existing target)\nOMITTED CONTEXT\n- src/big.tsx: budget (whole file)`
            :dependencyTargetFiles.map(path=>`File: ${path} (dependency)`).join('\n');};
    const overflow=await controlledRepairContextOverflow({projectDir:'unused',files,buildContext,targets:[
        {path:'tests/a.test.js',referencePaths:['src/small.ts']},
        {path:'tests/b.test.js',referencePaths:['src/small.ts','src/big.tsx','tests/new-fixture.mjs']}]});
    assert.deepEqual(overflow,['tests/b.test.js']);
    assert.deepEqual(budgets,[CONTROLLED_CODER_CONTEXT_BYTES,CONTROLLED_CODER_CONTEXT_BYTES]);
});
await runAsyncTest('a file an earlier target of the same batch writes gets growth room in a later target context',async()=>{
    const files=[{path:'tests/journey.test.js'},{path:'src/page.tsx'},{path:'src/service.ts'}];
    const near=CONTROLLED_CODER_CONTEXT_BYTES-CONTROLLED_BATCH_FILE_RESERVE_BYTES+1;
    const buildContext=async({dependencyTargetFiles,targetFiles})=>{
        const head=[...targetFiles,...dependencyTargetFiles,'src/service.ts'].map(path=>`File: ${path} (1 KB)`).join('\n');
        return head+'x'.repeat(Math.max(0,near-Buffer.byteLength(head)));};
    // The new fixture does not exist when the plan is measured; it is written before the journey test.
    const fixtureFirst=[{path:'tests/fixture.ts',referencePaths:[]},{path:'tests/journey.test.js',referencePaths:['src/page.tsx','tests/fixture.ts']}];
    assert.deepEqual(await controlledRepairContextOverflow({projectDir:'unused',files,buildContext,targets:fixtureFirst}),['tests/journey.test.js']);
    assert.deepEqual(controlledRepairBatchGrowth(fixtureFirst,1,['tests/journey.test.js','src/page.tsx']),
        {paths:['tests/fixture.ts'],bytes:CONTROLLED_BATCH_FILE_RESERVE_BYTES});
    // An automatically included file rewritten earlier in the batch counts as well.
    const serviceFirst=[{path:'src/service.ts',referencePaths:[]},{path:'tests/journey.test.js',referencePaths:['src/page.tsx']}];
    assert.deepEqual(await controlledRepairContextOverflow({projectDir:'unused',files,buildContext,targets:serviceFirst}),['tests/journey.test.js']);
    // Later targets are written after this one and leave its context unchanged.
    const journeyFirst=[{path:'tests/journey.test.js',referencePaths:['src/page.tsx']},{path:'src/service.ts',referencePaths:[]}];
    assert.deepEqual(await controlledRepairContextOverflow({projectDir:'unused',files,buildContext,targets:journeyFirst}),[]);
});
await runAsyncTest('the context base measures the target with its automatic project files and no references',async()=>{
    const calls=[];
    const buildContext=async options=>{calls.push(options);return 'File: tests/a.test.js (1 KB)\nx\nFile: package.json (1 KB)\ny';};
    const base=await controlledRepairContextBase({projectDir:'unused',files:[],path:'tests/a.test.js',buildContext});
    assert.deepEqual(base.paths,['tests/a.test.js','package.json']);
    assert.equal(base.bytes,Buffer.byteLength('File: tests/a.test.js (1 KB)\nx\nFile: package.json (1 KB)\ny'));
    assert.deepEqual(calls[0].dependencyTargetFiles,[]); assert.deepEqual(calls[0].targetFiles,['tests/a.test.js']);
    assert.equal(calls[0].maxBytes,CONTROLLED_CODER_CONTEXT_BYTES);
});
finish();
