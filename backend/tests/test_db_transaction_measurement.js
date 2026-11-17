import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTestHarness } from './testHarness.js';
import { measureTransaction } from '../db.js';
import { noteLargeWorkflowState, createProject, getProject, saveProjectState, deleteProject } from '../projectRepository.js';

const { runAsyncTest, finish } = createTestHarness();
const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const clock = (...values) => () => values.shift();

await runAsyncTest('a transaction slower than one second logs db.transaction_slow with label, duration and caller', () => {
    const lines = [];
    const result = measureTransaction('unit.slow', () => 'value', { now: clock(0, 1100), sink: line => lines.push(JSON.parse(line)) });
    assert.equal(result, 'value');
    assert.equal(lines.length, 1);
    assert.equal(lines[0].event, 'db.transaction_slow');
    assert.equal(lines[0].label, 'unit.slow');
    assert.equal(lines[0].ms, 1100);
    assert.ok(Array.isArray(lines[0].caller) && lines[0].caller.length > 0 && lines[0].caller.length <= 5);
    assert.ok(lines[0].caller.every(frame => typeof frame === 'string' && frame.startsWith('at ')));
});

await runAsyncTest('a fast transaction logs nothing and the one-second threshold itself is not slow', () => {
    const lines = [];
    measureTransaction('unit.fast', () => 1, { now: clock(0, 500), sink: line => lines.push(line) });
    measureTransaction('unit.edge', () => 1, { now: clock(0, 1000), sink: line => lines.push(line) });
    assert.deepEqual(lines, []);
});

await runAsyncTest('a failing transaction is still measured and the error is rethrown', () => {
    const lines = [];
    assert.throws(() => measureTransaction('unit.failing', () => { throw new Error('rolled back'); },
        { now: clock(0, 2500), sink: line => lines.push(JSON.parse(line)) }), /rolled back/);
    assert.equal(lines.length, 1);
    assert.equal(lines[0].label, 'unit.failing');
    assert.equal(lines[0].ms, 2500);
});

await runAsyncTest('measureTransaction wraps the five transaction sites without opening a transaction itself', () => {
    const sites = [
        ['projectRepository.js', "'saveProjectState'"],
        ['workflowAttempts.js', "'commitWorkflowSource'"],
        ['verification/verificationContext.js', "'commitVerificationContext'"],
        ['db.js', "'saveProjectLog'"],
        ['repositories/artifactRepository.js', "'artifactTransaction'"]
    ];
    for (const [file, label] of sites) {
        const source = fs.readFileSync(path.join(backendRoot, file), 'utf8');
        assert.ok(source.includes(`measureTransaction(${label}`), `${file} must measure ${label}`);
    }
    const dbSource = fs.readFileSync(path.join(backendRoot, 'db.js'), 'utf8');
    const helper = dbSource.slice(dbSource.indexOf('export function measureTransaction'), dbSource.indexOf('export function measureTransaction') + 900);
    assert.ok(!/BEGIN|COMMIT/.test(helper.split('\n}\n')[0]), 'the timer must not open a transaction');
});

const bigState = (size, extra = {}) => ({ filler: 'x'.repeat(size), second: 'y'.repeat(2048), third: 'z'.repeat(64), tiny: 1, ...extra });

await runAsyncTest('a workflow state above 256 KB is reported once per project with its three largest keys', () => {
    const lines = [];
    const sink = line => lines.push(JSON.parse(line));
    const id = `state-large-${Date.now()}`;
    noteLargeWorkflowState(id, JSON.stringify(bigState(300 * 1024)), { sink });
    noteLargeWorkflowState(id, JSON.stringify(bigState(310 * 1024)), { sink });
    assert.equal(lines.length, 1);
    assert.equal(lines[0].event, 'workflow.state_large');
    assert.equal(lines[0].projectId, id);
    assert.ok(lines[0].bytes > 300 * 1024);
    assert.deepEqual(lines[0].topKeys.map(item => item.key), ['filler', 'second', 'third']);
    assert.ok(lines[0].topKeys[0].bytes > 300 * 1024);
    noteLargeWorkflowState(`${id}-small`, JSON.stringify(bigState(1024)), { sink });
    noteLargeWorkflowState(`${id}-null`, null, { sink });
    assert.equal(lines.length, 1);
    noteLargeWorkflowState(`${id}-other`, JSON.stringify(bigState(300 * 1024)), { sink });
    assert.equal(lines.length, 2);
});

await runAsyncTest('saveProjectState reports an oversized workflow state through the structured log', async () => {
    const project = await createProject({ title: 'Large workflow state fixture' });
    const captured = [];
    const originalWarn = console.warn;
    console.warn = line => { try { captured.push(JSON.parse(line)); } catch { originalWarn(line); } };
    try {
        const state = getProject(project.id);
        state.workflow = { ...(state.workflow || {}), bulk: 'x'.repeat(300 * 1024) };
        await saveProjectState(state);
    } finally {
        console.warn = originalWarn;
        await deleteProject(project.id);
    }
    const reports = captured.filter(entry => entry.event === 'workflow.state_large' && entry.projectId === project.id);
    assert.equal(reports.length, 1);
    assert.equal(reports[0].topKeys[0].key, 'bulk');
});

finish();
