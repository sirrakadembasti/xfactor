/**
 * P8 Task 5 — CI contract test (behavioral, structural).
 *
 * Parses .github/workflows/ci.yml into normalized job/step objects and asserts
 * the fail-closed CI gates. No whole-file string equality: assertions inspect
 * parsed structure (jobs, needs, step run bodies, env blocks).
 *
 * Run: node backend/tests/test_p8_ci_contract.js (from repo root)
 */
import assert from 'assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CI_PATH = path.join(__dirname, '../../.github/workflows/ci.yml');

function parseCi(yamlText) {
    const lines = yamlText.split(/\r?\n/);
    const jobsLine = lines.findIndex((l) => /^jobs:\s*$/.test(l));
    assert.ok(jobsLine >= 0, 'ci.yml must define a top-level `jobs:` mapping');
    const jobs = {};
    let current = null;
    let stepChunk = null;
    const flushStep = () => {
        if (current && stepChunk) {
            current.steps.push(stepChunk);
            stepChunk = null;
        }
    };
    for (let i = jobsLine + 1; i < lines.length; i++) {
        const line = lines[i];
        const jobMatch = line.match(/^  ([A-Za-z0-9_-]+):\s*$/);
        if (jobMatch) {
            flushStep();
            current = { name: jobMatch[1], block: '', needs: null, steps: [] };
            jobs[current.name] = current;
            continue;
        }
        if (!current) continue;
        current.block += line + '\n';
        const needsMatch = line.match(/^\s*needs:\s*(.+?)\s*$/);
        if (needsMatch && current.needs === null) current.needs = needsMatch[1];
        if (/^      - /.test(line)) {
            flushStep();
            stepChunk = { head: line, body: line + '\n' };
        } else if (stepChunk && (/^ {8}/.test(line) || line.trim() === '')) {
            stepChunk.body += line + '\n';
        } else {
            flushStep();
        }
    }
    flushStep();
    // Merge head+body into normalized step records.
    for (const job of Object.values(jobs)) {
        job.steps = job.steps.map((s) => {
            const text = s.body;
            const name = (text.match(/name:\s*(.+)/) || [])[1]?.trim() || '';
            const runMatch = text.match(/run:\s*\|?\s*\n([\s\S]*?)(?=\n\s{6}\S|\n      - |\s*$)/);
            const inlineRun = text.match(/run:\s*(?!\|)(.+)/);
            return {
                name,
                text,
                run: (runMatch ? runMatch[1] : inlineRun ? inlineRun[1] : ''),
            };
        });
    }
    return jobs;
}

const failures = [];
const check = (name, fn) => {
    try {
        fn();
        console.log(`[PASS] ${name}`);
    } catch (err) {
        failures.push(name);
        console.error(`[FAIL] ${name}: ${err.message}`);
    }
};

assert.ok(fs.existsSync(CI_PATH), `CI workflow missing: ${CI_PATH}`);
const jobs = parseCi(fs.readFileSync(CI_PATH, 'utf8'));
const test = jobs.test;
const prod = jobs['production-image'];

check('test job exists', () => assert.ok(test, 'CI must define a `test` job'));
check('production-image job exists', () => assert.ok(prod, 'CI must define a `production-image` job'));
if (!test || !prod) {
    console.error(`\nCI CONTRACT: ${failures.length} failed (missing jobs)`);
    process.exit(1);
}

const testRuns = test.steps.map((s) => s.run).join('\n');
const stepHas = (pred) => test.steps.filter(pred);

check('test job installs backend dependencies with npm ci', () => {
    assert.ok(
        stepHas((s) => /npm ci/.test(s.run) && /backend/.test(s.run)).length > 0,
        'test job needs a backend-scoped `npm ci` step'
    );
});
check('test job installs frontend dependencies with npm ci', () => {
    assert.ok(
        stepHas((s) => /npm ci/.test(s.run) && /frontend/.test(s.run)).length > 0,
        'test job needs a frontend-scoped `npm ci` step'
    );
});
check('test job installs root dependencies with npm ci', () => {
    assert.ok(
        stepHas((s) => /npm ci/.test(s.run) && !/backend|frontend|--prefix/.test(s.run)).length > 0,
        'test job needs a root-scope `npm ci` step (playwright/e2e deps)'
    );
});


check('backend audit is bounded by timeout 60s and blocking', () => {
    const bounded = stepHas(
        (s) => /backend/.test(s.run) && /timeout\s+60s/.test(s.run) && /npm audit/.test(s.run) && /--audit-level=high/.test(s.run)
    );
    assert.ok(bounded.length > 0, 'backend `npm audit --audit-level=high` must run under `timeout 60s`');
    for (const s of bounded) assert.ok(!/continue-on-error/.test(s.text), 'audit step must stay blocking (no continue-on-error)');
});

check('frontend audit is bounded by timeout 60s and blocking', () => {
    const bounded = stepHas(
        (s) => /frontend/.test(s.run) && /timeout\s+60s/.test(s.run) && /npm audit/.test(s.run) && /--audit-level=high/.test(s.run)
    );
    assert.ok(bounded.length > 0, 'frontend `npm audit --audit-level=high` must run under `timeout 60s`');
    for (const s of bounded) assert.ok(!/continue-on-error/.test(s.text), 'audit step must stay blocking (no continue-on-error)');
});

check('test job runs frontend unit tests', () => {
    assert.ok(
        stepHas((s) => /test:unit/.test(s.run) && /frontend/.test(s.run)).length > 0,
        'test job must run frontend `test:unit` (e.g. `npm --prefix frontend run test:unit`)'
    );
});

check('test job builds the frontend', () => {
    assert.ok(
        stepHas((s) => /frontend/.test(s.run) && /run build|vite build/.test(s.run)).length > 0,
        'test job must build the frontend'
    );
});

check('test job installs Chromium and runs root E2E', () => {
    assert.ok(
        stepHas((s) => /playwright install/.test(s.run) && /chromium/.test(s.run)).length > 0,
        'test job must install Chromium (`playwright install ... chromium`)'
    );
    assert.ok(/test:e2e/.test(testRuns), 'test job must run root `test:e2e`');
});

check('test job enforces P8 Docker limit evidence', () => {
    assert.ok(
        /P8_REQUIRE_DOCKER_LIMITS\s*[:=]\s*['"]?1/.test(test.block),
        'test job must set P8_REQUIRE_DOCKER_LIMITS=1 so the P8 sandbox suite cannot silently skip Docker evidence'
    );
});

check('production-image needs test', () => {
    assert.ok(prod.needs && /\btest\b/.test(prod.needs), '`production-image` must declare `needs: test`');
});

check('production-image has no continue-on-error', () => {
    assert.ok(!/continue-on-error/.test(prod.block), '`production-image` must not contain `continue-on-error`');
});

if (failures.length > 0) {
    console.error(`\nCI CONTRACT: ${failures.length} failing assertion(s)`);
    process.exit(1);
}
console.log('\nCI CONTRACT PASS: fail-closed gates present');
