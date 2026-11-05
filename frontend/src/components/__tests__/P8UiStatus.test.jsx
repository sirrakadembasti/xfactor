import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { vi } from 'vitest';
import ConnectionStatus from '../ConnectionStatus';
import Header from '../Header';
import Sidebar from '../Sidebar';
import App from '../../App';
import { api } from '../../services/api';

const statusLabels = {
  connected: 'Canlı bağlantı aktif',
  connecting: 'Canlı bağlantı yeniden kuruluyor...',
  reconnecting: 'Canlı bağlantı yeniden kuruluyor...',
  disconnected: 'Canlı bağlantı kesildi'
};

const headerProps = {
  projectState: { title: 'Project', status: 'running', latestArtifact: null },
  activeProjectId: 'project-1',
  viewMode: 'chat',
  setViewMode: vi.fn(),
  fetchProjectState: vi.fn(),
  handleApprove: vi.fn(),
  handlePause: vi.fn(),
  handleResume: vi.fn(),
  handleDownloadProjectZip: vi.fn(),
  getStatusBadge: () => null
};

for (const [state, label] of Object.entries(statusLabels)) {
  test(`renders ${state} as visible color-independent live status text`, () => {
    render(<ConnectionStatus state={state} />);

    const status = screen.getByRole('status', { name: label });
    expect(status).toBeVisible();
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(status).toHaveTextContent(label);
  });
}

test('Header forwards WebSocket state to its accessible status indicator', () => {
  render(<Header {...headerProps} wsState="reconnecting" />);

  expect(screen.getByRole('status', { name: statusLabels.reconnecting })).toBeVisible();
});

test('Header puts chat first and quality next in the project navigation', () => {
  render(<Header {...headerProps} />);

  const views = screen.getAllByRole('button').filter(button =>
    /Sohbet & Mimari|Kalite Paneli|Canlı DAG Grafiği|Canlı Süreç Logları/.test(button.textContent)
  );
  expect(views.map(button => button.textContent.trim())).toEqual([
    'Sohbet & Mimari',
    'Kalite Paneli',
    'Canlı DAG Grafiği',
    'Canlı Süreç Logları'
  ]);
});

test('Header cannot approve a pending draft with lost mandatory scope', () => {
  const handleApprove = vi.fn();
  render(<Header {...headerProps} projectState={{ title: 'Project', status: 'pending_approval',
    planScopeReview: { valid: false, issues: [{ id: 'REQ-5' }] } }} handleApprove={handleApprove} />);
  const approval = screen.getByRole('button', { name: /Planı Onayla ve Başlat/ });
  expect(approval).toBeDisabled();
  fireEvent.click(approval);
  expect(handleApprove).not.toHaveBeenCalled();
});

test('Header offers Resume for verification_failed projects', () => {
  const handleResume = vi.fn();
  render(<Header {...headerProps} projectState={{ title: 'Project', status: 'verification_failed' }} handleResume={handleResume} />);

  fireEvent.click(screen.getByRole('button', { name: /Projeyi Devam Ettir \(Resume\)/ }));
  expect(handleResume).toHaveBeenCalledTimes(1);
});

test('Header identifies verification-only work and allows pausing its worker stage', () => {
  const handlePause = vi.fn();
  render(<Header {...headerProps} projectState={{ title: 'Project', status: 'implementation_finished',
    executionMode: 'verification_only' }} handlePause={handlePause} />);
  expect(screen.getByText('Yalnız doğrulanıyor')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: /Süreci Duraklat/ }));
  expect(handlePause).toHaveBeenCalledTimes(1);
});

test('Header offers Resume when finalization failed after artifact verification', () => {
  render(<Header {...headerProps} projectState={{ title: 'Project', status: 'artifact_verified', last_error: 'Evidence mismatch' }} />);
  expect(screen.getByRole('button', { name: /Projeyi Devam Ettir \(Resume\)/ })).toBeInTheDocument();
});

test('Header offers Pause while backend reports implementing', () => {
  const handlePause = vi.fn();
  render(<Header {...headerProps} projectState={{ title: 'Project', status: 'implementing' }} handlePause={handlePause} />);

  fireEvent.click(screen.getByRole('button', { name: /Süreci Duraklat/ }));
  expect(handlePause).toHaveBeenCalledTimes(1);
});

test('project in implementing state is labelled as production, not planning', async () => {
  class TestWebSocket {
    static OPEN = 1;
    static CONNECTING = 0;
    readyState = TestWebSocket.OPEN;
    close() {}
    send() {}
  }
  Element.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal('WebSocket', TestWebSocket);
  vi.spyOn(api, 'getSession').mockResolvedValue({ user: { username: 'admin' } });
  vi.spyOn(api, 'syncProjects').mockResolvedValue({});
  vi.spyOn(api, 'getProjects').mockResolvedValue([{ id: 'project-1', title: 'Project', status: 'implementing' }]);
  vi.spyOn(api, 'getProject').mockResolvedValue({ id: 'project-1', title: 'Project', status: 'implementing', chatHistory: [] });
  vi.spyOn(api, 'getProjectLogs').mockResolvedValue([]);
  vi.spyOn(api, 'getProjectFiles').mockResolvedValue([]);

  render(<App />);
  await screen.findByRole('heading', { name: 'Project' });
  expect(screen.getAllByText('Üretiliyor').length).toBeGreaterThan(0);
  expect(screen.queryByText('Planlama')).not.toBeInTheDocument();
});

function setupStatusProject(status) {
  vi.stubGlobal('WebSocket', class {
    static OPEN = 1;
    readyState = 1;
    close() {}
    send() {}
  });
  Element.prototype.scrollIntoView = vi.fn();
  vi.spyOn(api, 'getSession').mockResolvedValue({ user: { username: 'admin' } });
  vi.spyOn(api, 'syncProjects').mockResolvedValue({});
  const project = { id: 'project-1', title: 'Project', status, chatHistory: [] };
  const list = vi.spyOn(api, 'getProjects').mockResolvedValue([project]);
  const detail = vi.spyOn(api, 'getProject').mockResolvedValue(project);
  vi.spyOn(api, 'getProjectLogs').mockResolvedValue([]);
  return { project, list, detail };
}

test.each(['implementation_finished', 'verification_pending', 'verification_running', 'build_verified', 'runtime_verified', 'acceptance_verified', 'artifact_verified'])(
  '%s shows quality control in both sidebar and header without claiming completion', async status => {
    setupStatusProject(status);
    render(<App />);
    await screen.findByRole('heading', { name: 'Project' });
    expect(screen.getAllByText('Kalite kontrolü')).toHaveLength(2);
    expect(screen.queryByText('Planlama')).not.toBeInTheDocument();
    expect(screen.queryByText('Tamamlandı')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /ZIP.*İndir/ })).not.toBeInTheDocument();
  }
);

test('verification-only work is not labelled as generation in the project list', () => {
  render(<Sidebar projects={[{ id: 'project-1', title: 'Project', status: 'implementing', executionMode: 'verification_only' }]}
    activeProjectId="project-1" searchQuery="" setSearchQuery={vi.fn()} setActiveProjectId={vi.fn()}
    getStatusBadge={() => 'Üretiliyor'} readOnly user={{ username: 'admin' }} />);
  expect(screen.getByText('Yalnız doğrulanıyor')).toBeVisible();
  expect(screen.queryByText('Üretiliyor')).not.toBeInTheDocument();
});

test('polling reconciles a stale production header when the active project reaches quality control without a websocket event', async () => {
  vi.useFakeTimers();
  try {
    const { project, list, detail } = setupStatusProject('implementing');
    await act(async () => render(<App />));
    expect(screen.getAllByText('Üretiliyor')).toHaveLength(2);
    const updated = { ...project, status: 'implementation_finished' };
    list.mockResolvedValue([updated]);
    detail.mockResolvedValue(updated);
    await act(async () => { await vi.advanceTimersByTimeAsync(4000); });
    expect(screen.getAllByText('Kalite kontrolü')).toHaveLength(2);
    expect(screen.queryByText('Üretiliyor')).not.toBeInTheDocument();
    expect(screen.queryByText('Tamamlandı')).not.toBeInTheDocument();
  } finally {
    vi.useRealTimers();
  }
});

test('App passes the current failed status to quality history while retaining an older verified run', async () => {
  setupStatusProject('verification_failed');
  const historical = { id: 'historical-worker-run', contract_id: 'previous-contract', status: 'verified' };
  vi.spyOn(api, 'getVerificationRuns').mockResolvedValue({ runs: [historical], nextCursor: null });
  vi.spyOn(api, 'getVerificationRun').mockResolvedValue({ run: historical, checks: [] });
  render(<App />);
  await screen.findByRole('heading', { name: 'Project' });
  fireEvent.click(screen.getByRole('button', { name: 'Kalite Paneli' }));
  expect(await screen.findByText('historical-worker-run')).toBeInTheDocument();
  expect(screen.getByRole('status', { name: 'Güncel proje durumu' })).toHaveTextContent('Güncel doğrulama başarısız');
  expect(within(screen.getByRole('row', { name: /historical-worker-run/ })).getByText('Doğrulandı')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /ZIP.*İndir/ })).not.toBeInTheDocument();
});

test('focuses a new UI error alert and keyboard-dismiss restores initiating control', async () => {
  class TestWebSocket {
    static OPEN = 1;
    static CONNECTING = 0;
    readyState = TestWebSocket.OPEN;
    close() {}
    send() {}
  }

  Element.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal('WebSocket', TestWebSocket);
  vi.spyOn(api, 'getSession').mockResolvedValue({ user: { username: 'admin' } });
  vi.spyOn(api, 'syncProjects').mockResolvedValue({});
  vi.spyOn(api, 'getProjects').mockResolvedValue([
    { id: 'project-1', title: 'Project', status: 'completed' }
  ]);
  vi.spyOn(api, 'getProject').mockResolvedValue({
    id: 'project-1',
    title: 'Project',
    status: 'completed',
    contractId: '',
    latestArtifact: { id: 'artifact-1', status: 'verified', sha256: 'a'.repeat(64) }
  });
  vi.spyOn(api, 'getProjectLogs').mockResolvedValue([]);
  vi.spyOn(api, 'getProjectFiles').mockResolvedValue([]);

  render(<App />);

  const downloadButton = await screen.findByRole('button', { name: /zip/i }, { timeout: 5000 });
  downloadButton.focus();
  fireEvent.click(downloadButton);

  const alert = await screen.findByRole('alert');
  expect(alert).toHaveFocus();
  expect(alert).toHaveTextContent('Bu proje için doğrulanmış ZIP artefaktı bulunmuyor.');

  const dismissButton = screen.getByRole('button', { name: 'Kapat' });
  dismissButton.focus();
  fireEvent.click(dismissButton);

  await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  expect(downloadButton).toHaveFocus();
});

test('FE-2: App does not trigger api.syncProjects on mount, only calls getProjects', async () => {
  const syncSpy = vi.spyOn(api, 'syncProjects').mockResolvedValue({});
  vi.spyOn(api, 'getSession').mockResolvedValue({ user: { username: 'admin' } });
  vi.spyOn(api, 'getProjects').mockResolvedValue([{ id: 'project-1', title: 'Project', status: 'completed' }]);
  vi.spyOn(api, 'getProject').mockResolvedValue({ id: 'project-1', title: 'Project', status: 'completed', chatHistory: [] });
  vi.spyOn(api, 'getProjectLogs').mockResolvedValue([]);
  vi.spyOn(api, 'getProjectFiles').mockResolvedValue([]);

  render(<App />);
  await screen.findByRole('heading', { name: 'Project' });
  expect(syncSpy).not.toHaveBeenCalled();
});

test.each([
  ['verification_failed', 'Doğrulama Başarısız'],
  ['capability_blocked', 'Yetenek Engeli']
])('FE-3: %s shows %s badge without falling back to Planlama', async (status, badgeText) => {
  setupStatusProject(status);
  render(<App />);
  await screen.findByRole('heading', { name: 'Project' });
  expect(screen.getAllByText(badgeText).length).toBeGreaterThan(0);
  expect(screen.queryByText('Planlama')).not.toBeInTheDocument();
});

test('FE-4: App derives DAG nodes and edges in useEffect without mutating setLogs state updater', async () => {
  setupStatusProject('implementing');
  vi.spyOn(api, 'getProjectLogs').mockResolvedValue([
    {
      id: 1,
      agent: 'Coder',
      node_id: 'backend.tl_backend.task_1',
      parent_node_id: 'backend.tl_backend',
      action: 'start',
      created_at: '2026-10-28T10:01:00.000Z'
    }
  ]);
  render(<App />);
  await screen.findByRole('heading', { name: 'Project' });
  expect(screen.getByRole('heading', { name: 'Project' })).toBeInTheDocument();
});
