import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import DashboardView from '../DashboardView';

const projectId = 'project-dashboard';
const run = {
  id: 'run-evidence-001',
  contract_id: 'contract-007',
  status: 'verified',
  policy_version: 'quality-v3',
  started_at: '2026-08-31T10:00:00.000Z',
  ended_at: '2026-08-31T10:00:04.000Z'
};
const check = {
  id: 'check-evidence-009',
  gate_name: 'api_contract',
  applicability: 'MANDATORY',
  status: 'PASS',
  exit_code: 0,
  stdout_digest: 'stdout-sha256',
  stderr_digest: 'stderr-sha256',
  started_at: '2026-08-31T10:00:00.000Z',
  ended_at: '2026-08-31T10:00:01.000Z',
  timed_out: false
};
const olderRun = {
  ...run,
  id: 'run-evidence-older',
  contract_id: 'contract-006',
  started_at: '2026-08-30T10:00:00.000Z'
};
const secondCheck = {
  ...check,
  id: 'check-evidence-010',
  gate_name: 'browser_e2e'
};

function deferred() {
  let resolve;
  const promise = new Promise(next => { resolve = next; });
  return { promise, resolve };
}

function createApi(overrides = {}) {
  return {
    getVerificationRuns: async () => ({ runs: [run], nextCursor: null }),
    getVerificationRun: async () => ({ run, checks: [check] }),
    getVerificationCheckLog: async () => ({
      id: check.id,
      gate_name: check.gate_name,
      stdout: 'database_url=[REDACTED]',
      stderr: 'Bearer [REDACTED]'
    }),
    ...overrides
  };
}

test('renders authoritative run history and evidence identifiers without mutation controls', async () => {
  render(<DashboardView projectId={projectId} projectTitle="Dashboard Project" apiClient={createApi()} />);

  expect(await screen.findByText('run-evidence-001')).toBeInTheDocument();
  expect(screen.getByText('contract-007')).toBeInTheDocument();
  expect(screen.getByText(/Bağımsız Sandbox Kanıtı|Independent Sandbox Evidence/i)).toBeInTheDocument();
  expect(screen.getByText(/Ajan Öz-Raporları|Agent Self-Reports/i)).toBeInTheDocument();
  expect(screen.getByText(/Salt-Okunur|read-only/i)).toBeInTheDocument();

  for (const mutationName of [/accept/i, /complete/i, /approve/i, /bypass/i]) {
    expect(screen.queryByRole('button', { name: mutationName })).not.toBeInTheDocument();
  }
});

test('loads selected check logs and renders backend redaction markers', async () => {
  const apiClient = createApi();
  const { container } = render(
    <DashboardView projectId={projectId} projectTitle="Dashboard Project" apiClient={apiClient} />
  );

  const checkButton = await screen.findByRole('button', { name: /api_contract.*check-evidence-009/i });
  fireEvent.click(checkButton);

  expect(await screen.findByText('database_url=[REDACTED]')).toHaveClass('evidence-log');
  expect(screen.getByText('Bearer [REDACTED]')).toHaveClass('evidence-log');
  expect(container.textContent).not.toContain('supersecret');
  expect(screen.getAllByText('check-evidence-009').length).toBeGreaterThanOrEqual(1);
});

test('loads older verification-run pages using the authoritative cursor', async () => {
  const getVerificationRuns = vi.fn()
    .mockResolvedValueOnce({ runs: [run], nextCursor: 'older-cursor' })
    .mockResolvedValueOnce({ runs: [olderRun], nextCursor: null });
  render(
    <DashboardView projectId={projectId} projectTitle="Dashboard Project" apiClient={createApi({ getVerificationRuns })} />
  );

  fireEvent.click(await screen.findByRole('button', { name: /Daha Eski Koşuları Yükle|load older runs/i }));

  expect(await screen.findByText('run-evidence-older')).toBeInTheDocument();
  expect(getVerificationRuns).toHaveBeenLastCalledWith(
    projectId,
    expect.objectContaining({ cursor: 'older-cursor', limit: 50 })
  );
  expect(screen.queryByRole('button', { name: /Daha Eski Koşuları Yükle|load older runs/i })).not.toBeInTheDocument();
});

test('discards a superseded check log response', async () => {
  const firstLog = deferred();
  const secondLog = deferred();
  const apiClient = createApi({
    getVerificationRun: async () => ({ run, checks: [check, secondCheck] }),
    getVerificationCheckLog: (_, __, selectedCheckId) => (
      selectedCheckId === check.id ? firstLog.promise : secondLog.promise
    )
  });
  render(<DashboardView projectId={projectId} projectTitle="Dashboard Project" apiClient={apiClient} />);

  fireEvent.click(await screen.findByRole('button', { name: /api_contract.*check-evidence-009/i }));
  fireEvent.click(screen.getByRole('button', { name: /browser_e2e.*check-evidence-010/i }));
  secondLog.resolve({ id: secondCheck.id, gate_name: secondCheck.gate_name, stdout: 'second log', stderr: '' });
  expect(await screen.findByText('second log')).toBeInTheDocument();

  firstLog.resolve({ id: check.id, gate_name: check.gate_name, stdout: 'stale first log', stderr: '' });
  await waitFor(() => expect(screen.queryByText('stale first log')).not.toBeInTheDocument());
  expect(screen.getByText('second log')).toBeInTheDocument();
});

test('discards a superseded verification-run detail response', async () => {
  const firstDetail = deferred();
  const secondDetail = deferred();
  const getVerificationRun = vi.fn((_, selectedRunId) => (
    selectedRunId === run.id ? firstDetail.promise : secondDetail.promise
  ));
  const apiClient = createApi({
    getVerificationRuns: async () => ({ runs: [run, olderRun], nextCursor: null }),
    getVerificationRun
  });
  render(<DashboardView projectId={projectId} projectTitle="Dashboard Project" apiClient={apiClient} />);

  fireEvent.click(await screen.findByRole('button', { name: /run-evidence-older.*doğrulama koşusunu incele|inspect verification run run-evidence-older/i }));
  await waitFor(() => expect(getVerificationRun).toHaveBeenCalledTimes(2));
  secondDetail.resolve({ run: olderRun, checks: [secondCheck] });
  expect(await screen.findByText('browser_e2e')).toBeInTheDocument();

  firstDetail.resolve({ run, checks: [check] });
  await waitFor(() => expect(screen.queryByText('api_contract')).not.toBeInTheDocument());
  expect(screen.getByText('browser_e2e')).toBeInTheDocument();
});

test('hides prior-project evidence synchronously during a project switch', async () => {
  const apiClient = createApi({
    getVerificationRuns: selectedProjectId => (
      selectedProjectId === projectId
        ? Promise.resolve({ runs: [run], nextCursor: null })
        : new Promise(() => {})
    )
  });
  const view = render(
    <DashboardView projectId={projectId} projectTitle="Dashboard Project" apiClient={apiClient} />
  );
  fireEvent.click(await screen.findByRole('button', { name: /api_contract.*check-evidence-009/i }));
  expect(await screen.findByText('database_url=[REDACTED]')).toBeInTheDocument();

  view.rerender(<DashboardView projectId="project-next" projectTitle="Next Project" apiClient={apiClient} />);

  expect(screen.queryByText('run-evidence-001')).not.toBeInTheDocument();
  expect(screen.queryByText('api_contract')).not.toBeInTheDocument();
  expect(screen.queryByText('database_url=[REDACTED]')).not.toBeInTheDocument();
});

test('shows a bounded error state when run history cannot be loaded', async () => {
  render(
    <DashboardView
      projectId={projectId}
      projectTitle="Dashboard Project"
      apiClient={createApi({ getVerificationRuns: async () => { throw new Error('network secret'); } })}
    />
  );

  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/Kalite geçmişi yüklenemedi|Quality history could not be loaded/i));
  expect(screen.queryByText('network secret')).not.toBeInTheDocument();
});
