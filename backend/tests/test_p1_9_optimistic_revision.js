import assert from 'assert';
import { createTestHarness } from './testHarness.js';

const { runAsyncTest, finish } = createTestHarness();

// =========================================================================
// TEST 1: Concurrent chat append race condition
// =========================================================================
await runAsyncTest('1. appendProjectChatMessage should atomically append messages without race conditions', async () => {
    const { createProject, deleteProject, getProject, appendProjectChatMessage } = await import('../projectRepository.js');

    const project = await createProject({ title: 'Concurrent Chat Test' });

    // 5 concurrent chat appends
    await Promise.all([
        Promise.resolve().then(() => appendProjectChatMessage(project.id, 'user', 'Message 1')),
        Promise.resolve().then(() => appendProjectChatMessage(project.id, 'user', 'Message 2')),
        Promise.resolve().then(() => appendProjectChatMessage(project.id, 'user', 'Message 3')),
        Promise.resolve().then(() => appendProjectChatMessage(project.id, 'user', 'Message 4')),
        Promise.resolve().then(() => appendProjectChatMessage(project.id, 'user', 'Message 5'))
    ]);

    const updated = getProject(project.id);
    // Initial welcome message (1) + 5 concurrent messages = 6
    assert.strictEqual(updated.chatHistory.length, 6, `Chat history must contain exactly 6 messages, got: ${updated.chatHistory.length}`);

    await deleteProject(project.id);
});

// =========================================================================
// TEST 2: Optimistic revision increments on project save
// =========================================================================
await runAsyncTest('2. saveProjectState should increment revision version on every update', async () => {
    const { createProject, deleteProject, getProject, saveProjectState } = await import('../projectRepository.js');

    const project = await createProject({ title: 'Revision Test' });
    const initialRev = project.revision || 1;

    project.status = 'in_progress';
    await saveProjectState(project);

    const afterFirstSave = getProject(project.id);
    assert.strictEqual(afterFirstSave.revision, initialRev + 1);

    afterFirstSave.status = 'completed';
    await saveProjectState(afterFirstSave);

    const afterSecondSave = getProject(project.id);
    assert.strictEqual(afterSecondSave.revision, initialRev + 2);

    await deleteProject(project.id);
});

// =========================================================================
// TEST 3: Concurrent chat during pause/resume checkpoint
// =========================================================================
await runAsyncTest('3. Chat appends during workflow state mutation should not be overwritten', async () => {
    const { createProject, deleteProject, getProject, saveProjectState, appendProjectChatMessage } = await import('../projectRepository.js');

    const project = await createProject({ title: 'Chat vs Checkpoint Project' });

    // Workflow state snapshot taken
    const snapshot = getProject(project.id);

    // Concurrently user adds chat message
    appendProjectChatMessage(project.id, 'user', 'Urgent user intervention');

    // Workflow finishes task and saves snapshot
    snapshot.status = 'running';
    snapshot.plan = { summary: 'Running plan' };
    await saveProjectState(snapshot);

    const finalProject = getProject(project.id);
    assert.strictEqual(finalProject.status, 'running');
    assert.ok(
        finalProject.chatHistory.some(c => c.parts[0].text.includes('Urgent user intervention')),
        'User chat message must not be overwritten by workflow checkpoint'
    );

    await deleteProject(project.id);
});

finish();
