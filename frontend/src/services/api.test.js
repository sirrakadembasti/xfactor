import { afterEach, describe, expect, test, vi } from 'vitest';
import { buildActionRequestOptions, createApiClient, formatChatError } from './api';

test('chat failures identify the cause without exposing provider secrets', () => {
  expect(formatChatError({ code: 'LLM_TIMEOUT', message: 'secret-key-value', details: { requestId: 'abc123' } })).toContain('süre');
  expect(formatChatError({ code: 'LLM_TIMEOUT', message: 'secret-key-value' })).not.toContain('secret-key-value');
  expect(formatChatError({ code: 'LLM_RATE_LIMIT' })).toContain('kota');
  expect(formatChatError({ code: 'NETWORK_ERROR' })).toContain('bağlantı');
  expect(formatChatError({ status: 401 })).toContain('Oturum');
});

test.each([
  [400, 'Mesaj geçersiz. Boş olmadığını ve 4000 karakter sınırını aşmadığını kontrol edin.'],
  [413, 'Mesaj isteği boyut sınırını aşıyor. İçeriği kısaltıp yeniden gönderin.']
])('chat HTTP %s gives fixed request guidance without echoing server details', (status, expected) => {
  expect(formatChatError({ status, code: 'UNKNOWN_REQUEST_ERROR', message: 'Timeout secret-provider-key',
    details: { error: 'secret-provider-key', requestId: '<unsafe secret>' } })).toBe(expected);
  expect(formatChatError({ status, details: { requestId: 'safe-request-123' } })).toBe(`${expected} Hata kaydı: safe-request-123.`);
});

test('known LLM codes and existing HTTP auth/rate-limit guidance retain precedence', () => {
  expect(formatChatError({ status: 400, code: 'LLM_AUTH' })).toBe(formatChatError({ code: 'LLM_AUTH' }));
  expect(formatChatError({ status: 413, code: 'LLM_TIMEOUT' })).toBe(formatChatError({ code: 'LLM_TIMEOUT' }));
  expect(formatChatError({ status: 401, message: 'Timeout secret' })).toBe('Oturum süresi doldu. Yeniden giriş yapın.');
  expect(formatChatError({ status: 403, message: 'Timeout secret' })).toBe('Bu proje için mesaj gönderme yetkisi yok.');
  expect(formatChatError({ status: 429, message: 'Timeout secret' })).toBe('İstek sınırına ulaşıldı. Bir süre bekleyin.');
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

test('reviews the bound repair through its encoded project route with action and cancellation options', async () => {
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ attemptId: 'review-1' }) });
  vi.stubGlobal('fetch', fetchMock);
  const client = createApiClient('https://api.example.test/api');
  const controller = new AbortController();
  expect(await client.reviewProjectRepair('project/a b', 'approved-contract', 'repair-plan',
    buildActionRequestOptions('review-action', { signal: controller.signal }))).toEqual({ attemptId: 'review-1' });
  expect(fetchMock.mock.calls[0]).toEqual([
    'https://api.example.test/api/projects/project%2Fa%20b/repair-review',
    expect.objectContaining({ method: 'POST', body: JSON.stringify({ contractId: 'approved-contract', proposalHash: 'repair-plan' }),
      headers: expect.objectContaining({ 'X-XFactor-Action-Id': 'review-action' }), signal: expect.any(AbortSignal) })
  ]);
});

describe('API request cancellation and identity handling', () => {
  test.each(['chat', 'repair'])('waits for a slow Manager %s reply while ordinary requests retain their 15 second timeout', async mode => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn((_url, { signal }) => new Promise((resolve, reject) => {
      signal?.addEventListener('abort', () => reject(signal.reason), { once: true });
      setTimeout(() => resolve({ ok: true, status: 200, json: async () => ({ status: 'planning' }) }), 45000);
    })));
    const client = createApiClient('https://api.example.test/api');
    let chatSettled = false;
    const chat = (mode === 'chat' ? client.sendChatMessage('hotel', 'Otel projesini planla.') : client.prepareProjectRepair('hotel', 'contract')).then(
      value => { chatSettled = true; return { value }; },
      error => { chatSettled = true; return { error }; }
    );
    const ordinary = client.getProject('hotel').catch(error => ({ error }));
    await vi.advanceTimersByTimeAsync(15001);
    expect(chatSettled).toBe(false);
    expect((await ordinary).error.message).toContain('Timeout');
    await vi.advanceTimersByTimeAsync(30000);
    expect(await chat).toEqual({ value: { status: 'planning' } });
  });

  test('a Manager request still respects an explicit caller timeout', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn((_url, { signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    })));
    const client = createApiClient('https://api.example.test/api');
    const result = client.sendChatMessage('hotel', 'Merhaba', { timeoutMs: 100 }).catch(error => error);
    await vi.advanceTimersByTimeAsync(100);
    expect((await result).message).toContain('Timeout');
  });

  test('a Manager request can still be cancelled by its caller', async () => {
    vi.stubGlobal('fetch', vi.fn((_url, { signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    })));
    const client = createApiClient('https://api.example.test/api');
    const controller = new AbortController();
    const result = client.sendChatMessage('hotel', 'Merhaba', { signal: controller.signal }).catch(error => error);
    controller.abort();
    expect((await result).name).toBe('AbortError');
  });

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
    await client.rejectContractDraft(projectId, 4, contractId);
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
      'https://api.example.test/api/projects/project%2Fa%20b/contracts/4/reject',
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

test('helper actions send active project context and action IDs', async () => {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({}),
    blob: async () => new Blob(['zip'])
  });
  vi.stubGlobal('fetch', fetchMock);
  const client = createApiClient('https://api.example.test/api');

  await client.syncProjects({
    activeProjectId: 'project-a',
    ...buildActionRequestOptions('sync-action-1')
  });
  await client.updateProject(
    'project-a',
    { is_pinned: true },
    buildActionRequestOptions('pin-action-1')
  );
  await client.downloadArtifact(
    '/projects/project-a/contracts/contract-a/artifacts/artifact-a/download',
    buildActionRequestOptions('download-action-1')
  );

  expect(fetchMock.mock.calls[0]).toEqual([
    'https://api.example.test/api/projects/sync',
    expect.objectContaining({
      body: JSON.stringify({ activeProjectId: 'project-a' }),
      headers: expect.objectContaining({ 'X-XFactor-Action-Id': 'sync-action-1' })
    })
  ]);
  expect(fetchMock.mock.calls[1][1].headers).toEqual(
    expect.objectContaining({ 'X-XFactor-Action-Id': 'pin-action-1' })
  );
  expect(fetchMock.mock.calls[2][1].headers).toEqual(
    expect.objectContaining({ 'X-XFactor-Action-Id': 'download-action-1' })
  );
  expect(fetchMock.mock.calls[2][1].signal).toBeUndefined();
});
