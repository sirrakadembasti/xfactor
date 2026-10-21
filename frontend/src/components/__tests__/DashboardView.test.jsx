import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
  expect(screen.getByText(/Bağımsız Worker Kanıtı|Independent Worker Evidence/i)).toBeInTheDocument();
  expect(screen.getByText(/Ajan Öz-Raporları|Agent Self-Reports/i)).toBeInTheDocument();
  expect(screen.getByText(/Salt-Okunur|read-only/i)).toBeInTheDocument();

  for (const mutationName of [/accept/i, /complete/i, /approve/i, /bypass/i]) {
    expect(screen.queryByRole('button', { name: mutationName })).not.toBeInTheDocument();
  }
});

test('names management login, role permissions, CRUD denial and browser checks', async () => {
  const managementChecks = [
    'management_demo_seed', 'management_role_login', 'api_role_create_allowed', 'api_role_delete_denied',
    'api_anonymous_mutation_denied', 'api_delete_related_retention', 'browser_management_interaction'
  ].map((gate_name, index) => ({ ...check, id: `management-${index}`, gate_name }));
  render(<DashboardView projectId={projectId} projectTitle="Management Project"
    apiClient={createApi({ getVerificationRun: async () => ({ run, checks: managementChecks }) })} />);
  expect(await screen.findByText('Demo rol hesapları')).toBeInTheDocument();
  expect(screen.getByText('Rol girişleri')).toBeInTheDocument();
  expect(screen.getByText('Rol bazlı oluşturma izni')).toBeInTheDocument();
  expect(screen.getByText('Rol bazlı silme reddi')).toBeInTheDocument();
  expect(screen.getByText('Oturumsuz yazma reddi')).toBeInTheDocument();
  expect(screen.getByText('İlişkili kayıt saklama kuralı')).toBeInTheDocument();
  expect(screen.getByText('Yönetim paneli etkileşimleri')).toBeInTheDocument();
});

test('explains the panel purpose, status meanings, and selected run summary before technical evidence', async () => {
  render(<DashboardView projectId={projectId} projectTitle="Dashboard Project" apiClient={createApi()} />);

  expect(screen.getByRole('heading', { name: /Bu panel neyi gösterir/i })).toBeInTheDocument();
  expect(screen.getByText(/PASS.*kontrol başarıyla tamamlandı/i)).toBeInTheDocument();
  expect(await screen.findByText(/1 kontrol geçti/i)).toBeInTheDocument();
  expect(screen.getByText(/API uç noktaları/i)).toBeInTheDocument();
});

test('shows what a selected check did and its machine evidence', async () => {
  render(<DashboardView projectId={projectId} projectTitle="Dashboard Project" apiClient={createApi()} />);

  fireEvent.click(await screen.findByRole('button', { name: /api_contract.*check-evidence-009/i }));
  expect(await screen.findByText('database_url=[REDACTED]')).toBeInTheDocument();
  expect(screen.getAllByText(/API yanıtları ve veri işlemleri/i).length).toBeGreaterThanOrEqual(1);
  expect(screen.getByText('Çıkış kodu')).toBeInTheDocument();
  expect(screen.getByText('stdout-sha256')).toBeInTheDocument();
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
  expect((await screen.findAllByText('browser_e2e')).length).toBeGreaterThan(0);

  firstDetail.resolve({ run, checks: [check] });
  await waitFor(() => expect(screen.queryByText('api_contract')).not.toBeInTheDocument());
  expect(screen.getAllByText('browser_e2e').length).toBeGreaterThan(0);
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

test('identifies native worker evidence without claiming OS isolation', async () => {
  render(<DashboardView projectId={projectId} apiClient={createApi({ getVerificationRun: async () => ({ run, checks: [{ ...check, executionProfile: 'local-trusted', osIsolation: false }] }) })} />);
  await waitFor(() => expect(screen.getByText(/Yerel worker · local-trusted · OS izolasyonu yok/)).toBeInTheDocument());
});

test('polling discovers a new run and follows the latest selected evidence without remounting', async () => {
  vi.useFakeTimers();
  try {
    let head = { ...run, status: 'failed' };
    const apiClient = createApi({
      getVerificationRuns: vi.fn(async () => ({ runs: [head], nextCursor: null })),
      getVerificationRun: async (_, id) => ({ run: { ...head, id }, checks: [] })
    });
    await act(async () => render(<DashboardView projectId={projectId} apiClient={apiClient} />));
    head = { ...run, id: 'new-running-run', status: 'running' };
    await act(async () => { await vi.advanceTimersByTimeAsync(15000); });
    expect(screen.getByText('new-running-run')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Seçili koşu özeti' })).getByText('Sürüyor')).toBeInTheDocument();
    expect(apiClient.getVerificationRuns).toHaveBeenCalledTimes(2);
  } finally { vi.useRealTimers(); }
});

test('polling skips overlapping history and detail requests then refreshes running check evidence', async () => {
  vi.useFakeTimers();
  try {
    const pendingHistory = deferred();
    const pendingDetail = deferred();
    const getVerificationRuns = vi.fn().mockReturnValueOnce(pendingHistory.promise)
      .mockResolvedValue({ runs: [run], nextCursor: null });
    const getVerificationRun = vi.fn().mockReturnValueOnce(pendingDetail.promise)
      .mockResolvedValue({ run, checks: [check, secondCheck] });
    await act(async () => render(<DashboardView projectId={projectId} apiClient={createApi({ getVerificationRuns, getVerificationRun })} />));
    await act(async () => { await vi.advanceTimersByTimeAsync(30000); });
    expect(getVerificationRuns).toHaveBeenCalledTimes(1);
    await act(async () => pendingHistory.resolve({ runs: [{ ...run, status: 'running' }], nextCursor: null }));
    await act(async () => { await vi.advanceTimersByTimeAsync(30000); });
    expect(getVerificationRun).toHaveBeenCalledTimes(1);
    await act(async () => pendingDetail.resolve({ run: { ...run, status: 'running' }, checks: [] }));
    await act(async () => { await vi.advanceTimersByTimeAsync(15000); });
    expect(getVerificationRun).toHaveBeenCalledTimes(2);
    const summary = within(screen.getByRole('region', { name: 'Seçili koşu özeti' }));
    expect(summary.getByText('Doğrulandı')).toBeInTheDocument();
    expect(summary.getByText(/2 kontrol geçti/)).toBeInTheDocument();
  } finally { vi.useRealTimers(); }
});

test('polling preserves an older selected run, its log and the loaded history cursor', async () => {
  vi.useFakeTimers();
  try {
    let newest = run;
    const getVerificationRuns = vi.fn(async (_, options) => options.cursor
      ? { runs: [olderRun], nextCursor: 'tail-cursor' }
      : { runs: [newest], nextCursor: 'head-cursor' });
    const apiClient = createApi({ getVerificationRuns, getVerificationRun: async (_, id) => ({ run: id === olderRun.id ? olderRun : newest, checks: [check] }) });
    await act(async () => render(<DashboardView projectId={projectId} apiClient={apiClient} />));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: /Daha Eski Koşuları Yükle/ })));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: new RegExp(olderRun.id + '.*doğrulama koşusunu incele') })));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: /api_contract.*check-evidence-009/ })));
    newest = { ...run, id: 'latest-added-run', status: 'running' };
    await act(async () => { await vi.advanceTimersByTimeAsync(15000); });
    expect(screen.getByText('latest-added-run')).toBeInTheDocument();
    expect(screen.getAllByText(olderRun.id)).toHaveLength(1);
    expect(screen.getByText(run.id)).toBeInTheDocument();
    expect(screen.getByText('database_url=[REDACTED]')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Seçili koşu özeti' })).getByText('Doğrulandı')).toBeInTheDocument();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: /Daha Eski Koşuları Yükle/ })));
    expect(getVerificationRuns).toHaveBeenLastCalledWith(projectId, expect.objectContaining({ cursor: 'tail-cursor' }));
    expect(screen.getAllByText(olderRun.id)).toHaveLength(1);
  } finally { vi.useRealTimers(); }
});

test('polling aborts and discards old project history and detail after a project switch', async () => {
  vi.useFakeTimers();
  try {
    const staleHistory = deferred();
    const staleDetail = deferred();
    const nextRun = { ...run, id: 'project-b-run' };
    let historySignal;
    let detailSignal;
    let poll = false;
    const apiClient = createApi({
      getVerificationRuns: async (id, options) => {
        if (id !== projectId) return { runs: [nextRun], nextCursor: null };
        if (poll) { historySignal = options.signal; return staleHistory.promise; }
        return { runs: [run], nextCursor: null };
      },
      getVerificationRun: async (id, _, options) => {
        if (id !== projectId) return { run: nextRun, checks: [secondCheck] };
        if (poll) { detailSignal = options.signal; return staleDetail.promise; }
        return { run, checks: [check] };
      }
    });
    let view;
    await act(async () => { view = render(<DashboardView projectId={projectId} apiClient={apiClient} />); });
    poll = true;
    await act(async () => { await vi.advanceTimersByTimeAsync(15000); });
    await act(async () => view.rerender(<DashboardView projectId="project-b" apiClient={apiClient} />));
    await act(async () => {
      staleHistory.resolve({ runs: [{ ...run, id: 'stale-a-run' }], nextCursor: null });
      staleDetail.resolve({ run, checks: [check] });
    });
    expect(historySignal?.aborted).toBe(true);
    expect(detailSignal?.aborted).toBe(true);
    expect(screen.getByText('project-b-run')).toBeInTheDocument();
    expect(screen.queryByText('stale-a-run')).not.toBeInTheDocument();
    expect(screen.queryByText('api_contract')).not.toBeInTheDocument();
    expect(screen.getAllByText('browser_e2e').length).toBeGreaterThan(0);
  } finally { vi.useRealTimers(); }
});

test('serializes older-page navigation behind a pending history poll and re-enables it afterward', async () => {
  vi.useFakeTimers();
  try {
    const pendingHead = deferred();
    const getVerificationRuns = vi.fn()
      .mockResolvedValueOnce({ runs: [run], nextCursor: 'older-cursor' })
      .mockReturnValueOnce(pendingHead.promise)
      .mockResolvedValueOnce({ runs: [olderRun], nextCursor: null });
    await act(async () => render(<DashboardView projectId={projectId} apiClient={createApi({ getVerificationRuns })} />));
    await act(async () => { await vi.advanceTimersByTimeAsync(15000); });
    const olderButton = screen.getByRole('button', { name: /Daha Eski Koşuları Yükle/ });
    expect(olderButton).toBeDisabled();
    await act(async () => fireEvent.click(olderButton));
    expect(getVerificationRuns).toHaveBeenCalledTimes(2);
    await act(async () => pendingHead.resolve({ runs: [run], nextCursor: 'older-cursor' }));
    expect(olderButton).toBeEnabled();
    await act(async () => fireEvent.click(olderButton));
    expect(getVerificationRuns).toHaveBeenCalledTimes(3);
    expect(getVerificationRuns).toHaveBeenLastCalledWith(projectId, expect.objectContaining({ cursor: 'older-cursor' }));
    expect(screen.getByText(olderRun.id)).toBeInTheDocument();
  } finally { vi.useRealTimers(); }
});
