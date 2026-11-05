import { createHash } from 'node:crypto';
// This evaluator proves only an explicitly reviewed catalogue at declared runtime states.
// A Turkish document lang or a few Turkish characters is never language evidence.
const normalize = value => typeof value === 'string' ? value.normalize('NFC').replace(/\s+/g, ' ').trim() : '';
const ascii = value => value.replace(/[ÇçĞğİıÖöŞşÜü]/g, c => ({ Ç:'C', ç:'c', Ğ:'G', ğ:'g', İ:'I', ı:'i', Ö:'O', ö:'o', Ş:'S', ş:'s', Ü:'U', ü:'u' })[c]);
const englishUi = /^(?:login|log in|sign in|sign out|logout|password|username|email address|settings|save|cancel|delete|submit|search|dashboard|home|profile|users|roles|account|accounts|access denied|unauthorized|forbidden|no results(?: found)?|no data(?: available)?|an error occurred|something went wrong|required field|loading(?:\.\.\.)?)$/i;
const key = s => JSON.stringify([s?.route, s?.role, s?.state]);
const displayContexts = new Set(['role-display', 'account-display']);
// This is a narrow rejection list for role-derived interface names, not a
// classifier of people's names. Proper names remain independently reviewed;
// Turkish names such as Ali are valid without any Turkish-specific character.
function englishRoleDisplay(text) {
  const value = normalize(text).toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
  if (/^(?:admin|administrator|warehouse staff|manager|viewer|editor|user)$/.test(value)) return true;
  return /^(?:(?:demo (?:admin|administrator|warehouse staff|warehouse|manager|viewer|editor|user))|(?:(?:admin|administrator|warehouse staff|warehouse|manager|viewer|editor|user) demo))(?: (?:account|user))?(?: [0-9]+)?$/.test(value);
}

// Stable hash of bounded JSON review data. Caller identity/authority is never
// inferred from this digest or from a catalogue's reviewed:true field.
export function hashUiLanguageCatalogue(catalogue) {
  try {
    const visit = (value, depth = 0) => {
      if (depth > 64) throw new Error('depth');
      if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
      if (typeof value === 'number' && Number.isFinite(value)) return value;
      if (Array.isArray(value)) return value.map(item => visit(item, depth + 1));
      if (value && Object.getPrototypeOf(value) === Object.prototype) return Object.fromEntries(Object.keys(value).sort().map(key => [key, visit(value[key], depth + 1)]));
      throw new Error('non-json');
    };
    const serialized = JSON.stringify(visit(catalogue));
    if (Buffer.byteLength(serialized, 'utf8') > 131072) return null;
    return createHash('sha256').update(serialized, 'utf8').digest('hex');
  } catch { return null; }
}

const validAnchor = anchor => typeof anchor === 'string' && anchor.length <= 2048 && /^[a-z][a-z0-9-]*:nth-child\([1-9]\d*\)(?:>[a-z][a-z0-9-]*:nth-child\([1-9]\d*\))*$/.test(anchor);

export function evaluateUiLanguageEvidence(catalogue, evidence) {
  const failures = [], blockers = [];
  if (catalogue?.language !== 'tr' || catalogue?.reviewed !== true || catalogue?.scopeDeclared !== true || !Array.isArray(catalogue?.surfaces) || !catalogue.surfaces.length)
    return { status: 'blocked', failures, blockers: ['A reviewed Turkish catalogue and explicit surface scope are required.'], scope: 'declared-surfaces' };
  if (evidence?.version !== 1 || !Array.isArray(evidence?.snapshots) || !evidence.snapshots.length)
    return { status: 'blocked', failures, blockers: ['Runtime visible UI inventory is missing.'], scope: 'declared-surfaces' };
  if (evidence.truncated !== false) blockers.push('Runtime inventory completeness is unproved.');
  const declarations = new Map(), authenticatedRoles = new Set(), observedDisplays = new Map();
  for (const surface of catalogue.surfaces) {
    if (!surface || typeof surface.route !== 'string' || typeof surface.role !== 'string' || typeof surface.state !== 'string' || !Array.isArray(surface.labels) || !surface.labels.length || declarations.has(key(surface))) {
      blockers.push('Surface catalogue is invalid or duplicated.'); continue;
    }
    declarations.set(key(surface), surface);
    if (surface.role !== 'anonymous') authenticatedRoles.add(surface.role);
    // Only an independently reviewed occurrence anchor may authorize an exception.
    // A technical login identifier never excuses an identically spelled role label.
    if (Array.isArray(surface.allowed) && surface.allowed.some(item => !validAnchor(item?.anchor))) blockers.push('Text-only allowances do not prove the display context.');
    if (surface.allowed !== undefined && (!Array.isArray(surface.allowed) || surface.allowed.some(item => !item || !normalize(item.text) || !['proper-name', 'technical-id'].includes(item.context) || typeof item.kind !== 'string' || !validAnchor(item.anchor))))
      blockers.push('Surface allowances are invalid.');
  }
  const visited = new Set();
  for (const snapshot of evidence.snapshots) {
    const surface = declarations.get(key(snapshot));
    if (!surface) { blockers.push('Observed surface is outside declared scope.'); continue; }
    visited.add(key(snapshot));
    if (snapshot.truncated !== false || snapshot.redacted || snapshot.error || !Array.isArray(snapshot.entries)) blockers.push('Surface inventory is incomplete.');
    const labels = surface.labels.map(label => typeof label === 'string' ? { text: label } : label);
    if (labels.some(label => !normalize(label?.text) || ((label.anchor !== undefined || displayContexts.has(label.context)) && !validAnchor(label.anchor)))) { blockers.push('Surface labels are invalid.'); continue; }
    const entries = Array.isArray(snapshot.entries) ? snapshot.entries : [];
    const matches = (entry, label) => entry && label && normalize(entry.text) === normalize(label.text) && (!label.kind || label.kind === entry.kind) && (!label.anchor || label.anchor === entry.anchor);
    for (const entry of entries) {
      if (!normalize(entry?.text) || !['text', 'aria-label', 'aria-labelledby', 'alt', 'title', 'placeholder', 'label', 'button-value'].includes(entry.kind)) { blockers.push('Invalid runtime text entry.'); continue; }
      const displayLabels = labels.filter(label => displayContexts.has(label.context) && label.anchor === entry.anchor && (!label.kind || label.kind === entry.kind));
      if (displayLabels.length && englishRoleDisplay(entry.text)) {
        failures.push({ route: snapshot.route, role: snapshot.role, state: snapshot.state, reason: 'English role or account display label observed.', text: normalize(entry.text) });
        continue;
      }
      for (const label of displayLabels) if (matches(entry, label)) {
        if (!observedDisplays.has(snapshot.role)) observedDisplays.set(snapshot.role, new Set());
        observedDisplays.get(snapshot.role).add(label.context);
      }
      const allowed = (Array.isArray(surface.allowed) ? surface.allowed : []).some(item => item && ['proper-name', 'technical-id'].includes(item.context) && item.kind === entry.kind && validAnchor(item.anchor) && matches(entry, item));
      if (allowed) continue;
      const text = normalize(entry.text);
      if (englishUi.test(text)) failures.push({ route: snapshot.route, role: snapshot.role, state: snapshot.state, reason: 'English interface label observed.', text });
      else if (labels.some(label => ascii(normalize(label.text)) !== normalize(label.text) && ascii(normalize(label.text)) === text))
        failures.push({ route: snapshot.route, role: snapshot.role, state: snapshot.state, reason: 'Turkish diacritics lost.', text });
      else if (!labels.some(label => matches(entry, label))) blockers.push('Observed text has no reviewed catalogue entry.');
    }
    for (const label of labels) if (label.required !== false && !entries.some(entry => matches(entry, label))) blockers.push('Required interface or display label was not observed.');
  }
  for (const role of authenticatedRoles) {
    if (!observedDisplays.get(role)?.has('role-display')) blockers.push('Authenticated role lacks observed anchored role display.');
    if (!observedDisplays.get(role)?.has('account-display')) blockers.push('Authenticated role lacks observed anchored account display.');
  }
  for (const id of declarations.keys()) if (!visited.has(id)) blockers.push('Declared surface was not visited.');
  return { status: failures.length ? 'failed' : blockers.length ? 'blocked' : 'passed', failures, blockers: [...new Set(blockers)], scope: 'declared-surfaces', visitedSurfaces: visited.size, declaredSurfaces: declarations.size };
}
