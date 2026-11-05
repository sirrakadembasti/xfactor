import test from 'node:test';
import assert from 'node:assert/strict';
import * as language from '../contracts/uiLanguageEvidence.js';
import { verifyBrowserJourney } from '../verification/browserVerifier.js';

const catalogue = { language: 'tr', reviewed: true, scopeDeclared: true, surfaces: [
  { route: '/accounts', role: 'admin', state: 'initial', labels: [{ text: 'Yönetici', context: 'role-display', anchor: 'html:nth-child(1)>body:nth-child(2)>span:nth-child(2)' },
      { text: 'Ali', context: 'account-display', anchor: 'html:nth-child(1)>body:nth-child(2)>span:nth-child(3)' }],
    allowed: [{ text: 'admin', kind: 'text', context: 'technical-id', anchor: 'html:nth-child(1)>body:nth-child(2)>code:nth-child(1)' }] }
] };
const snapshot = { route: '/accounts', role: 'admin', state: 'initial', truncated: false, entries: [
  { kind: 'text', text: 'admin', anchor: 'html:nth-child(1)>body:nth-child(2)>code:nth-child(1)' },
  { kind: 'text', text: 'Yönetici', anchor: 'html:nth-child(1)>body:nth-child(2)>span:nth-child(2)' },
  { kind: 'text', text: 'Ali', anchor: 'html:nth-child(1)>body:nth-child(2)>span:nth-child(3)' }
] };
const evidence = { version: 1, truncated: false, snapshots: [snapshot] };

test('reviewed anchored technical identifier does not authorize the same token in a visible role field', () => {
  assert.equal(language.evaluateUiLanguageEvidence(catalogue, evidence).status, 'passed');
  const wrongDisplay = structuredClone(evidence);
  wrongDisplay.snapshots[0].entries[1].text = 'admin';
  assert.notEqual(language.evaluateUiLanguageEvidence(catalogue, wrongDisplay).status, 'passed');
  const wrongAnchor = structuredClone(evidence);
  wrongAnchor.snapshots[0].entries[1].anchor = 'html:nth-child(1)>body:nth-child(2)>span:nth-child(3)';
  assert.equal(language.evaluateUiLanguageEvidence(catalogue, wrongAnchor).status, 'blocked');
});

const journeys = ['positive', 'negative'].map(kind => ({ role: 'admin', kind, authState: 'authenticated',
  steps: [{ action: 'click', selector: 'button' }], expectedOutcome: { kind: kind === 'positive' ? 'success' : 'denied', text: 'Tamam' } }));
function adapter(runtime = evidence) {
  return { id: 'operator-fixture', request: async () => ({ statusCode: 200, html: '<html></html>' }), interact: async request => ({
    passed: true, session: { authenticatedRole: 'admin' }, actions: [{ index: 0, action: 'click', target: 'button', completed: true, accessibleName: 'Aç', keyboardReachable: true }],
    outcome: { kind: request.kind === 'positive' ? 'success' : 'denied', text: 'Tamam', visible: true }, viewport: { width: 375, horizontalOverflow: false },
    ...(request.uiLanguageEvidence?.enabled ? { uiLanguageEvidence: runtime } : {})
  }) };
}
const options = extra => ({ adapter: adapter(), management: { needed: true, roles: [{ name: 'admin' }] }, roleJourneys: journeys, uiLanguageRequired: true, ...extra });

test('model reviewed:true catalogue without independent source/run review binding cannot pass', async () => {
  const result = await verifyBrowserJourney('http://localhost', { uiLanguageCatalogue: catalogue }, options({ uiLanguageReview: { catalogue } }));
  assert.equal(result.checks.find(check => check.name === 'ui_language_evidence')?.status, 'blocked');
});

test('independent matching review binding forwards bounded inventory and retains declared surface evidence', async () => {
  assert.equal(typeof language.hashUiLanguageCatalogue, 'function');
  const binding = { sourceHash: 'a'.repeat(64), artifactHash: 'b'.repeat(64), contractId: 'contract-3', runId: 'run-1', catalogueHash: language.hashUiLanguageCatalogue(catalogue) };
  const result = await verifyBrowserJourney('http://localhost', {}, options({ uiLanguageReview: { catalogue, binding }, uiLanguageBinding: binding }));
  const check = result.checks.find(check => check.name === 'ui_language_evidence');
  assert.equal(check?.status, 'passed');
  assert.equal(check.evidence.fullProductProof, false);
  assert.equal(check.evidence.scope, 'declared-surfaces');
  assert.equal(check.evidence.inventory.snapshots[0].entries[1].text, 'Yönetici');
  for (const field of ['sourceHash', 'artifactHash', 'contractId', 'runId', 'catalogueHash']) {
    const invalid = { ...binding, [field]: field.endsWith('Hash') ? 'c'.repeat(64) : 'foreign' };
    const rejected = await verifyBrowserJourney('http://localhost', {}, options({ uiLanguageReview: { catalogue, binding }, uiLanguageBinding: invalid }));
    assert.equal(rejected.checks.find(item => item.name === 'ui_language_evidence')?.status, 'blocked', field);
  }
});

test('a wrong-session browser result cannot supply an independently passing language check', async () => {
  const binding = { sourceHash: 'a'.repeat(64), artifactHash: 'b'.repeat(64), contractId: 'contract-3', runId: 'run-1', catalogueHash: language.hashUiLanguageCatalogue(catalogue) };
  const browser = adapter();
  const interact = browser.interact;
  browser.interact = async request => ({ ...await interact(request), session: { authenticatedRole: 'foreign-role' } });
  const result = await verifyBrowserJourney('http://localhost', {}, options({ adapter: browser, uiLanguageReview: { catalogue, binding }, uiLanguageBinding: binding }));
  assert.equal(result.checks.find(check => check.name === 'ui_language_evidence')?.status, 'blocked');
});

test('browser verifier retains only bounded explicit display profile fields from a proved session', async () => {
  const browser = adapter();
  const interact = browser.interact;
  browser.interact = async request => ({ ...await interact(request), session: { authenticatedRole: 'admin', displayProfile: {
    displayName: 'Çağrı Öztürk', roleDisplayName: 'Yönetici', username: 'admin', token: 'PRIVATE_TOKEN'
  } } });
  const result = await verifyBrowserJourney('http://localhost', {}, options({ adapter: browser }));
  const journey = result.checks.find(check => check.name === 'browser_management_interaction').evidence.journeys[0];
  assert.deepEqual(journey.displayProfile, { displayName: 'Çağrı Öztürk', roleDisplayName: 'Yönetici' });
  assert.ok(!JSON.stringify(journey).includes('PRIVATE_TOKEN'));
});

test('role and account display declarations require occurrence anchors', () => {
  for (const context of ['role-display', 'account-display']) {
    const unboundDisplay = structuredClone(catalogue);
    unboundDisplay.surfaces[0].labels = [{ text: 'Yönetici', context }];
    assert.equal(language.evaluateUiLanguageEvidence(unboundDisplay, evidence).status, 'blocked', context);
  }
});

const observationBinding = { sourceHash: 'a'.repeat(64), artifactHash: 'b'.repeat(64), contractId: 'contract-3', runId: 'run-1' };
const observationOptions = extra => options({ uiLanguageObservation: { binding: observationBinding, routeTemplates: ['/accounts'] }, uiLanguageObservationBinding: observationBinding, ...extra });

test('independently bound observation collects safe catalogue candidates but never passes acceptance', async () => {
  const runtime = structuredClone(evidence);
  runtime.rawSource = 'PRIVATE_SOURCE';
  runtime.snapshots[0].id = 'PRIVATE_DOM_ID';
  runtime.snapshots[0].entries[0].source = 'PRIVATE_SOURCE';
  const result = await verifyBrowserJourney('http://localhost', {}, observationOptions({ adapter: adapter(runtime) }));
  const check = result.checks.find(item => item.name === 'ui_language_evidence');
  assert.equal(check.status, 'blocked');
  assert.equal(check.evidence.advisory, true);
  assert.equal(check.evidence.needsReview, true);
  assert.equal(check.evidence.fullProductProof, false);
  assert.equal(check.evidence.inventory.snapshots.length, 2);
  assert.equal(check.evidence.inventory.snapshots[0].entries[1].text, 'Yönetici');
  assert.ok(!JSON.stringify(check).includes('PRIVATE_'));
});

test('observation self-declaration, stale bindings and unsafe route scopes collect nothing', async () => {
  const cases = [
    { uiLanguageObservationBinding: undefined },
    ...Object.keys(observationBinding).map(field => ({ uiLanguageObservationBinding: { ...observationBinding, [field]: field.endsWith('Hash') ? 'c'.repeat(64) : 'foreign' } })),
    ...[['/accounts?token=secret'], ['/accounts#secret'], ['https://example.com'], ['/accounts/%2fsecret'], ['/../accounts'], ['/accounts', '/accounts'], []].map(routeTemplates => ({ uiLanguageObservation: { binding: observationBinding, routeTemplates } }))
  ];
  for (const extra of cases) {
    const result = await verifyBrowserJourney('http://localhost', {}, observationOptions(extra));
    const check = result.checks.find(item => item.name === 'ui_language_evidence');
    assert.equal(check.status, 'blocked');
    assert.equal(check.evidence.inventory, undefined);
  }
});

test('observation rejects undeclared runtime routes and strips unapproved snapshot fields', async () => {
  const runtime = structuredClone(evidence);
  runtime.snapshots[0].route = '/accounts/PRIVATE_ID?token=PRIVATE_TOKEN';
  const result = await verifyBrowserJourney('http://localhost', {}, observationOptions({ adapter: adapter(runtime) }));
  const check = result.checks.find(item => item.name === 'ui_language_evidence');
  assert.equal(check.status, 'blocked');
  assert.equal(check.evidence.inventory.truncated, true);
  assert.ok(!JSON.stringify(check).includes('PRIVATE_'));
});
