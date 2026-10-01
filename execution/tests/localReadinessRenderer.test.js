import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { pathToFileURL } from 'node:url';
import { probeLocalReadiness } from '../localRuntime.js';

async function operatorBrowser(t, mode) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'xfactor-ready-renderer-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const file = path.join(root, 'operator-playwright.mjs');
  await fs.writeFile(file, `import vm from 'node:vm';
export const calls=[]; let content=''; let globals; let releaseLaunch;
export const release=()=>releaseLaunch();
export const chromium={launch:async options=>{calls.push({kind:'launch',options});if(${JSON.stringify(mode)}==='late-launch')await new Promise(resolve=>{releaseLaunch=resolve});return {
newContext:async()=>{calls.push({kind:'context'});return {newPage:async()=>{
calls.push({kind:'page'}); if(${JSON.stringify(mode)}==='page-failure')throw new Error('Renderer process unavailable');
if(${JSON.stringify(mode)}==='page-hang')await new Promise(()=>{});
return {setContent:async(html,options)=>{calls.push({kind:'content',options});content=html;
const element={textContent:''};const document={getElementById:()=>element}; globals={document}; globals.window=globals; globals.globalThis=globals;
const script=html.match(/<script>([\\s\\S]*?)<\\/script>/)?.[1]; if(script)vm.runInNewContext(script,globals);
},evaluate:async fn=>{calls.push({kind:'evaluate'});return ${JSON.stringify(mode)}==='false-proof'?false:vm.runInNewContext('('+fn.toString()+')()',globals)}};
}}},close:async()=>{calls.push({kind:'close'})}}}};`);
  const module = await import(pathToFileURL(file).href);
  return { tools: { playwright: file, chromium: path.join(root, 'operator-chromium'), versions: { node: '22.23.2' } }, calls: module.calls, release: module.release };
}
test('readiness rejects renderer creation failure even after successful Chromium launch/context', async t => {
  const fixture = await operatorBrowser(t, 'page-failure');
  await assert.rejects(probeLocalReadiness({ trustLocalCode: true, tools: fixture.tools }), /Renderer process unavailable/);
  assert.deepEqual(fixture.calls.map(call => call.kind), ['launch', 'context', 'page', 'close']);
});
test('readiness proves page content and JavaScript execution before returning capacity', async t => {
  const fixture = await operatorBrowser(t, 'success');
  const result = await probeLocalReadiness({ trustLocalCode: true, tools: fixture.tools });
  assert.equal(result.executionCapacity, true); assert.equal(result.osIsolation, false);
  assert.deepEqual(fixture.calls.map(call => call.kind), ['launch', 'context', 'page', 'content', 'evaluate', 'close']);
  assert.equal(fixture.calls[0].options.chromiumSandbox, true);
  assert.equal(fixture.calls[0].options.timeout, 30000);
  assert.equal(fixture.calls.find(call => call.kind === 'content').options.timeout, 30000);
});
test('readiness rejects missing renderer proof and closes Chromium', async t => {
  const fixture = await operatorBrowser(t, 'false-proof');
  await assert.rejects(probeLocalReadiness({ trustLocalCode: true, tools: fixture.tools }), /renderer.*proof|renderer.*verification/i);
  assert.equal(fixture.calls.at(-1).kind, 'close');
});
async function untilCall(fixture, kind) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (fixture.calls.some(call => call.kind === kind)) return;
    await new Promise(resolve => setImmediate(resolve));
  }
  assert.fail(`Readiness did not reach ${kind}`);
}
test('renderer startup is bounded by the overall 30-second readiness deadline', async t => {
  const fixture = await operatorBrowser(t, 'page-hang');
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const rejected = assert.rejects(probeLocalReadiness({ trustLocalCode: true, tools: fixture.tools }), /readiness timed out/);
  await untilCall(fixture, 'page'); t.mock.timers.tick(30000); await rejected;
  assert.equal(fixture.calls.at(-1).kind, 'close');
});
test('Chromium returning after the readiness deadline is closed', async t => {
  const fixture = await operatorBrowser(t, 'late-launch');
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const rejected = assert.rejects(probeLocalReadiness({ trustLocalCode: true, tools: fixture.tools }), /readiness timed out/);
  await untilCall(fixture, 'launch'); t.mock.timers.tick(30000); await rejected;
  fixture.release(); await untilCall(fixture, 'close');
  assert.deepEqual(fixture.calls.map(call => call.kind), ['launch', 'close']);
});
