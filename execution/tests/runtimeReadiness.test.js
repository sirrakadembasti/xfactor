import test from 'node:test';
import assert from 'node:assert/strict';
import { probeRuntimeReadiness } from '../runtime.js';
import { DOCKER_READINESS_PROBE_MS, DEFAULT_WORKER_READINESS_TIMEOUT_MS } from '../limits.js';
import { validateRuntimeConfig } from '../../backend/config.js';
test('Docker readiness uses one shared deadline and the outer HTTP timeout includes response time', async () => {
  let now=1000;const calls=[];
  await probeRuntimeReadiness({ now:()=>now, runDocker:async(args,options)=>{calls.push({args,options});now+=3000;} });
  assert.equal(calls.length,2);assert.equal(calls[0].args[0],'info');assert.equal(calls[1].args[0],'image');
  assert.equal(calls[0].options.deadline,1000+DOCKER_READINESS_PROBE_MS);assert.equal(calls[1].options.deadline,calls[0].options.deadline);
  assert.equal(calls[1].options.timeout,DOCKER_READINESS_PROBE_MS-3000);
  assert.ok(DEFAULT_WORKER_READINESS_TIMEOUT_MS>DOCKER_READINESS_PROBE_MS);
  assert.equal(validateRuntimeConfig({NODE_ENV:'development'}).READINESS_WORKER_TIMEOUT_MS,DEFAULT_WORKER_READINESS_TIMEOUT_MS);
});
test('readiness failures identify the bounded Docker phase without echoing raw command errors',async()=>{
  for(const phase of ['docker_info','image_inspect']){
    await assert.rejects(probeRuntimeReadiness({now:()=>1000,runDocker:async args=>{
      if(args[0]===(phase==='docker_info'?'info':'image'))throw Object.assign(new Error('private-path-and-output'),{code:'ENOENT'});
    }}),error=>{assert.equal(error.readinessPhase,phase);assert.equal(error.code,'ENOENT');assert.equal(error.readinessBudgetMs,DOCKER_READINESS_PROBE_MS);assert.equal(error.readinessElapsedMs,0);assert.ok(!error.message.includes('private'));return true;});
  }
});
test('exhausting the shared deadline never starts a second Docker command or performs a pull/build',async()=>{
  let now=1000,calls=0;
  await assert.rejects(probeRuntimeReadiness({now:()=>now,runDocker:async()=>{calls++;now+=DOCKER_READINESS_PROBE_MS+1;}}),error=>{
    assert.equal(error.code,'ETIMEDOUT');assert.equal(error.readinessPhase,'image_inspect');return true;
  });
  assert.equal(calls,1);
});
