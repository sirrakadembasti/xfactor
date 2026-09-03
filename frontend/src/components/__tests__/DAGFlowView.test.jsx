import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import DAGFlowView from '../DAGFlowView';

vi.mock('reactflow', () => ({
  default: ({ nodes = [], edges = [], onNodeClick }) => (
    <div data-testid="react-flow" data-edge-count={edges.length}>
      {nodes.map(node => (
        <button
          key={node.id}
          type="button"
          className={node.className || ''}
          data-node-id={node.id}
          onClick={event => onNodeClick?.(event, node)}
        >
          {node.data?.label}
        </button>
      ))}
    </div>
  ),
  Background: () => null,
  Controls: () => null
}));

const requirements = [
  { id: 'REQ-AUTH', statement: 'Authenticate users' },
  { id: 'REQ-API', statement: 'Expose API' },
  { id: 'REQ-DOCS', statement: 'Document usage' }
];

function deferred() {
  let resolve;
  const promise = new Promise(next => { resolve = next; });
  return { promise, resolve };
}

function renderView(overrides = {}) {
  const apiClient = {
    getVerificationRuns: vi.fn().mockResolvedValue({
      runs: [{ id: 'run-trace', contract_id: 'contract-trace' }],
      nextCursor: null
    }),
    getVerificationSummary: vi.fn().mockResolvedValue({
      requirements: [
        { id: 'req-auth', stableKey: 'REQ-AUTH', statement: 'Authenticate users', evidenceStatus: 'PASS', checkIds: ['check-auth'], artifactIds: ['artifact-auth'] },
        { id: 'req-api', stableKey: 'REQ-API', statement: 'Expose API', evidenceStatus: 'FAIL', checkIds: ['check-api'], artifactIds: ['artifact-api'] },
        { id: 'req-docs', stableKey: 'REQ-DOCS', statement: 'Document usage', evidenceStatus: 'SKIPPED', checkIds: [], artifactIds: [] }
      ],
      checks: [
        { id: 'check-auth', gateName: 'api_contract', status: 'PASS' },
        { id: 'check-api', gateName: 'smoke_gate', status: 'FAIL' }
      ],
      artifacts: [
        { id: 'artifact-auth', path: 'artifacts/auth.zip', status: 'verified' },
        { id: 'artifact-api', path: 'artifacts/api.zip', status: 'rejected' }
      ]
    }),
    previewRebuild: vi.fn().mockResolvedValue({
      willRebuild: true,
      tasksToReRun: ['task-auth'],
      invalidatedCheckpointIds: ['checkpoint-auth']
    }),
    ...overrides.apiClient
  };
  render(
    <DAGFlowView
      nodes={[]}
      edges={[]}
      onNodesChange={() => {}}
      onEdgesChange={() => {}}
      projectId="project-trace"
      requirements={requirements}
      apiClient={apiClient}
    />
  );
  return apiClient;
}

test('maps authoritative requirement evidence into deterministic status-colored ReactFlow nodes', async () => {
  renderView();

  fireEvent.click(screen.getByRole('button', { name: /İzlenebilirlik DAG'ı|Traceability DAG/i }));
  expect(await screen.findByRole('button', { name: /REQ-AUTH.*Authenticate users/i })).toBeInTheDocument();
  expect(screen.getByTestId('react-flow').children).toHaveLength(7);
  expect(screen.getByTestId('react-flow')).toHaveAttribute('data-edge-count', '4');
  expect(screen.getByRole('button', { name: /REQ-AUTH.*Authenticate users/i }).closest('[data-node-id]')).toHaveClass('trace-status-verified');
  expect(screen.getByRole('button', { name: /REQ-API.*Expose API/i }).closest('[data-node-id]')).toHaveClass('trace-status-failed');
  expect(screen.getByRole('button', { name: /REQ-DOCS.*Document usage/i }).closest('[data-node-id]')).toHaveClass('trace-status-skipped');
  expect(screen.getByRole('button', { name: /Check api_contract/i }).closest('[data-node-id]')).toHaveClass('trace-status-verified');
  expect(screen.getByRole('button', { name: /Check smoke_gate/i }).closest('[data-node-id]')).toHaveClass('trace-status-failed');
  expect(screen.getByRole('button', { name: /Artifact artifacts\/auth.zip/i }).closest('[data-node-id]')).toHaveClass('trace-status-verified');
  expect(screen.getByRole('button', { name: /Artifact artifacts\/api.zip/i }).closest('[data-node-id]')).toHaveClass('trace-status-failed');
});

test('previews selected requirement and highlights predicted task and checkpoint nodes', async () => {
  const apiClient = renderView();
  fireEvent.click(screen.getByRole('button', { name: /İzlenebilirlik DAG'ı|Traceability DAG/i }));
  fireEvent.click(await screen.findByRole('button', { name: /REQ-AUTH.*Authenticate users/i }));
  fireEvent.click(screen.getByRole('button', { name: /Yeniden Derlemeyi Önizle|Preview Rebuild/i }));

  await waitFor(() => expect(apiClient.previewRebuild).toHaveBeenCalledWith(
    'project-trace',
    ['REQ-AUTH'],
    expect.objectContaining({ signal: expect.any(AbortSignal) })
  ));
  expect((await screen.findByText('Task task-auth')).closest('[data-node-id]')).toHaveClass('rebuild-highlight');
  expect(screen.getByText('Checkpoint checkpoint-auth').closest('[data-node-id]')).toHaveClass('rebuild-highlight');
});

test('discards a preview when another requirement is selected', async () => {
  const pendingPreview = deferred();
  renderView({ apiClient: { previewRebuild: vi.fn(() => pendingPreview.promise) } });
  fireEvent.click(screen.getByRole('button', { name: /İzlenebilirlik DAG'ı|Traceability DAG/i }));
  fireEvent.click(await screen.findByRole('button', { name: /REQ-AUTH.*Authenticate users/i }));
  fireEvent.click(screen.getByRole('button', { name: /Yeniden Derlemeyi Önizle|Preview Rebuild/i }));
  fireEvent.click(screen.getByRole('button', { name: /REQ-API.*Expose API/i }));

  await act(async () => {
    pendingPreview.resolve({
      willRebuild: true,
      tasksToReRun: ['stale-task'],
      invalidatedCheckpointIds: ['stale-checkpoint']
    });
  });

  await waitFor(() => expect(screen.queryByText('Task stale-task')).not.toBeInTheDocument());
  expect(screen.getByRole('button', { name: /Yeniden Derlemeyi Önizle|Preview Rebuild/i })).not.toBeDisabled();
});

test('does not fabricate skipped statuses when no authoritative verification run exists', async () => {
  renderView({
    apiClient: {
      getVerificationRuns: vi.fn().mockResolvedValue({ runs: [], nextCursor: null })
    }
  });
  fireEvent.click(screen.getByRole('button', { name: /İzlenebilirlik DAG'ı|Traceability DAG/i }));

  expect(await screen.findByText(/Yetkili izlenebilirlik kanıtı bulunamadı|No authoritative traceability evidence available/i)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /REQ-AUTH/i })).not.toBeInTheDocument();
});
