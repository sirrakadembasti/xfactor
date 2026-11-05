import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateUiLanguageEvidence } from '../contracts/uiLanguageEvidence.js';

const fixtureRoleAnchor = 'html:nth-child(1)>body:nth-child(2)>span:nth-child(1)';
const fixtureAccountAnchor = 'html:nth-child(1)>body:nth-child(2)>span:nth-child(2)';
const surface = { route: '/login', role: 'admin', state: 'initial', labels: ['Şifre',
  { text: 'Yönetici', context: 'role-display', anchor: fixtureRoleAnchor },
  { text: 'Ali', context: 'account-display', anchor: fixtureAccountAnchor }
] };
const catalogue = { language: 'tr', reviewed: true, scopeDeclared: true, surfaces: [surface] };
const evidence = (texts, extra = {}) => ({ version: 1, truncated: false, snapshots: [{ route: '/login', role: 'admin', state: 'initial', truncated: false, entries: [...texts, 'Ali'].map(text => ({ kind: 'text', text, ...(text === 'Yönetici' ? { anchor: fixtureRoleAnchor } : text === 'Ali' ? { anchor: fixtureAccountAnchor } : {}) })) }], ...extra });

test('lang=tr does not excuse an English login label', () => {
  assert.equal(evaluateUiLanguageEvidence(catalogue, evidence(['Şifre', 'Yönetici', 'Login'], { documentLanguage: 'tr' })).status, 'failed');
});
test('technical role admin remains unchanged while visible Yönetici passes', () => {
  assert.equal(evaluateUiLanguageEvidence(catalogue, evidence(['Şifre', 'Yönetici'])).status, 'passed');
  assert.equal(surface.role, 'admin');
});
test('ASCII degraded required Turkish label fails', () => {
  assert.equal(evaluateUiLanguageEvidence(catalogue, evidence(['Sifre', 'Yönetici'])).status, 'failed');
});
test('unvisited declared surface, truncation and undeclared scope block proof', () => {
  for (const [cat, observed] of [
    [{ ...catalogue, surfaces: [...catalogue.surfaces, { ...surface, state: 'after:0' }] }, evidence(['Şifre', 'Yönetici'])],
    [catalogue, evidence(['Şifre', 'Yönetici'], { truncated: true })],
    [{ ...catalogue, scopeDeclared: false }, evidence(['Şifre', 'Yönetici'])],
    [catalogue, undefined]
  ]) assert.equal(evaluateUiLanguageEvidence(cat, observed).status, 'blocked');
});
test('uncatalogued Latin words block rather than claiming Turkish from diacritics', () => {
  assert.equal(evaluateUiLanguageEvidence(catalogue, evidence(['Şifre', 'Yönetici', 'SomethingUnreviewed'])).status, 'blocked');
});
test('text-only proper name and technical token allowances cannot prove display context', () => {
  const cat = { ...catalogue, surfaces: [{ ...surface, allowed: [{ text: 'admin', kind: 'text', context: 'technical-id' }, { text: 'Jane Doe', kind: 'text', context: 'proper-name' }] }] };
  assert.equal(evaluateUiLanguageEvidence(cat, evidence(['Şifre', 'Yönetici', 'admin', 'Jane Doe'])).status, 'blocked');
});
test('missing required display label blocks, observed English menu/error fails', () => {
  assert.equal(evaluateUiLanguageEvidence(catalogue, evidence(['Şifre'])).status, 'blocked');
  for (const text of ['Settings', 'An error occurred', 'No results found'])
    assert.equal(evaluateUiLanguageEvidence(catalogue, evidence(['Şifre', 'Yönetici', text])).status, 'failed');
});

test('malformed inventories and allowances block without throwing', () => {
  for (const bad of [null, {}, { route: '/login', role: 'admin', state: 'initial', truncated: false, entries: [null] }]) {
    assert.equal(evaluateUiLanguageEvidence(catalogue, { version: 1, truncated: false, snapshots: [bad] }).status, 'blocked');
  }
  const cat = { ...catalogue, surfaces: [{ ...surface, allowed: {} }] };
  assert.equal(evaluateUiLanguageEvidence(cat, evidence(['Şifre', 'Yönetici'])).status, 'blocked');
});

test('anonymous runtime cannot prove declared admin display surface', () => {
  const observed = evidence(['Şifre', 'Yönetici']);
  observed.snapshots[0].role = 'anonymous';
  assert.equal(evaluateUiLanguageEvidence(catalogue, observed).status, 'blocked');
});

test('visible English input button labels fail while excluded input values are never required', () => {
  const observed = evidence(['Şifre', 'Yönetici']);
  observed.snapshots[0].entries.push({ kind: 'button-value', text: 'Login' });
  assert.equal(evaluateUiLanguageEvidence(catalogue, observed).status, 'failed');
});

const roleDisplayAnchor = 'html:nth-child(1)>body:nth-child(2)>span:nth-child(1)';
const accountDisplayAnchor = 'html:nth-child(1)>body:nth-child(2)>span:nth-child(2)';
const technicalDisplayAnchor = 'html:nth-child(1)>body:nth-child(2)>code:nth-child(3)';
function displayFixture(roleText = 'Yönetici', accountText = 'Ali', role = 'admin') {
  return {
    catalogue: { language: 'tr', reviewed: true, scopeDeclared: true, surfaces: [{ route: '/profile', role, state: 'initial', labels: [
      { text: roleText, context: 'role-display', kind: 'text', anchor: roleDisplayAnchor },
      { text: accountText, context: 'account-display', kind: 'text', anchor: accountDisplayAnchor }
    ] }] },
    evidence: { version: 1, truncated: false, snapshots: [{ route: '/profile', role, state: 'initial', truncated: false, entries: [
      { text: roleText, kind: 'text', anchor: roleDisplayAnchor }, { text: accountText, kind: 'text', anchor: accountDisplayAnchor }
    ] }] }
  };
}

test('reviewed display contexts cannot approve known English role labels or role-derived demo names', () => {
  for (const context of ['role-display', 'account-display']) for (const text of [
    'admin', 'Administrator', 'warehouse_staff', 'Warehouse Staff', 'manager', 'viewer', 'editor', 'user',
    'Admin Demo', 'Demo Administrator', 'Warehouse Staff Demo', 'demo warehouse_staff', 'Manager Demo Account', 'Viewer Demo', 'Demo Editor', 'User Demo', 'Warehouse Demo'
  ]) {
    const fixture = displayFixture(context === 'role-display' ? text : 'Yönetici', context === 'account-display' ? text : 'Ali');
    assert.equal(evaluateUiLanguageEvidence(fixture.catalogue, fixture.evidence).status, 'failed', `${context}: ${text}`);
  }
});

test('authenticated heading-only scope cannot substitute for explicit role and account display proof', () => {
  const fixture = displayFixture();
  fixture.catalogue.surfaces[0].labels = ['Yönetici', 'Ali'];
  assert.equal(evaluateUiLanguageEvidence(fixture.catalogue, fixture.evidence).status, 'blocked');
});

test('optional but unobserved account display cannot close authenticated display coverage', () => {
  const fixture = displayFixture();
  fixture.catalogue.surfaces[0].labels[1].required = false;
  fixture.evidence.snapshots[0].entries.pop();
  assert.equal(evaluateUiLanguageEvidence(fixture.catalogue, fixture.evidence).status, 'blocked');
});

test('anchored role display cannot be excused by a conflicting technical-id allowance', () => {
  const fixture = displayFixture('admin');
  fixture.catalogue.surfaces[0].allowed = [{ text: 'admin', kind: 'text', context: 'technical-id', anchor: roleDisplayAnchor }];
  assert.equal(evaluateUiLanguageEvidence(fixture.catalogue, fixture.evidence).status, 'failed');
});

test('display proof is required per authenticated role across scope, with no anonymous or every-state requirement', () => {
  const fixture = displayFixture();
  const roleSurface = fixture.catalogue.surfaces[0];
  const roleSnapshot = fixture.evidence.snapshots[0];
  const accountLabel = roleSurface.labels.pop();
  const accountEntry = roleSnapshot.entries.pop();
  fixture.catalogue.surfaces.push({ ...roleSurface, state: 'after:0', labels: [accountLabel] }, { route: '/login', role: 'anonymous', state: 'initial', labels: ['Giriş yap'] });
  fixture.evidence.snapshots.push({ ...roleSnapshot, state: 'after:0', entries: [accountEntry] }, { route: '/login', role: 'anonymous', state: 'initial', truncated: false, entries: [{ kind: 'text', text: 'Giriş yap' }] });
  assert.equal(evaluateUiLanguageEvidence(fixture.catalogue, fixture.evidence).status, 'passed');
  fixture.catalogue.surfaces.push({ route: '/warehouse', role: 'warehouse_staff', state: 'initial', labels: ['Depo'] });
  fixture.evidence.snapshots.push({ route: '/warehouse', role: 'warehouse_staff', state: 'initial', truncated: false, entries: [{ kind: 'text', text: 'Depo' }] });
  assert.equal(evaluateUiLanguageEvidence(fixture.catalogue, fixture.evidence).status, 'blocked');
});

test('reviewed human names do not require diacritics and technical role enum stays untouched', () => {
  for (const name of ['Ali', 'Ece', 'Çağrı Öztürk', 'Jane Doe']) {
    const fixture = displayFixture('Yönetici', name);
    fixture.catalogue.surfaces[0].allowed = [{ text: 'admin', kind: 'text', context: 'technical-id', anchor: technicalDisplayAnchor }];
    fixture.evidence.snapshots[0].entries.push({ text: 'admin', kind: 'text', anchor: technicalDisplayAnchor });
    assert.equal(evaluateUiLanguageEvidence(fixture.catalogue, fixture.evidence).status, 'passed', name);
    assert.equal(fixture.catalogue.surfaces[0].role, 'admin');
    assert.equal(fixture.evidence.snapshots[0].role, 'admin');
    assert.equal(fixture.evidence.snapshots[0].entries[2].text, 'admin');
  }
});

test('unexpected English account and role text at reviewed display anchors fails before token allowances', () => {
  for (const [index, text] of [[0, 'warehouse_staff'], [1, 'Admin Demo']]) {
    const fixture = displayFixture();
    fixture.evidence.snapshots[0].entries[index].text = text;
    fixture.catalogue.surfaces[0].allowed = [{ text, kind: 'text', context: 'proper-name', anchor: index === 0 ? roleDisplayAnchor : accountDisplayAnchor }];
    assert.equal(evaluateUiLanguageEvidence(fixture.catalogue, fixture.evidence).status, 'failed');
  }
});
