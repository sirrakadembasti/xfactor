import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
vi.mock('../IDEView', () => ({
  default: ({ projectFiles = [], activeFile }) => (
    <div data-testid="ide-view" data-active-file={activeFile?.path || ''}>
      {projectFiles.map(file => (
        <button type="button" key={file.path} aria-pressed={activeFile?.path === file.path}>
          {file.path}
        </button>
      ))}
    </div>
  )
}));

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

function setupApi({ stateFor, filesFor, logsFor } = {}) {
  const spies = {
    getSession: vi.spyOn(api, 'getSession').mockResolvedValue({ user: { username: 'admin' } }),
    getProjects: vi.spyOn(api, 'getProjects').mockResolvedValue(projectList),
    getProject: vi.spyOn(api, 'getProject').mockImplementation(id => asPromise(
      stateFor ? stateFor(id) : id === projectA.id ? projectA : projectB
    )),
    getProjectFiles: vi.spyOn(api, 'getProjectFiles').mockImplementation(id => asPromise(
      filesFor ? filesFor(id) : []
    )),
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

describe('P9 project/auth request isolation', () => {
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

  test('does not let deferred A files or logs replace B files or logs', async () => {
    const delayedAFiles = deferred();
    const delayedALogs = deferred();
    const betaFile = { path: 'beta/main.js', encoding: 'utf8', content: 'beta' };
    const betaLog = { projectId: projectB.id, action: 'write', message: 'B log' };
    const spies = setupApi({
      filesFor: id => id === projectA.id ? delayedAFiles.promise : [betaFile],
      logsFor: id => id === projectA.id ? delayedALogs.promise : [betaLog]
    });

    render(<App />);
    await waitForHeading(projectA.title);
    await waitFor(() => expect(spies.getProjectFiles).toHaveBeenCalledWith(
      projectA.id,
      expect.objectContaining({ signal: expect.any(Object) })
    ));
    await waitFor(() => expect(spies.getProjectLogs).toHaveBeenCalledWith(projectA.id, expect.any(Object)));

    fireEvent.click(screen.getByText(projectB.title, { selector: 'span' }));
    await waitForHeading(projectB.title);

    fireEvent.click(screen.getByRole('button', { name: /Kod Editörü/ }));
    await screen.findByText(betaFile.path);

    const staleFile = { path: 'alpha/stale.js', encoding: 'utf8', content: 'stale' };
    delayedAFiles.resolve([staleFile]);
    await waitFor(() => expect(screen.queryByText(staleFile.path)).not.toBeInTheDocument());
    expect(screen.getByText(betaFile.path)).toBeInTheDocument();

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
    fireEvent.click(screen.getByRole('button', { name: 'Çıkış' }));
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
    fireEvent.click(screen.getByRole('button', { name: 'Çıkış' }));
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
      fireEvent.click(screen.getByRole('button', { name: 'Çıkış' }));
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

    fireEvent.click(screen.getByRole('button', { name: 'Çıkış' }));
    await screen.findByRole('button', { name: 'Giriş Yap' });
    await new Promise(resolve => setTimeout(resolve, 125));

    expect(screen.queryByText('A queued websocket log')).not.toBeInTheDocument();
  });

  test('does not let delayed create or rename responses force the old project active', async () => {
    const delayedCreate = deferred();
    const delayedRename = deferred();
    const promptMock = vi.fn()
      .mockReturnValueOnce('Gamma')
      .mockReturnValueOnce('Alpha renamed');
    const projectCState = { id: 'project-c', title: 'Gamma state', status: 'planning', chatHistory: [] };
    const spies = setupApi({
      stateFor: id => id === projectA.id ? projectA : id === projectB.id ? projectB : projectCState
    });
    spies.createProject.mockReturnValue(delayedCreate.promise);
    spies.updateProject.mockReturnValue(delayedRename.promise);
    vi.stubGlobal('prompt', promptMock);

    render(<App />);
    await waitForHeading(projectA.title);

    fireEvent.click(screen.getByTitle('Yeni Proje Başlat'));
    fireEvent.click(screen.getByText(projectB.title, { selector: 'span' }));
    await waitForHeading(projectB.title);
    delayedCreate.resolve({ id: 'project-c', title: 'Gamma', status: 'planning' });
    await waitForHeading(projectB.title);

    fireEvent.click(screen.getByText(projectA.title, { selector: 'span' }));
    await waitForHeading(projectA.title);
    fireEvent.click(screen.getAllByTitle('Proje İşlemleri')[0]);
    fireEvent.click(screen.getByRole('button', { name: /Yeniden Adlandır/ }));
    fireEvent.click(screen.getByText(projectB.title, { selector: 'span' }));
    await waitForHeading(projectB.title);

    delayedRename.resolve({ ...projectA, title: 'Alpha renamed' });
    await waitForHeading(projectB.title);

    expect(screen.queryByRole('heading', { name: 'Alpha renamed' })).not.toBeInTheDocument();
    expect(promptMock).toHaveBeenCalledTimes(2);
  });
});
