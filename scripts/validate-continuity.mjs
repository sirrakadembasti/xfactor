import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const ROOT = new URL('../', import.meta.url);
const CONTINUITY_PATH = new URL('PROJECT-CONTINUITY.md', ROOT);
const ROADMAP_PATH = new URL('yol-haitasi-todo.md', ROOT);
const UNIT_IDS = ['P0-A', 'P0-B', 'P0-C', 'P1-A', 'P1-B', 'P1-C', 'P2', 'P3', 'P4'];
const UNIT_PLANS = [
  'implementation-plans/01-P0-A-state-contract-safety.md',
  'implementation-plans/02-P0-B-sandbox-verification.md',
  'implementation-plans/03-P0-C-checkpoint-safety.md',
  'implementation-plans/04-P1-A-contract-traceability.md',
  'implementation-plans/05-P1-B-runtime-verifier.md',
  'implementation-plans/06-P1-C-artifact-validation.md',
  'implementation-plans/07-P2-quality-hardening.md',
  'implementation-plans/08-P3-observability-metrics.md',
  'implementation-plans/09-P4-production-safety.md'
];
const EVIDENCE_FILES = UNIT_IDS.map(id => `implementation-evidence/${id}.md`);
const UNIT_DEPENDENCIES = {
  'P0-A': [],
  'P0-B': ['P0-A'],
  'P0-C': ['P0-A'],
  'P1-A': ['P0-A', 'P0-B'],
  'P1-B': ['P0-B', 'P1-A'],
  'P1-C': ['P0-B', 'P0-C', 'P1-B'],
  P2: ['P1-A', 'P1-B', 'P1-C'],
  P3: ['P2'],
  P4: ['P3']
};
const ROOT_PATH = fileURLToPath(ROOT);

function fail(message) {
  process.stderr.write(`CONTINUITY FAIL: ${message}\n`);
  process.exitCode = 1;
}

function parseFrontmatter(markdown) {
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) throw new Error('PROJECT-CONTINUITY.md frontmatter missing');
  return Object.fromEntries(match[1].split(/\r?\n/).filter(Boolean).map(line => {
    const separator = line.indexOf(':');
    if (separator < 1) throw new Error(`Invalid frontmatter line: ${line}`);
    return [line.slice(0, separator).trim(), line.slice(separator + 1).trim()];
  }));
}

function parseRoadmapMarkers(markdown) {
  return Object.fromEntries([...markdown.matchAll(/<!--\s*continuity:([a-z0-9_]+)=([^>]+?)\s*-->/g)]
    .map(([, key, value]) => [key, value.trim()]));
}

function extractSection(markdown, heading) {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return markdown.match(new RegExp(`## ${escaped}\\r?\\n\\r?\\n([\\s\\S]*?)(?=\\r?\\n## |$)`))?.[1]?.trim() || '';
}

async function requireFile(relativePath) {
  const info = await stat(new URL(relativePath, ROOT));
  if (!info.isFile() || info.size === 0) throw new Error(`${relativePath} missing or empty`);
}

const [continuity, roadmap] = await Promise.all([
  readFile(CONTINUITY_PATH, 'utf8'),
  readFile(ROADMAP_PATH, 'utf8')
]);
const frontmatter = parseFrontmatter(continuity);
const markers = parseRoadmapMarkers(roadmap);

for (const key of ['schema_version', 'initiative', 'improvement_plan_sha256', 'master_plan', 'current_unit', 'status']) {
  if (!frontmatter[key]) fail(`continuity key missing: ${key}`);
  if (!markers[key]) fail(`roadmap marker missing: ${key}`);
  if (frontmatter[key] !== markers[key]) fail(`${key} mismatch: continuity=${frontmatter[key]} roadmap=${markers[key]}`);
}

const improvementPlan = await readFile(new URL(frontmatter.improvement_plan, ROOT));
const actualHash = createHash('sha256').update(improvementPlan).digest('hex');
if (actualHash !== frontmatter.improvement_plan_sha256) {
  fail(`improvement plan hash mismatch: expected ${frontmatter.improvement_plan_sha256}, got ${actualHash}`);
}

await requireFile(frontmatter.master_plan);
await Promise.all([...UNIT_PLANS, ...EVIDENCE_FILES].map(requireFile));

const master = await readFile(new URL(frontmatter.master_plan, ROOT), 'utf8');
const planByUnit = Object.fromEntries(UNIT_IDS.map((id, index) => [id, UNIT_PLANS[index]]));
const evidenceByUnit = Object.fromEntries(UNIT_IDS.map((id, index) => [id, EVIDENCE_FILES[index]]));

for (const unitId of UNIT_IDS) {
  const roadmapMatches = roadmap.match(new RegExp(`\\*\\*${unitId}(?:\\s|—)`, 'g')) || [];
  if (roadmapMatches.length !== 1) fail(`roadmap must contain unit ${unitId} exactly once`);
  const planFileName = planByUnit[unitId].split('/').at(-1);
  if (!master.includes(planFileName)) fail(`master plan missing ${planFileName}`);
  if (!master.includes(`implementation-evidence/${unitId}.md`)) fail(`master plan missing evidence for ${unitId}`);

  const plan = await readFile(new URL(planByUnit[unitId], ROOT), 'utf8');
  const requiredPlanPatterns = [
    [/^# /m, 'title'],
    [/REQUIRED SUB-SKILL/, 'required sub-skill'],
    [/(?:\*\*Goal:\*\*|^## Goal$)/m, 'goal'],
    [/(?:\*\*Architecture:\*\*|^## Architecture$)/m, 'architecture'],
    [/(?:\*\*Tech Stack:\*\*|^## Tech Stack$)/m, 'tech stack'],
    [/^## Global Constraints$/m, 'global constraints'],
    [/^### (?:\[[ xX~!]\] )?Task(?:\s|\.)/m, 'task headings'],
    [/- \[[ xX~!]\]|^### \[[ xX~!]\] Task/m, 'trackable checklist'],
    [/^## .*Exit Gate.*$/m, 'unit exit gate'],
    [/commit/i, 'commit boundary']
  ];
  for (const [pattern, label] of requiredPlanPatterns) {
    if (!pattern.test(plan)) fail(`${planByUnit[unitId]} missing ${label}`);
  }
  if (!plan.includes(evidenceByUnit[unitId])) fail(`${planByUnit[unitId]} missing unit evidence path`);
  if (!plan.includes('validate-continuity.mjs')) fail(`${planByUnit[unitId]} missing continuity validation command`);
  if (/\b(?:TBD|fill in details)\b/i.test(plan)) {
    fail(`${planByUnit[unitId]} contains placeholder language`);
  }

  const taskSections = plan.split(/(?=^### (?:\[[ xX~!]\] )?Task(?:\s|\.))/m).slice(1);
  for (const [taskIndex, taskSection] of taskSections.entries()) {
    const taskLabel = `${unitId} task ${taskIndex + 1}`;
    if (!/- \[[ xX~!]\]|^### \[[ xX~!]\] Task/m.test(taskSection)) fail(`${taskLabel} lacks trackable TDD steps`);
    if (!/(?:\bRED\b|verify it fails|Expected:\s*FAIL)/i.test(taskSection)) fail(`${taskLabel} missing RED state`);
    if (!/(?:\bGREEN\b|verify it passes|Expected:\s*PASS)/i.test(taskSection)) fail(`${taskLabel} missing GREEN state`);
    if (!/(?:\bRun\s+`|\b(?:Run|(?:RED|GREEN)\s+Exact\s+Command|Command)(?:\s*\([^)]*\))?\s*:)/i.test(taskSection)) fail(`${taskLabel} missing executable command`);
    if (!/Expected(?:\s+(?:failure|PASS|result|RED output|GREEN output))?(?:\s*\([^)]*\))?\s*:/i.test(taskSection)) fail(`${taskLabel} missing expected result`);
    if (!/(?:Interfaces?|Paths?\/Interfaces|Test (?:File|Path))/i.test(taskSection)) fail(`${taskLabel} missing interface or exact test path`);
    if (!/commit/i.test(taskSection)) fail(`${taskLabel} missing commit boundary`);
    if (!taskSection.includes(evidenceByUnit[unitId])) fail(`${taskLabel} missing evidence update`);
  }

  const evidence = await readFile(new URL(evidenceByUnit[unitId], ROOT), 'utf8');
  const evidenceMeta = parseFrontmatter(evidence);
  if (evidenceMeta.unit !== unitId) fail(`${evidenceByUnit[unitId]} unit mismatch`);
  if (evidenceMeta.plan !== planByUnit[unitId]) fail(`${evidenceByUnit[unitId]} plan mismatch`);

  const completed = new RegExp(`- \\[x\\] \\*\\*${unitId}(?:\\s|—)`).test(roadmap);
  const verified = evidenceMeta.status === 'verified';

  const masterCells = master.split(/\r?\n/)
    .map(line => line.split('|').map(cell => cell.trim()).filter(Boolean))
    .find(cells => cells.length === 6 && /^\d+$/.test(cells[0]) && cells[1] === unitId);
  if (!masterCells) {
    fail(`master status row missing for ${unitId}`);
  } else {
    const cells = masterCells;
    const masterDependencies = cells[4] === '—'
      ? []
      : cells[4].split(',').map(value => value.trim()).filter(Boolean);
    if (masterDependencies.join(',') !== UNIT_DEPENDENCIES[unitId].join(',')) {
      fail(`${unitId} master dependency mismatch: expected ${UNIT_DEPENDENCIES[unitId].join(',') || '—'}, got ${masterDependencies.join(',') || '—'}`);
    }
    const masterStatus = cells.at(-1);
    if ((masterStatus === 'verified') !== verified) fail(`${unitId} master/evidence verification mismatch`);
  }

  if (unitId === frontmatter.current_unit) {
    for (const dependency of UNIT_DEPENDENCIES[unitId]) {
      const dependencyEvidence = parseFrontmatter(
        await readFile(new URL(evidenceByUnit[dependency], ROOT), 'utf8')
      );
      if (dependencyEvidence.status !== 'verified') fail(`${unitId} dependency ${dependency} is not verified`);
    }
  }
  if (completed !== verified) fail(`${unitId} roadmap/evidence verification mismatch`);
}

if (!UNIT_IDS.includes(frontmatter.current_unit)) fail(`unknown current_unit: ${frontmatter.current_unit}`);
if (frontmatter.current_plan !== planByUnit[frontmatter.current_unit]) {
  fail(`current_plan does not match current_unit ${frontmatter.current_unit}`);
}
if (frontmatter.evidence_file !== evidenceByUnit[frontmatter.current_unit]) {
  fail(`evidence_file does not match current_unit ${frontmatter.current_unit}`);
}

const continuityLines = continuity.split(/\r?\n/).length;

for (const key of ['current_task', 'next_action', 'baseline_commit', 'last_verified_commit', 'head_commit']) {
  if (!frontmatter[key]) fail(`continuity key missing: ${key}`);
}
const nextActionSection = extractSection(continuity, 'Exact Next Action');
if (!nextActionSection.includes(frontmatter.next_action)) {
  fail('body Exact Next Action does not match frontmatter next_action');
}
const inProgressSection = extractSection(continuity, 'In Progress');
if (!inProgressSection.includes(frontmatter.current_task)) {
  fail('body In Progress does not match frontmatter current_task');
}

const gitHead = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT_PATH, encoding: 'utf8' }).trim();
if (frontmatter.head_commit !== 'SELF' && frontmatter.head_commit !== gitHead) {
  fail(`head_commit mismatch: continuity=${frontmatter.head_commit} git=${gitHead}`);
}
for (const key of ['baseline_commit', 'last_verified_commit']) {
  try {
    execFileSync('git', ['cat-file', '-e', `${frontmatter[key]}^{commit}`], {
      cwd: ROOT_PATH,
      stdio: 'ignore'
    });
  } catch {
    fail(`${key} is not a valid commit: ${frontmatter[key]}`);
  }
}

const dirtyStatus = execFileSync('git', ['status', '--porcelain'], {
  cwd: ROOT_PATH,
  encoding: 'utf8'
}).trim();
const dirtySection = continuity.match(/## Dirty Worktree\r?\n\r?\n([\s\S]*?)(?=\r?\n## |$)/)?.[1]?.trim() || '';
const cleanLedger = /^Clean\.?(?:\r?\n|$)/i.test(dirtySection);
if (dirtyStatus && (!dirtySection || cleanLedger)) {
  fail('dirty worktree is not recorded in PROJECT-CONTINUITY.md');
}
if (!dirtyStatus && !cleanLedger) {
  fail('clean worktree is not recorded as Clean in PROJECT-CONTINUITY.md');
}
if (continuityLines > 200) fail(`PROJECT-CONTINUITY.md exceeds 200 lines: ${continuityLines}`);

if (!process.exitCode) {
  process.stdout.write(`CONTINUITY PASS: ${UNIT_IDS.length} units, plan hash ${actualHash.slice(0, 12)}, current ${frontmatter.current_unit}/${frontmatter.status}\n`);
}
