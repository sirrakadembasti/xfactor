import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { api, buildArtifactDownloadUrl, requestVerifiedArtifactDownload } from '../../services/api';
import Header from '../Header';
import Sidebar from '../Sidebar';
import App from '../../App';

const headerProps = {
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

const sidebarProps = {
  projects: [{ id: 'project-1', title: 'Project One', status: 'completed', isPinned: false }],
  searchQuery: '',
  setSearchQuery: vi.fn(),
  activeProjectId: 'project-1',
  setActiveProjectId: vi.fn(),
  activeMenuProjectId: null,
  setActiveMenuProjectId: vi.fn(),
  handleCreateProject: vi.fn(),
  handleTogglePin: vi.fn(),

  handleRenameProject: vi.fn(),
  handleDeleteProject: vi.fn(),
  loginUsername: 'admin',
  handleLogout: vi.fn(),
  getStatusBadge: () => null
};

function SidebarWithMenu() {
  const [activeMenuProjectId, setActiveMenuProjectId] = React.useState(null);
  return <Sidebar {...sidebarProps} activeMenuProjectId={activeMenuProjectId} setActiveMenuProjectId={setActiveMenuProjectId} />;
}

test('builds the configured-origin URL for a verified artifact download', () => {
  expect(buildArtifactDownloadUrl(
    'project-1',
    'contract-1',
    'artifact-1',
    'https://api.example.test/api'
  )).toBe(
    'https://api.example.test/api/projects/project-1/contracts/contract-1/artifacts/artifact-1/download'
  );
});

test('rejects blank artifact download identities', () => {
  expect(() => buildArtifactDownloadUrl('project-1', ' ', 'artifact-1')).toThrow(
    'Artefakt indirme kimliği yapılandırılmamış.'
  );
});

test('downloads active verified state without fetching it again', async () => {
  const getProject = vi.fn();
  const navigate = vi.fn();

  await requestVerifiedArtifactDownload({
    projectId: 'project-1',
    activeProjectId: 'project-1',
    projectState: { contractId: 'contract-1', latestArtifact: { id: 'artifact-1', status: 'verified' } },
    getProject,
    navigate
  });

  expect(getProject).not.toHaveBeenCalled();
  expect(navigate).toHaveBeenCalledWith(
    buildArtifactDownloadUrl('project-1', 'contract-1', 'artifact-1')
  );
});

test('fetches a non-active project once before downloading its verified artifact', async () => {
  const getProject = vi.fn().mockResolvedValue({
    contractId: 'contract-2',
    latestArtifact: { id: 'artifact-2', status: 'verified' }
  });
  const navigate = vi.fn();

  await requestVerifiedArtifactDownload({
    projectId: 'project-2',
    activeProjectId: 'project-1',
    projectState: null,
    getProject,
    navigate
  });

  expect(getProject).toHaveBeenCalledTimes(1);
  expect(getProject).toHaveBeenCalledWith('project-2');
  expect(navigate).toHaveBeenCalledWith(
    buildArtifactDownloadUrl('project-2', 'contract-2', 'artifact-2')
  );
});

test('shows and dismisses the verified-artifact policy alert', async () => {
  class TestWebSocket {
    static OPEN = 1;
    static CONNECTING = 0;
    readyState = TestWebSocket.OPEN;
    addEventListener() {}
    close() {}
    send() {}
  }
  Element.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal('WebSocket', TestWebSocket);
  vi.spyOn(api, 'getSession').mockResolvedValue({ user: { username: 'admin' } });
  vi.spyOn(api, 'getProjects').mockResolvedValue([{ id: 'project-1', title: 'Project', status: 'completed' }]);
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

  fireEvent.click(await screen.findByRole('button', { name: /zip/i }));

  const alert = await screen.findByRole('alert');
  expect(alert).toHaveTextContent('Bu proje için doğrulanmış ZIP artefaktı bulunmuyor.');
  fireEvent.click(screen.getByRole('button', { name: 'Kapat' }));
  await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
});

test('shows the ZIP button only for a completed project with a verified artifact', () => {
  const view = render(<Header {...headerProps} projectState={{ title: 'Project', status: 'completed', latestArtifact: null }} />);

  expect(screen.queryByRole('button', { name: /zip/i })).not.toBeInTheDocument();

  view.unmount();
  render(
    <Header
      {...headerProps}
      projectState={{
        title: 'Project',
        status: 'completed',
        latestArtifact: { id: 'artifact-1', status: 'verified', sha256: 'a'.repeat(64) }
      }}
    />
  );

  expect(screen.getByRole('button', { name: /zip/i })).toBeInTheDocument();
});

test('does not expose a ZIP action in the project-list menu', () => {
  render(<SidebarWithMenu />);

  fireEvent.click(screen.getByTitle('Proje İşlemleri'));

  expect(screen.getByRole('button', { name: /yeniden adlandır/i })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /zip olarak indir/i })).not.toBeInTheDocument();
});
