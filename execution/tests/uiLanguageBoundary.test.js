import test from 'node:test';
import assert from 'node:assert/strict';
import { collectVisibleUiText } from '../browserRunner.cjs';
import { evaluateUiLanguageEvidence } from '../../backend/contracts/uiLanguageEvidence.js';

// Pure DOM-boundary fixtures: no Playwright, network, worker or native process.
// Keep these regressions RED until the production evidence boundary is repaired.
function element(tagName, text = '', { editableAncestor = null, attributes = {} } = {}) {
  return {
    tagName,
    childNodes: text ? [{ nodeType: 3, textContent: text }] : [],
    shadowRoot: null,
    getAttribute: name => attributes[name] ?? null,
    getClientRects: () => [{}],
    closest: selector => selector.includes('contenteditable') ? editableAncestor : null
  };
}

function collect(elements) {
  const originals = new Map(['document', 'getComputedStyle'].map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  Object.defineProperty(globalThis, 'document', { configurable: true, value: {
    querySelectorAll: () => elements,
    getElementById: () => null
  } });
  Object.defineProperty(globalThis, 'getComputedStyle', { configurable: true, value: () => ({
    visibility: 'visible', display: 'block', content: 'none'
  }) });
  try {
    return collectVisibleUiText({ maxEntries: 100, maxTextLength: 500, maxElements: 1000, secrets: [] });
  } finally {
    for (const [name, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  }
}

const requiredLabels = () => [element('LABEL', 'Şifre'), element('H1', 'Yönetici')];

function evaluate(inventory, allowed = []) {
  return evaluateUiLanguageEvidence({
    language: 'tr', reviewed: true, scopeDeclared: true,
    surfaces: [{ route: '/accounts', role: 'admin', state: 'initial', labels: ['Şifre', 'Yönetici'], allowed }]
  }, {
    version: 1, truncated: inventory.truncated,
    snapshots: [{ route: '/accounts', role: 'admin', state: 'initial', ...inventory }]
  });
}

test('a technical token allowance cannot also excuse a visible account role with identical text', () => {
  const technicalToken = element('CODE', 'admin');
  const visibleAccountRole = element('TD', 'admin');
  const inventory = collect([...requiredLabels(), technicalToken, visibleAccountRole]);
  const result = evaluate(inventory, [{ text: 'admin', kind: 'text', context: 'technical-id' }]);

  // Current collector collapses the two occurrences; the evaluator then applies
  // a text+kind allowance to both. A trusted occurrence/context binding is absent.
  assert.notEqual(result.status, 'passed',
    'Unbound technical-id allowance must block proof; it currently also excuses the visible account role admin.');
});

test('visible controls inside an editable region cannot disappear from complete language evidence', () => {
  const editable = element('DIV', '', { attributes: { contenteditable: 'true' } });
  editable.closest = () => editable;
  const saveButton = element('BUTTON', 'Save', { editableAncestor: editable });
  const inventory = collect([...requiredLabels(), editable, saveButton]);
  const result = evaluate(inventory);

  // Excluding private editable values is required, but silently excluding its
  // interface controls must not yield a complete, passing language inventory.
  assert.notEqual(result.status, 'passed',
    'Visible Save was skipped with truncated=false; unsupported editable surfaces must block or expose their UI controls.');
});

test('a closed shadow root on a standard DIV cannot produce complete passing language evidence', () => {
  const host = element('DIV');
  // Model browser closed-shadow semantics: a normal DIV may host a rendered
  // closed root; host.shadowRoot is null and document.querySelectorAll cannot
  // enumerate its descendants. The retained root is fixture-only, not a DOM API.
  const closedRoot = { mode: 'closed', childNodes: [element('BUTTON', 'Settings')] };
  assert.equal(closedRoot.childNodes[0].childNodes[0].textContent, 'Settings');
  assert.equal(host.shadowRoot, null);
  const inventory = collect([...requiredLabels(), host]);
  const result = evaluate(inventory);

  // This pure fixture proves the collector's information gap, not browser-engine
  // rendering. Repair requires trusted pre-navigation shadow tracking or a
  // browser-level collector; checking only custom tag names cannot close it.
  assert.notEqual(result.status, 'passed',
    'Closed shadow UI is unobservable with the current collector, yet truncated=false permits a false PASS.');
});
