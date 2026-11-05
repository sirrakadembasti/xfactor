import assert from 'node:assert/strict';
import vm from 'node:vm';
import { buildManagementPrismaSeedRequest } from '../verification/roleSessionAdapter.js';
import { createTestHarness } from './testHarness.js';
const { runTest, finish } = createTestHarness();
const management={roles:[{name:'admin',demoUser:{username:'admin-demo'}},{name:'warehouse_staff',demoUser:{username:'depo-demo'}}]};
runTest('seed protocol creates fresh credentials only in stdin and preserves child failure with redacted streams',()=>{
    const request=buildManagementPrismaSeedRequest(management,{DATABASE_URL:'file:./dev.db',NODE_ENV:'production'});
    const credentials=JSON.parse(request.input),secret=credentials.XFACTOR_DEMO_PASSWORD_ADMIN;
    const other=JSON.parse(buildManagementPrismaSeedRequest(management).input);
    assert.notEqual(secret,other.XFACTOR_DEMO_PASSWORD_ADMIN);assert.equal(request.env.NODE_ENV,'test');
    assert.ok(!JSON.stringify(request.args).includes(secret));assert.ok(!JSON.stringify(request.env).includes(secret));
    let observed,stdout='',stderr='';
    const requireMock=name=>{
        if(name==='node:fs')return {readFileSync:()=>request.input};
        if(name==='node:path')return {resolve:relative=>`/workspace/${relative}`,delimiter:':'};
        if(name==='node:child_process')return {spawnSync:(command,args,options)=>{observed={command,args,options};return {status:5,stdout:Buffer.from(`seed output ${secret}`),stderr:Buffer.from(`failure ${secret}`)};}};
        throw new Error('Unexpected module');
    };
    requireMock.resolve=()=>'/workspace/node_modules/prisma/build/index.js';
    const processMock={execPath:'/toolchain/node',env:{NODE_ENV:'production',PATH:'/usr/bin'},cwd:()=>'/workspace',stdout:{write:s=>{stdout+=s;}},stderr:{write:s=>{stderr+=s;}}};
    vm.runInNewContext(request.args[1],{require:requireMock,process:processMock});
    assert.equal(processMock.exitCode,5);assert.equal(observed.options.env.NODE_ENV,'test');assert.equal(observed.options.env.XFACTOR_DEMO_PASSWORD_ADMIN,secret);
    assert.equal(observed.options.env.PATH,'/workspace/node_modules/.bin:/usr/bin','Prisma must be able to launch the declared tsx seed binary');
    assert.equal(observed.command,'/toolchain/node');assert.deepEqual(Array.from(observed.args).slice(-2),['db','seed']);
    assert.ok(!stdout.includes(secret));assert.ok(!stderr.includes(secret));assert.match(stdout,/REDACTED/);
});
runTest('seed protocol rejects missing roles and credential variable collisions',()=>{
    assert.throws(()=>buildManagementPrismaSeedRequest({roles:[]}));
    assert.throws(()=>buildManagementPrismaSeedRequest({roles:[{name:'a-b',demoUser:{username:'one'}},{name:'a_b',demoUser:{username:'two'}}]}));
});
finish();
