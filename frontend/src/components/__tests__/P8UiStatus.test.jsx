import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import ConnectionStatus from '../ConnectionStatus';
import Header from '../Header';
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

test('Header offers Resume for verification_failed projects', () => {
  const handleResume = vi.fn();
  render(<Header {...headerProps} projectState={{ title: 'Project', status: 'verification_failed' }} handleResume={handleResume} />);

  fireEvent.click(screen.getByRole('button', { name: /Projeyi Devam Ettir \(Resume\)/ }));
  expect(handleResume).toHaveBeenCalledTimes(1);
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
