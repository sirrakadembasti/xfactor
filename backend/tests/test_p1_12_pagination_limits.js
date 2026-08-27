import assert from 'assert';
import { createTestHarness } from './testHarness.js';

const { runAsyncTest, finish } = createTestHarness();

// =========================================================================
// TEST 1: Chat history cursor pagination
// =========================================================================
await runAsyncTest('1. getProjectChatHistory should support cursor pagination and limit bounding', async () => {
    const { createProject, deleteProject, appendProjectChatMessage } = await import('../projectRepository.js');
    const { getProjectChatHistory } = await import('../db.js');

    const project = await createProject({ title: 'Chat Pagination Test' });

    // Append 10 messages
    const ids = [];
    for (let i = 1; i <= 10; i++) {
        const msg = appendProjectChatMessage(project.id, 'user', `Message ${i}`);
        ids.push(msg.id);
    }

    // Page 1: Limit 4
    const page1 = getProjectChatHistory(project.id, { limit: 4 });
    assert.strictEqual(page1.length, 4);

    // Page 2: Cursor = last ID of page1, Limit 4
    const cursor = page1[page1.length - 1].id;
    const page2 = getProjectChatHistory(project.id, { cursor, limit: 4 });
    assert.strictEqual(page2.length, 4);
    assert.ok(page2[0].id > cursor);

    // Page 3: Cursor = last ID of page2, Limit 4
    const cursor2 = page2[page2.length - 1].id;
    const page3 = getProjectChatHistory(project.id, { cursor: cursor2, limit: 4 });
    assert.ok(page3.length > 0 && page3.length <= 4);

    await deleteProject(project.id);
});

// =========================================================================
// TEST 2: Project logs cursor pagination
// =========================================================================
await runAsyncTest('2. getProjectLogs should support cursor pagination and limit bounding', async () => {
    const { createProject, deleteProject } = await import('../projectRepository.js');
    const { saveProjectLog, getProjectLogs } = await import('../db.js');

    const project = await createProject({ title: 'Log Pagination Test' });

    // Insert 12 logs
    for (let i = 1; i <= 12; i++) {
        saveProjectLog({
            projectId: project.id,
            agent: 'Coder',
            action: 'test_log',
            file: `file_${i}.js`,
            message: `Log entry ${i}`
        });
    }

    // Page 1: Limit 5
    const page1 = getProjectLogs(project.id, { limit: 5 });
    assert.strictEqual(page1.length, 5);

    // Page 2: Cursor = page1 last ID, Limit 5
    const cursor = page1[page1.length - 1].id;
    const page2 = getProjectLogs(project.id, { cursor, limit: 5 });
    assert.strictEqual(page2.length, 5);
    assert.ok(page2[0].id > cursor);

    await deleteProject(project.id);
});

finish();
