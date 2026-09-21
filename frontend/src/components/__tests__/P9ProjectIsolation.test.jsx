import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import App from '../../App';
import { api } from '../../services/api';

const projectA = {
  id: 'project-a',
  title: 'Alpha',
  status: 'completed',
  chatHistory: []
};

const projectB = {
  id: 'project-b',
  title: 'Beta',
  status: 'completed',
  chatHistory: [{ role: 'model', parts: [{ text: 'B current state' }] }]
};

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
};

const asPromise = value => {
  const promiseLike = value?.promise && typeof value.promise.then === 'function'
    ? value.promise
    : value;
  return Promise.resolve(promiseLike);
};


const projectList = [
  { id: projectA.id, title: projectA.title, status: projectA.status },
  { id: projectB.id, title: projectB.title, status: projectB.status }
];

function installWebSocket() {
  const sockets = [];

  class TestWebSocket {
    static OPEN = 1;
    static CONNECTING = 0;
    static CLOSED = 3;

    constructor(url) {
      this.url = url;
      this.readyState = TestWebSocket.OPEN;
      this.onopen = null;
      this.onmessage = null;
      this.onclose = null;
      sockets.push(this);
      queueMicrotask(() => this.onopen?.());
    }

    send() {}

    close() {
      if (this.readyState === TestWebSocket.CLOSED) return;
      this.readyState = TestWebSocket.CLOSED;
      this.onclose?.();
    }
  }

  vi.stubGlobal('WebSocket', TestWebSocket);
  return sockets;
}

function setupApi({ stateFor, logsFor } = {}) {
  const spies = {
    getSession: vi.spyOn(api, 'getSession').mockResolvedValue({ user: { username: 'admin' } }),
    getProjects: vi.spyOn(api, 'getProjects').mockResolvedValue(projectList),
    getProject: vi.spyOn(api, 'getProject').mockImplementation(id => asPromise(
      stateFor ? stateFor(id) : id === projectA.id ? projectA : projectB
    )),
    getProjectFiles: vi.spyOn(api, 'getProjectFiles').mockResolvedValue([]),
    getProjectLogs: vi.spyOn(api, 'getProjectLogs').mockImplementation(id => asPromise(
      logsFor ? logsFor(id) : []
    )),
    sendChatMessage: vi.spyOn(api, 'sendChatMessage').mockResolvedValue(projectB),
    approveProject: vi.spyOn(api, 'approveProject').mockResolvedValue(projectB),
    pauseProject: vi.spyOn(api, 'pauseProject').mockResolvedValue(projectB),
    resumeProject: vi.spyOn(api, 'resumeProject').mockResolvedValue(projectB),
    createProject: vi.spyOn(api, 'createProject').mockResolvedValue({
      id: 'project-c',
      title: 'Gamma',
      status: 'planning'
    }),
    updateProject: vi.spyOn(api, 'updateProject').mockResolvedValue({}),
    syncProjects: vi.spyOn(api, 'syncProjects').mockResolvedValue({}),
    downloadArtifact: vi.spyOn(api, 'downloadArtifact').mockResolvedValue(new Blob(['zip'])),
    logout: vi.spyOn(api, 'logout').mockResolvedValue({})
  };
  return spies;
}

async function waitForHeading(title) {
  return screen.findByRole('heading', { name: title });
}

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  installWebSocket();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});


  test('helper sync and pin actions refresh active project state with fenced action requests', async () => {
    const spies = setupApi();
    render(<App />);
    await waitForHeading(projectA.title);

    fireEvent.click(screen.getByTitle('Diskle Senkronize Et (Projeleri Tara)'));
    await waitFor(() => expect(spies.syncProjects).toHaveBeenCalledWith(expect.objectContaining({
      activeProjectId: projectA.id,
      headers: expect.objectContaining({ 'X-XFactor-Action-Id': expect.any(String) })
    })));
    await waitFor(() => expect(spies.getProject.mock.calls.length).toBeGreaterThan(1));

    const projectStateCallsBeforePin = spies.getProject.mock.calls.filter(([id]) => id === projectA.id).length;
    fireEvent.click(screen.getAllByTitle('Proje İşlemleri')[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Başa Sabitle' }));
    await waitFor(() => expect(spies.updateProject).toHaveBeenCalledWith(
      projectA.id,
      { is_pinned: true },
      expect.objectContaining({ headers: expect.objectContaining({
        'X-XFactor-Action-Id': expect.any(String)
      }) })
    ));
    await waitFor(() => expect(spies.getProject.mock.calls.filter(([id]) => id === projectA.id).length)
      .toBeGreaterThan(projectStateCallsBeforePin));
  });

  test('helper download sends action header and refreshes active project after initiation', async () => {
    const spies = setupApi({
      stateFor: id => id === projectA.id
        ? {
          ...projectA,
          contractId: 'contract-a',
          latestArtifact: { id: 'artifact-a', status: 'verified' }
        }
        : projectB
    });
    const originalCreateObjectURL = URL.createObjectURL;
    const originalRevokeObjectURL = URL.revokeObjectURL;
    URL.createObjectURL = vi.fn().mockReturnValue('blob:project-a');
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    render(<App />);
    await waitForHeading(projectA.title);
    fireEvent.click(await screen.findByRole('button', { name: /zip/i }));
    await waitFor(() => expect(spies.downloadArtifact).toHaveBeenCalledWith(
      expect.stringContaining('/projects/project-a/contracts/contract-a/artifacts/artifact-a/download'),
      expect.objectContaining({ headers: expect.objectContaining({
        'X-XFactor-Action-Id': expect.any(String)
      }) })
    ));
    await waitFor(() => expect(spies.getProject.mock.calls.filter(([id]) => id === projectA.id).length).toBeGreaterThan(1));
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
  });
describe('P9 project/auth request isolation', () => {

  test('completed project does not fetch source files for a browser editor', async () => {
    const spies = setupApi();
    render(<App />);
    await waitForHeading(projectA.title);
    await waitFor(() => expect(spies.getProject).toHaveBeenCalledWith(projectA.id, expect.any(Object)));
    expect(spies.getProjectFiles).not.toHaveBeenCalled();
  });

  test('does not apply a pending sync refresh after switching projects', async () => {
    const pendingSync = deferred();
    const spies = setupApi();
    spies.syncProjects.mockResolvedValueOnce({}).mockReturnValueOnce(pendingSync.promise);
    render(<App />);
    await waitForHeading(projectA.title);
    fireEvent.click(screen.getByTitle('Diskle Senkronize Et (Projeleri Tara)'));
    fireEvent.click(screen.getByText(projectB.title, { selector: 'span' }));
    await waitForHeading(projectB.title);
    const projectListCallsBeforeResolve = spies.getProjects.mock.calls.length;
    const projectStateCallsBeforeResolve = spies.getProject.mock.calls.length;
    pendingSync.resolve({});
    await waitFor(() => expect(screen.getByRole('heading', { name: projectB.title })).toBeInTheDocument());
    expect(spies.getProjects.mock.calls.length).toBe(projectListCallsBeforeResolve);
    expect(spies.getProject.mock.calls.length).toBe(projectStateCallsBeforeResolve);
  });
  test('does not apply a deferred A project response after switching to B', async () => {
    const delayedA = deferred();
    setupApi({
      stateFor: id => id === projectA.id ? delayedA.promise : projectB
    });

    render(<App />);
    fireEvent.click(await screen.findByText(projectB.title, { selector: 'span' }));
    await waitForHeading(projectB.title);

    delayedA.resolve({ ...projectA, title: 'A stale response' });
    await waitForHeading(projectB.title);

    expect(screen.queryByRole('heading', { name: 'A stale response' })).not.toBeInTheDocument();
    expect(screen.getByText('B current state')).toBeInTheDocument();
  });

  test('fences deferred chat and action responses and clears stale thinking on switch', async () => {
    const delayedChat = deferred();
    const delayedPause = deferred();
    const runningA = { ...projectA, status: 'running' };
    const spies = setupApi({
      stateFor: id => id === projectA.id ? runningA : projectB
    });
    spies.sendChatMessage.mockReturnValue(delayedChat.promise);
    spies.pauseProject.mockReturnValue(delayedPause.promise);
    render(<App />);

    await waitForHeading(projectA.title);

    fireEvent.click(screen.getByRole('button', { name: /Süreci Duraklat/ }));
    const chatInput = screen.getByPlaceholderText(/Manager ile mimariyi/);
    fireEvent.change(chatInput, { target: { value: 'A question' } });
    fireEvent.click(screen.getByTitle('Gönder'));
    expect(screen.getByText(/Manager düşünüyor/)).toBeInTheDocument();

    fireEvent.click(screen.getByText(projectB.title, { selector: 'span' }));
    await waitForHeading(projectB.title);

    expect(screen.queryByText(/Manager düşünüyor/)).not.toBeInTheDocument();
    expect(screen.getByText('B current state')).toBeInTheDocument();

    delayedPause.resolve({ ...runningA, status: 'paused', title: 'A stale pause' });
    delayedChat.resolve({ ...runningA, title: 'A stale chat', chatHistory: [{ role: 'model', parts: [{ text: 'A stale chat' }] }] });
    await waitForHeading(projectB.title);

    expect(screen.queryByRole('heading', { name: 'A stale pause' })).not.toBeInTheDocument();
    expect(screen.queryByText('A stale chat')).not.toBeInTheDocument();
  });

  test('replaces local workflow chat with canonical action messages across project switches', async () => {
    let projectAState = {
      ...projectA,
      status: 'running',
      chatHistory: [{ role: 'model', parts: [{ text: 'A canonical before action' }] }]
    };
    const canonicalActionState = {
      ...projectAState,
      status: 'paused',
      chatHistory: [
        ...projectAState.chatHistory,
        { role: 'user', parts: [{ text: '⏸️ Üretim sürecini duraklat.' }] },
        { role: 'model', parts: [{ text: 'Süreç duraklatıldı. Revizyon talebinizi iletebilirsiniz.' }] }
      ]
    };
    const spies = setupApi({
      stateFor: id => id === projectA.id ? projectAState : projectB
    });
    spies.pauseProject.mockImplementation((_id, options) => {
      expect(options.headers['X-XFactor-Action-Id']).toMatch(/^pause-/);
      projectAState = canonicalActionState;
      return Promise.resolve(canonicalActionState);
    });

    render(<App />);
    await waitForHeading(projectA.title);
    fireEvent.click(screen.getByRole('button', { name: /Süreci Duraklat/ }));
    await screen.findByText('Süreç duraklatıldı. Revizyon talebinizi iletebilirsiniz.');

    fireEvent.click(screen.getByText(projectB.title, { selector: 'span' }));
    await waitForHeading(projectB.title);
    expect(screen.getByText('B current state')).toBeInTheDocument();
    expect(screen.queryByText('Süreç duraklatıldı. Revizyon talebinizi iletebilirsiniz.')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText(projectA.title, { selector: 'span' }));
    await waitForHeading(projectA.title);
    expect(screen.getByText('Süreç duraklatıldı. Revizyon talebinizi iletebilirsiniz.')).toBeInTheDocument();
  });

  test('does not let deferred A logs replace B logs', async () => {
    const delayedALogs = deferred();
    const betaLog = { projectId: projectB.id, action: 'write', message: 'B log' };
    const spies = setupApi({
      logsFor: id => id === projectA.id ? delayedALogs.promise : [betaLog]
    });

    render(<App />);
    await waitForHeading(projectA.title);
    await waitFor(() => expect(spies.getProjectLogs).toHaveBeenCalledWith(projectA.id, expect.any(Object)));

    fireEvent.click(screen.getByText(projectB.title, { selector: 'span' }));
    await waitForHeading(projectB.title);

    fireEvent.click(screen.getByRole('button', { name: /Canlı Süreç Logları/ }));
    await screen.findByText(betaLog.message);
    delayedALogs.resolve([{ projectId: projectA.id, action: 'write', message: 'A stale log' }]);
    await waitFor(() => expect(screen.queryByText('A stale log')).not.toBeInTheDocument());
    expect(screen.getByText(betaLog.message)).toBeInTheDocument();
  });

  test('does not restore project state from a response that resolves after logout', async () => {
    const delayedA = deferred();
    setupApi({ stateFor: () => delayedA.promise });

    render(<App />);
    await screen.findByText(projectB.title, { selector: 'span' });
    fireEvent.click(screen.getByRole('button', { name: /Oturumu Kapat|Çıkış/i }));
    await screen.findByRole('button', { name: 'Giriş Yap' });

    delayedA.resolve({ ...projectA, title: 'A restored after logout' });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Giriş Yap' })).toBeInTheDocument());
    expect(screen.queryByText('A restored after logout')).not.toBeInTheDocument();
  });

  test('blocks a new login while a delayed logout is still settling', async () => {
    const delayedLogout = deferred();
    const spies = setupApi();
    spies.logout.mockReturnValue(delayedLogout.promise);
    const login = vi.spyOn(api, 'login').mockResolvedValue({ user: { username: 'admin' } });

    render(<App />);
    await waitForHeading(projectA.title);
    fireEvent.click(screen.getByRole('button', { name: /Oturumu Kapat|Çıkış/i }));
    await screen.findByRole('button', { name: 'Giriş Yap' });

    fireEvent.change(screen.getByLabelText('Kullanıcı Adı'), { target: { value: 'admin' } });
    fireEvent.change(screen.getByLabelText('Şifre'), { target: { value: 'password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Giriş Yap' }));
    expect(login).not.toHaveBeenCalled();

    delayedLogout.resolve({});
    await waitFor(() => expect(screen.getByRole('button', { name: 'Giriş Yap' })).not.toBeDisabled());
    fireEvent.click(screen.getByRole('button', { name: 'Giriş Yap' }));
    await waitFor(() => expect(login).toHaveBeenCalledTimes(1));
  });

  test('releases the login gate and remains anonymous when logout rejects', async () => {
    const rejectedLogout = deferred();
    const spies = setupApi();
    spies.logout.mockReturnValue(rejectedLogout.promise);
    const login = vi.spyOn(api, 'login').mockResolvedValue({ user: { username: 'admin' } });
    const unhandledRejection = vi.fn(event => event.preventDefault());
    window.addEventListener('unhandledrejection', unhandledRejection);

    try {
      render(<App />);
      await waitForHeading(projectA.title);
      fireEvent.click(screen.getByRole('button', { name: /Oturumu Kapat|Çıkış/i }));
      const loginButton = await screen.findByRole('button', { name: 'Giriş Yap' });
      expect(loginButton).toBeDisabled();

      rejectedLogout.reject(new Error('logout unavailable'));
      await waitFor(() => expect(loginButton).not.toBeDisabled());
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(screen.getByRole('heading', { name: 'XFactor' })).toBeInTheDocument();
      expect(unhandledRejection).not.toHaveBeenCalled();

      fireEvent.change(screen.getByLabelText('Kullanıcı Adı'), { target: { value: 'admin' } });
      fireEvent.change(screen.getByLabelText('Şifre'), { target: { value: 'password' } });
      fireEvent.click(loginButton);
      await waitFor(() => expect(login).toHaveBeenCalledTimes(1));
    } finally {
      window.removeEventListener('unhandledrejection', unhandledRejection);
    }
  });


  test('drops a queued WebSocket batch when project and auth epochs change', async () => {
    const sockets = installWebSocket();
    setupApi();

    render(<App />);
    await waitForHeading(projectA.title);
    await waitFor(() => expect(sockets).toHaveLength(1));
    fireEvent.click(screen.getByRole('button', { name: /Canlı Süreç Logları/ }));

    sockets[0].onmessage({
      data: JSON.stringify({ projectId: projectA.id, action: 'write', message: 'A queued websocket log' })
    });
    fireEvent.click(screen.getByText(projectB.title, { selector: 'span' }));
    await waitForHeading(projectB.title);
    fireEvent.click(screen.getByRole('button', { name: /Canlı Süreç Logları/ }));

    fireEvent.click(screen.getByRole('button', { name: /Oturumu Kapat|Çıkış/i }));
    await screen.findByRole('button', { name: 'Giriş Yap' });
    await new Promise(resolve => setTimeout(resolve, 125));

    expect(screen.queryByText('A queued websocket log')).not.toBeInTheDocument();
  });

  test('does not let delayed create response force the old project active', async () => {
    let delayedCreate;
    const createPromise = new Promise(resolve => {
      delayedCreate = { resolve };
    });
    const promptMock = vi.fn().mockReturnValue('Gamma');
    vi.stubGlobal('prompt', promptMock);
    const spies = setupApi();
    spies.createProject.mockReturnValue(createPromise);

    render(<App />);
    fireEvent.click(await screen.findByText(projectB.title, { selector: 'span' }));
    await waitForHeading(projectB.title);

    fireEvent.click(screen.getByTitle('Yeni Proje Başlat'));
    delayedCreate.resolve({ id: 'project-c', title: 'Gamma', status: 'planning' });
    await waitForHeading(projectB.title);

    expect(screen.queryByRole('heading', { name: 'Gamma' })).not.toBeInTheDocument();
  });
});
