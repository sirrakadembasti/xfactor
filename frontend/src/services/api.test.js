import { afterEach, describe, expect, test, vi } from 'vitest';
import { buildActionRequestOptions, createApiClient } from './api';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('API request cancellation and identity handling', () => {
  test('rejects a pre-aborted request without calling fetch', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const controller = new AbortController();
    controller.abort();
    const client = createApiClient('https://api.example.test/api', 100);

    await expect(client.getProject('project-a', { signal: controller.signal }))
      .rejects.toMatchObject({ name: 'AbortError' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('keeps timeout active through body consumption and removes forwarded abort listeners', async () => {
    vi.useFakeTimers();
    let bodyAbortSeen = false;
    const fetchMock = vi.fn((_url, { signal }) => ({
      ok: true,
      status: 200,
      json: () => new Promise((resolve, reject) => {
        signal.addEventListener('abort', () => {
          bodyAbortSeen = true;
          reject(new Error('body timeout'));
        }, { once: true });
        setTimeout(() => reject(new Error('body remained pending')), 100);
      })
    }));
    vi.stubGlobal('fetch', fetchMock);
    const controller = new AbortController();
    const addListener = vi.spyOn(controller.signal, 'addEventListener');
    const removeListener = vi.spyOn(controller.signal, 'removeEventListener');
    const client = createApiClient('https://api.example.test/api', 20);

    const outcome = client.getProject('project-a', {
      signal: controller.signal,
      timeoutMs: 20
    }).then(
      () => ({ kind: 'resolved' }),
      error => ({ kind: 'rejected', error })
    );

    await vi.advanceTimersByTimeAsync(20);
    await vi.advanceTimersByTimeAsync(100);
    const result = await outcome;

    expect(result.kind).toBe('rejected');
    expect(bodyAbortSeen).toBe(true);
    const addedHandler = addListener.mock.calls.find(([type]) => type === 'abort')?.[1];
    expect(addedHandler).toEqual(expect.any(Function));
    expect(removeListener).toHaveBeenCalledWith('abort', addedHandler);
  });

  test('encodes every identity used as a URL path segment', async () => {
    const jsonResponse = () => ({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({})
    });
    const fetchMock = vi.fn().mockImplementation(async () => jsonResponse());
    vi.stubGlobal('fetch', fetchMock);
    const client = createApiClient('https://api.example.test/api/');
    const projectId = 'project/a b';
    const runId = 'run/a b';
    const checkId = 'check/a b';
    const contractId = 'contract/a b';

    await client.getProject(projectId);
    await client.getProjectFiles(projectId);
    await client.getProjectLogs(projectId);
    await client.getVerificationRuns(projectId);
    await client.getVerificationRun(projectId, runId);
    await client.getVerificationCheckLog(projectId, runId, checkId);
    await client.getVerificationSummary(projectId, contractId, runId);
    await client.previewRebuild(projectId, []);
    await client.sendChatMessage(projectId, 'message');
    await client.approveProject(projectId);
    await client.pauseProject(projectId);
    await client.resumeProject(projectId);
    await client.updateProject(projectId, { title: 'renamed' });
    await client.deleteProject(projectId);

    const urls = fetchMock.mock.calls.map(([url]) => url);
    expect(urls).toEqual([
      'https://api.example.test/api/projects/project%2Fa%20b',
      'https://api.example.test/api/projects/project%2Fa%20b/files',
      'https://api.example.test/api/projects/project%2Fa%20b/logs',
      'https://api.example.test/api/projects/project%2Fa%20b/verification-runs',
      'https://api.example.test/api/projects/project%2Fa%20b/verification-runs/run%2Fa%20b',
      'https://api.example.test/api/projects/project%2Fa%20b/verification-runs/run%2Fa%20b/checks/check%2Fa%20b/log',
      'https://api.example.test/api/projects/project%2Fa%20b/verification-summary?contractId=contract%2Fa+b&runId=run%2Fa+b',
      'https://api.example.test/api/projects/project%2Fa%20b/rebuild-preview',
      'https://api.example.test/api/projects/project%2Fa%20b/chat',
      'https://api.example.test/api/projects/project%2Fa%20b/approve',
      'https://api.example.test/api/projects/project%2Fa%20b/pause',
      'https://api.example.test/api/projects/project%2Fa%20b/resume',
      'https://api.example.test/api/projects/project%2Fa%20b',
      'https://api.example.test/api/projects/project%2Fa%20b'
    ]);
  });
  test('adds action IDs to workflow request headers without dropping caller headers', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({})
    });
    vi.stubGlobal('fetch', fetchMock);
    const client = createApiClient('https://api.example.test/api');

    await client.approveProject('project-a', buildActionRequestOptions('approve-action-1', {
      headers: { 'X-Custom': 'preserved' }
    }));
    await client.pauseProject('project-a', buildActionRequestOptions('pause-action-1'));
    await client.resumeProject('project-a', buildActionRequestOptions('resume-action-1'));

    expect(fetchMock.mock.calls.map(([, options]) => options.headers)).toEqual([
      expect.objectContaining({
        'X-XFactor-Action-Id': 'approve-action-1',
        'X-Custom': 'preserved'
      }),
      expect.objectContaining({ 'X-XFactor-Action-Id': 'pause-action-1' }),
      expect.objectContaining({ 'X-XFactor-Action-Id': 'resume-action-1' })
    ]);
  });
});
