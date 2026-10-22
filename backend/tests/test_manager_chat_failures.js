import assert from 'node:assert/strict';
import express from 'express';
import { createProjectRouter } from '../routes/projectRoutes.js';
import { createProject } from '../projectRepository.js';
import { readProjectState } from '../engine/index.js';
import { getProjectLogs } from '../db.js';
import { getLatestRevision } from '../contracts/projectContract.js';

const app = express(); app.use(express.json());
let nextFailure = new DOMException('secret-provider-text', 'TimeoutError');
let receivedPurpose;
let responder = async (_messages, options) => { receivedPurpose = options.purpose; throw nextFailure; };
let executions = 0;
let ownerAllowed = true;
app.use('/api/projects', createProjectRouter({
  requireAuth: (req, _res, next) => { req.user = { id: 'test', isAdmin: true }; req.requestId = 'fixture-request'; next(); },
  projectAccess: role => (_req, res, next) => role === 'owner' && !ownerAllowed ? res.status(403).json({ error: 'Owner required' }) : next(),
  managerResponder: (...args) => responder(...args),
  projectExecutor: async () => { executions++; }
}));
const server = app.listen(0, '127.0.0.1');
await new Promise(resolve => server.once('listening', resolve));
try {
  const project = await createProject({ title: 'Manager diagnostic failure' });
  const url = `http://127.0.0.1:${server.address().port}/api/projects/${project.id}/chat`;
  for (const [error, code, status] of [[new DOMException('secret-provider-text', 'TimeoutError'), 'LLM_TIMEOUT', 504],
    [Object.assign(new Error('secret-provider-text'), { upstreamStatus: 429 }), 'LLM_RATE_LIMIT', 502],
    [Object.assign(new Error('secret-provider-text'), { upstreamStatus: 401 }), 'LLM_AUTH', 502]]) {
    nextFailure = error;
    const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ message: 'Bir otel yönetimi planı oluştur.' }) });
    assert.equal(response.status, status);
    const result = await response.json();
    assert.equal(result.code, code);
    assert.equal(result.requestId, 'fixture-request');
    assert.ok(!JSON.stringify(result).includes('secret-provider-text'));
    assert.ok(result.durationMs >= 0);
  }
  assert.equal(receivedPurpose, 'manager');
  const logs = getProjectLogs(project.id);
  assert.equal(logs.filter(log => log.action === 'chat_error').length, 3);
  assert.ok(logs.every(log => !log.message.includes('secret-provider-text')));
  assert.equal((await readProjectState(project.id)).status, 'planning');
  const validPlan = { summary: 'Hotel workspace', talimatname: '# Hotel workspace', domains: [{ name: 'app', prefix: 'app' }], requirements: [{ id: 'REQ-1', statement: 'Hotel dashboard', mandatory: true }], management: { needed: false, reason: 'Fixture static dashboard' } };
  const invalidPlan = { ...validPlan, management: undefined };
  const postChat = async (id, message) => {
    const result = await fetch(url.replace(project.id, id), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ message }) });
    return { status: result.status, state: await result.json() };
  };
  responder = async () => 'Uzun açıklama\n```json\n'+JSON.stringify(validPlan)+'\n```\nYeşil düğmeye basın.';
  const draft = await createProject({ title: 'Valid mixed prose draft' });
  let result = await postChat(draft.id, 'Otel panosu planla');
  assert.equal(result.state.status, 'pending_approval');
  assert.ok(!result.state.chatHistory.at(-1).parts[0].text.includes('```'));
  responder = async () => { throw new Error('Approval must not regenerate a plan'); };
  result = await postChat(draft.id, 'varsayımlarla devam et');
  assert.equal(result.status, 200);
  assert.equal(result.state.status, 'implementing');
  assert.equal(executions, 1);
  result = await postChat(draft.id, 'planı onaylıyorum');
  assert.equal(result.status, 200);
  assert.equal(executions, 1, 'duplicate approval must not launch twice');
  let calls = 0;
  responder = async messages => {
    assert.equal(messages[0].role, 'system');
    assert.ok(!messages[0].content.includes('PROJECT_TITLE_POLICY_OVERRIDE'));
    assert.equal(messages[1].role, 'user');
    assert.match(messages[1].content, /UNTRUSTED_PROJECT_CONTEXT/);
    assert.match(messages[1].content, /PROJECT_TITLE_POLICY_OVERRIDE/);
    if (++calls === 1) return JSON.stringify(invalidPlan);
    assert.match(messages[0].content, /zorunlu yapısal alanlar eksik/);
    assert.match(JSON.parse(messages[2].content).task, /Eksiksiz plan JSON/);
    return JSON.stringify(validPlan);
  };
  const repaired = await createProject({ title: 'PROJECT_TITLE_POLICY_OVERRIDE' });
  result = await postChat(repaired.id, 'varsayımlarla devam et');
  assert.equal(calls, 2);
  assert.equal(result.state.status, 'implementing');
  assert.equal(executions, 2);
  responder = async () => JSON.stringify(invalidPlan);
  const broken = await createProject({ title: 'Invalid plan visible error' });
  result = await postChat(broken.id, 'varsayımlarla devam et');
  assert.equal(result.state.status, 'planning');
  const errorText = result.state.chatHistory.at(-1).parts[0].text;
  assert.match(errorText, /doğrulanamadı/);
  assert.ok(!errorText.includes('```') && !errorText.includes('Planı Onayla ve Başlat'));
  assert.equal(executions, 2);
  responder = async () => JSON.stringify(validPlan);
  const restricted = await createProject({ title: 'Editor cannot approve' });
  await postChat(restricted.id, 'Plan öner');
  ownerAllowed = false;
  result = await postChat(restricted.id, 'varsayımlarla devam et');
  assert.equal(result.status, 403);
  assert.equal(executions, 2);
  assert.equal((await readProjectState(restricted.id)).status, 'pending_approval');
  ownerAllowed = true;
  const recovery = await createProject({ title: 'Previously shown rejected draft' });
  const { appendProjectChatMessage } = await import('../projectRepository.js');
  appendProjectChatMessage(recovery.id, 'model', 'Önceki plan:\n```json\n'+JSON.stringify(invalidPlan)+'\n```', new Date().toISOString());
  calls = 0;
  responder = async () => { calls++; return JSON.stringify(validPlan); };
  result = await postChat(recovery.id, 'varsayımlarla devam et');
  assert.equal(calls, 1, 'repair the presented draft directly instead of regenerating it');
  assert.equal(result.state.status, 'implementing');
  assert.equal(executions, 3);
  responder = async () => 'Plan hazır. Yeşil Planı Onayla ve Başlat butonuna basın.';
  const ghost = await createProject({ title: 'Ghost approval button' });
  result = await postChat(ghost.id, 'Plan öner');
  assert.equal(result.state.status, 'planning');
  assert.ok(!result.state.chatHistory.at(-1).parts[0].text.includes('Planı Onayla ve Başlat'));
  const { isManagerApproval, inspectManagerPlan, canRepairManagerFixtures, buildManagerPlanRepairRequest, applyManagerPlanCorrection } = await import('../routes/managerChatPlan.js');
  for (const text of ['varsayımlarla devam et', 'Varsayımlarla devam edelim.', 'planı onaylıyorum', 'başlat']) assert.equal(isManagerApproval(text), true, text);
  for (const text of ['onaylama', 'başlatma', 'nasıl başlatacağım?', 'planı onaylıyorum ama ödeme modülünü çıkar', 'devam etmeden önce açıkla']) assert.equal(isManagerApproval(text), false, text);
  assert.ok(inspectManagerPlan('SQL örneği\n```sql\nSELECT 1;\n```\nPlan:\n```json\n'+JSON.stringify(validPlan)+'\n```').plan);
  assert.ok(inspectManagerPlan(JSON.stringify(invalidPlan)).error);
  assert.ok(!inspectManagerPlan(JSON.stringify(validPlan).slice(0,-1)).plan, 'truncated JSON must not be invented into an approvable contract');
  const managedDraft = { ...validPlan, management: { needed: true, reason: 'Track hotel assets',
    authentication: { login: '/login', apiLogin: { path: '/api/auth/login' }, accountProvisioning: 'Admin invite', publicRegistration: false },
    resources: [{ name: 'Asset', operations: ['create','read','update','delete'], readAccess: 'authenticated', uiPath: '/assets', apiPath: '/api/assets',
      deletionPolicy: { relatedData: 'preserve', reason: 'Keep asset activity', retentionRule: 'Until archive approval' },
      verification: { itemPath: '/api/assets/{id}', updateMethod: 'PATCH', deleteExpectation: { kind: 'changed', field: 'isDeleted', value: true } } }],
    roles: [{ name: 'owner', permissions: [{ resource: 'Asset', operations: ['create','read','update','delete'] }], demoUser: { username: 'owner-test', setup: 'isolated-test-seed' }, journeys: { positive: ['Create asset'], negative: ['Anonymous access denied'] } }] } };
  const correction = { resourceUpdates: [{ name: 'Asset', verification: { retention: { createPath: '/api/activity', createBody: { assetId: '{parentId}', note: '{nonce}' }, parentField: 'assetId', itemPath: '/api/activity/{id}' }, deleteExpectation: { kind:'field', field:'status', equals:'void' } } }],
    roleJourneys: ['positive','negative'].map(kind=>({role:'owner',kind,authState:kind==='negative'?'anonymous':'authenticated',steps:[{action:'click',selector:'#assets'}],expectedOutcome:{kind:kind==='negative'?'denied':'success',text:kind==='negative'?'Access denied':'Asset list'}})) };
  const inspected = inspectManagerPlan(JSON.stringify(managedDraft));
  const request = buildManagerPlanRepairRequest(inspected, 'varsayımlarla devam et');
  assert.equal(canRepairManagerFixtures(inspected), true);
  assert.match(request.task, /resourceUpdates/);
  assert.ok(request.issues.some(issue=>issue.includes('Asset')) && request.issues.some(issue=>issue.includes('owner')));
  const corrected = applyManagerPlanCorrection(managedDraft, JSON.stringify(correction));
  assert.ok(corrected.plan, corrected.error);
  assert.deepEqual(corrected.plan.management.resources[0].verification.deleteExpectation, { kind:'field', field:'isDeleted', equals:true }, 'retain the intended field and boolean type');
  assert.deepEqual(corrected.plan.management.resources[0].deletionPolicy, managedDraft.management.resources[0].deletionPolicy);
  assert.ok(!applyManagerPlanCorrection(managedDraft, JSON.stringify({resourceUpdates:[{name:'Unknown',verification:{}}]})).plan);
  assert.ok(!applyManagerPlanCorrection(managedDraft, JSON.stringify(validPlan)).plan, 'repair cannot remove the management scope');
  const missingAuth = structuredClone(corrected.plan);
  delete missingAuth.management.authentication;
  const missingAuthResult = inspectManagerPlan(JSON.stringify(missingAuth));
  assert.equal(canRepairManagerFixtures(missingAuthResult), false);
  assert.match(buildManagerPlanRepairRequest(missingAuthResult, 'onaylıyorum').task, /Eksiksiz plan JSON/);
  assert.ok(applyManagerPlanCorrection(missingAuth, JSON.stringify(corrected.plan)).plan);
  assert.match(buildManagerPlanRepairRequest({ candidate:null,error:'Truncated' }, 'onaylıyorum', 'Hotel requirements').draft, /Hotel requirements/);
  const scopedRecovery = await createProject({ title: 'Scoped fixture repair then approval' });
  appendProjectChatMessage(scopedRecovery.id, 'model', JSON.stringify(managedDraft), new Date().toISOString());
  responder = async messages => {
    assert.match(messages[0].content, /yalnız eksik fixture alanlarını döndür/);
    assert.match(JSON.parse(messages[2].content).task, /resourceUpdates/);
    return JSON.stringify(correction);
  };
  result = await postChat(scopedRecovery.id, 'varsayımlarla devam et');
  assert.equal(result.status, 200);
  assert.equal(result.state.status, 'implementing');
  assert.equal(executions, 4);
  assert.equal(result.state.plan.management.resources[0].verification.deleteExpectation.equals, true);
  const pause = await fetch(url.replace(project.id, scopedRecovery.id).replace(/\/chat$/, '/pause'), { method: 'POST' });
  assert.equal(pause.status, 200);
  assert.equal((await readProjectState(scopedRecovery.id)).status, 'paused');
  const previousRevision = getLatestRevision(scopedRecovery.id).revision;
  responder = async () => 'Düzeltme talimatı alındı; devam ettiğinizde uygulayacağım.';
  result = await postChat(scopedRecovery.id, 'Hatayı düzelt, devam için talimatı kaydet.');
  assert.equal(result.state.status, 'paused');
  assert.equal(result.state.remediation.ready, true);
  assert.equal(getLatestRevision(scopedRecovery.id).revision, previousRevision,
    'a natural-language remediation without a plan must retain the existing contract');
  const revisedPlan = { ...result.state.plan, summary: 'Hotel with corrected verification fixtures' };
  responder = async () => JSON.stringify(revisedPlan);
  result = await postChat(scopedRecovery.id, 'Plan fixture sözleşmesini düzelt, tam plan sun, henüz başlatma.');
  assert.equal(result.status, 200);
  assert.equal(result.state.status, 'pending_approval',
    'a validated revised plan must expose the approval UI even when the request says düzelt');
  assert.equal(result.state.plan.summary, revisedPlan.summary);
  assert.equal(result.state.remediation, null);
  assert.equal((await readProjectState(scopedRecovery.id)).status, 'pending_approval');
  const revisedContract = getLatestRevision(scopedRecovery.id);
  assert.equal(revisedContract.revision, previousRevision + 1);
  assert.equal(revisedContract.status, 'pending_approval');
  assert.equal(JSON.parse(revisedContract.contract_json).summary, revisedPlan.summary);
  assert.match(result.state.chatHistory.at(-1).parts[0].text, /\[PLAN_HAZIR\]/);
  assert.equal(executions, 4, 'publishing a revision must wait for explicit approval before execution');
  const { db } = await import('../db.js');
  const approvedBase = db.prepare("SELECT * FROM project_contracts WHERE project_id=? AND status='approved' ORDER BY revision DESC LIMIT 1").get(scopedRecovery.id);
  const basePlan = JSON.parse(approvedBase.contract_json);
  const patchBrowser = structuredClone(basePlan.browser);
  patchBrowser.roleJourneys[0].steps = [{ action: 'fill', selector: '#real-resource-name', value: '{nonce}' }, { action: 'click', selector: '#real-resource-submit' }];
  const patch = { planPatch: { baseContractId: approvedBase.id, baseContractHash: approvedBase.contract_hash, set: { browser: patchBrowser } } };
  let patchCalls = 0;
  responder = async () => { patchCalls++; return JSON.stringify(patch); };
  result = await postChat(scopedRecovery.id, 'Yalnız browser alanını düzelt; yeni planı henüz onaylama.');
  assert.equal(result.status, 200);
  assert.equal(result.state.status, 'pending_approval');
  assert.deepEqual(result.state.plan.browser, patchBrowser);
  const withoutBrowser = value => Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'browser'));
  assert.deepEqual(withoutBrowser(result.state.plan), withoutBrowser(basePlan), 'patch preserves every non-browser field exactly from APPROVED base, not pending draft');
  assert.equal(result.state.plan.requirements.length, basePlan.requirements.length);
  const patchRevision = getLatestRevision(scopedRecovery.id);
  assert.equal(patchRevision.revision, revisedContract.revision + 1);
  assert.equal(executions, 4);
  result = await postChat(scopedRecovery.id, 'Yalnız browser alanını düzelt, tekrar gönder.');
  assert.equal(result.status, 200);
  assert.equal(getLatestRevision(scopedRecovery.id).id, patchRevision.id, 'identical patch publication is idempotent');
  for (const bad of [
    { ...patch.planPatch, baseContractHash: '0'.repeat(64) },
    { ...patch.planPatch, baseContractId: revisedContract.id },
    { ...patch.planPatch, set: { browser: patchBrowser, summary: 'Scope drift' } },
    { ...patch.planPatch, set: JSON.parse('{"browser":{},"__proto__":{"polluted":true}}') }
  ]) {
    responder = async () => { patchCalls++; return JSON.stringify({ planPatch: bad }); };
    const beforeCalls = patchCalls;
    result = await postChat(scopedRecovery.id, 'Browser alanını düzelt; başlatma.');
    assert.ok([400, 409].includes(result.status), JSON.stringify(result));
    assert.equal(patchCalls, beforeCalls + 1, 'invalid patch must never enter full-plan remediation');
    assert.equal(getLatestRevision(scopedRecovery.id).id, patchRevision.id);
    assert.equal((await readProjectState(scopedRecovery.id)).status, 'pending_approval');
  }
  for (const badText of [JSON.stringify(patch).slice(0, -1), JSON.stringify({ ...patch, summary: 'Envelope scope drift' }),
    JSON.stringify({ planPatch: { ...patch.planPatch, set: { browser: { roleJourneys: [] } } } }),
    JSON.stringify({ planPatch: { ...patch.planPatch, set: { browser: { roleJourneys: [{ constructor: 'unsafe' }] } } } })]) {
    const inspectedPatch = inspectManagerPlan(badText, approvedBase);
    assert.equal(inspectedPatch.isPatch, true);
    assert.equal(inspectedPatch.plan, null);
    assert.ok(inspectedPatch.error);
    assert.equal(canRepairManagerFixtures(inspectedPatch), false);
  }
  assert.equal(inspectManagerPlan(JSON.stringify(patch)).plan, null, 'patch requires a server-provided approved base');
  console.log('PASS: mixed JSON is summarized, explicit chat approval starts once, invalid plans are repaired or explained, owner authorization preserved');
  console.log('PASS: Manager deadlines/quota/auth produce safe correlated failures, persist diagnostics, preserve planning');
} finally { await new Promise(resolve => server.close(resolve)); }
