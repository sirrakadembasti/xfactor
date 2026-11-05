import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { PassThrough } from 'node:stream';
import { createProxy } from '../registryProxy.js';
function request(proxy,path) { return new Promise((resolve,reject)=>{http.get({host:'127.0.0.1',port:proxy.address().port,path},res=>{res.resume();res.once('end',()=>resolve(res.statusCode));res.once('aborted',()=>reject(new Error('Response aborted')));res.once('error',reject);}).once('error',reject);}); }
test('origin-form network-path URLs cannot bypass the fixed registry host allowlist',async()=>{
  let outbound=0;
  const proxy=await createProxy({resolver:{resolve:async()=>['104.16.26.34']},connector:()=>{outbound++;throw new Error('Unexpected outbound');}});
  try {assert.equal(await request(proxy,'//unapproved.example/package'),403);assert.equal(outbound,0);}finally{await new Promise(resolve=>proxy.close(resolve));}
});
test('a late upstream response after a timeout cannot write another set of headers',async()=>{
  const proxy=await createProxy({resolver:{resolve:async()=>['104.16.26.34']},connector:(_options,callback)=>{
    const upstream=new PassThrough();upstream.setTimeout=(_ms,timedOut)=>{queueMicrotask(()=>{
      timedOut();const response=new PassThrough();response.statusCode=200;response.headers={};callback(response);response.end('late');
    });return upstream;};return upstream;
  }});
  try{assert.equal(await request(proxy,'/fixture'),504);}finally{await new Promise(resolve=>proxy.close(resolve));}
});
test('an upstream body timeout cannot become a completed HTTP 200 with a truncated artifact',async()=>{
  const proxy=await createProxy({resolver:{resolve:async()=>['104.16.26.34']},connector:(_options,callback)=>{
    const upstream=new PassThrough();let timedOut;upstream.setTimeout=(_ms,cb)=>{timedOut=cb;return upstream;};
    queueMicrotask(()=>{const response=new PassThrough();response.statusCode=200;response.headers={};callback(response);response.write('partial artifact');setImmediate(()=>timedOut());});return upstream;
  }});
  try{await assert.rejects(request(proxy,'/fixture'),/aborted|socket|reset/i);}finally{await new Promise(resolve=>proxy.close(resolve));}
});
test('a reset during a 200 response records an incomplete upstream transfer', { timeout: 3000 }, async () => {
  const finishedObservation = Promise.withResolvers();
  const proxy = await createProxy({ resolver: { resolve: async () => ['104.16.26.34'] },
    onObservation: event => { if (event.state === 'finished') finishedObservation.resolve(event); }, connector: (_options, callback) => {
      const upstream = new PassThrough();
      upstream.setTimeout = () => upstream;
      queueMicrotask(() => {
        const response = new PassThrough();
        response.statusCode = 200;
        response.headers = {};
        callback(response);
        response.write('partial artifact');
        setImmediate(() => response.destroy(Object.assign(new Error('reset'), { code: 'ECONNRESET' })));
      });
      return upstream;
    } });
  try {
    await assert.rejects(request(proxy, '/fixture'), /aborted|socket|reset/i);
    const finished = await finishedObservation.promise;
    assert.equal(finished.statusCode, 200);
    assert.equal(finished.responseComplete, false);
    assert.equal(finished.errorCode, 'ECONNRESET');
  } finally { await new Promise(resolve => proxy.close(resolve)); }
});
test('registry observations contain only bounded timing/status metadata and observer failure is harmless',async()=>{
  const observations=[];
  const proxy=await createProxy({resolver:{resolve:async()=>['104.16.26.34']},onObservation:event=>{observations.push(event);if(event.state==='started')throw new Error('Observer failed');},connector:(_options,callback)=>{
    const upstream=new PassThrough();upstream.setTimeout=()=>upstream;
    queueMicrotask(()=>{const response=new PassThrough();response.statusCode=200;response.headers={};callback(response);response.end('metadata');});return upstream;
  }});
  try {assert.equal(await request(proxy,'/private-package-name?token=private-value'),200);assert.equal(observations.length,2);
    assert.equal(observations[0].target,'npm');assert.equal(observations[1].statusCode,200);assert.equal(observations[1].state,'finished');
    assert.ok(!JSON.stringify(observations).includes('private'));assert.ok(Number.isFinite(observations[1].elapsedMs));
  }finally{await new Promise(resolve=>proxy.close(resolve));}
});
