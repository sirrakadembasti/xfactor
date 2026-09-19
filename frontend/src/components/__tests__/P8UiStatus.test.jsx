import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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
