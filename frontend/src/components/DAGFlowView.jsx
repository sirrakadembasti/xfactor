import React, { useEffect, useMemo, useRef, useState } from 'react';
import ReactFlow, { Background, Controls } from 'reactflow';
import 'reactflow/dist/style.css';
import { api } from '../services/api';

const requirementStatusClasses = {
  verified: 'trace-status-verified border-emerald-500 bg-emerald-50 text-emerald-900',
  failed: 'trace-status-failed border-rose-500 bg-rose-50 text-rose-900',
  skipped: 'trace-status-skipped border-slate-400 bg-slate-100 text-slate-700'
};

function requirementKey(requirement) {
  return requirement.stableKey || requirement.stable_key || requirement.id;
}

export default function DAGFlowView({
  nodes,
  edges,
  onNodesChange,
  onEdgesChange,
  projectId,
  apiClient = api
}) {
  const [mode, setMode] = useState('agents');
  const [selectedRequirementKey, setSelectedRequirementKey] = useState(null);
  const [preview, setPreview] = useState(null);
  const [previewing, setPreviewing] = useState(false);
  const [error, setError] = useState('');
  const [traceRequirements, setTraceRequirements] = useState([]);
  const [traceRequirementsProjectId, setTraceRequirementsProjectId] = useState(null);
  const [loadingTraceability, setLoadingTraceability] = useState(false);
  const [noAuthoritativeEvidence, setNoAuthoritativeEvidence] = useState(false);
  const previewControllerRef = useRef(null);

  useEffect(() => {
    previewControllerRef.current?.abort();
    previewControllerRef.current = null;
    setSelectedRequirementKey(null);
    setPreview(null);
    setPreviewing(false);
    setError('');
  }, [projectId]);

  useEffect(() => () => previewControllerRef.current?.abort(), []);

  useEffect(() => {
    if (mode !== 'traceability' || !projectId) return undefined;
    const controller = new AbortController();
    setTraceRequirements([]);
    setTraceRequirementsProjectId(null);
    setNoAuthoritativeEvidence(false);
    setLoadingTraceability(true);
    setError('');
    apiClient.getVerificationRuns(projectId, { limit: 1, signal: controller.signal })
      .then(async data => {
        const latestRun = Array.isArray(data?.runs) ? data.runs[0] : null;
        if (!latestRun) return null;
        return apiClient.getVerificationSummary(
          projectId,
          latestRun.contract_id,
          latestRun.id,
          { signal: controller.signal }
        );
      })
      .then(summary => {
        if (controller.signal.aborted) return;
        if (!summary) {
          setTraceRequirements([]);
          setTraceRequirementsProjectId(projectId);
          setNoAuthoritativeEvidence(true);
          return;
        }
        setTraceRequirements(Array.isArray(summary.requirements) ? summary.requirements : []);
        setTraceRequirementsProjectId(projectId);
      })
      .catch(requestError => {
        if (requestError?.name !== 'AbortError') setError('Traceability evidence could not be loaded.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingTraceability(false);
      });
    return () => controller.abort();
  }, [apiClient, mode, projectId]);

  const traceability = useMemo(() => {
    const visibleRequirements = traceRequirementsProjectId === projectId ? traceRequirements : [];
    const requirementNodes = visibleRequirements.map((requirement, index) => {
      const key = requirementKey(requirement);
      const rawStatus = String(requirement.evidenceStatus || 'SKIPPED').toUpperCase();
      const status = rawStatus === 'PASS' ? 'verified' : (rawStatus === 'FAIL' || rawStatus === 'BLOCKED' ? 'failed' : 'skipped');
      return {
        id: `requirement:${key}`,
        position: { x: 40, y: 40 + index * 130 },
        className: `trace-node trace-requirement ${requirementStatusClasses[status]} ${selectedRequirementKey === key ? 'ring-4 ring-indigo-400' : ''}`,
        data: { label: `${key} — ${requirement.statement || 'Requirement'}` }
      };
    });
    if (!preview || !selectedRequirementKey) return { nodes: requirementNodes, edges: [] };

    const taskIds = Array.isArray(preview.tasksToReRun) ? preview.tasksToReRun : [];
    const checkpointIds = Array.isArray(preview.invalidatedCheckpointIds) ? preview.invalidatedCheckpointIds : [];
    const taskNodes = taskIds.map((taskId, index) => ({
      id: `task:${taskId}`,
      position: { x: 420, y: 40 + index * 110 },
      className: 'trace-node trace-task rebuild-highlight border-orange-500 bg-orange-50 text-orange-900 ring-4 ring-orange-400',
      data: { label: `Task ${taskId}` }
    }));
    const checkpointNodes = checkpointIds.map((checkpointId, index) => ({
      id: `checkpoint:${checkpointId}`,
      position: { x: 800, y: 40 + index * 110 },
      className: 'trace-node trace-checkpoint rebuild-highlight border-rose-500 bg-rose-50 text-rose-900 ring-4 ring-rose-400',
      data: { label: `Checkpoint ${checkpointId}` }
    }));
    const previewEdges = [
      ...taskIds.map(taskId => ({
        id: `requirement:${selectedRequirementKey}->task:${taskId}`,
        source: `requirement:${selectedRequirementKey}`,
        target: `task:${taskId}`,
        animated: true
      })),
      ...checkpointIds.flatMap(checkpointId => taskIds.map(taskId => ({
        id: `task:${taskId}->checkpoint:${checkpointId}`,
        source: `task:${taskId}`,
        target: `checkpoint:${checkpointId}`,
        animated: true
      })))
    ];
    return { nodes: [...requirementNodes, ...taskNodes, ...checkpointNodes], edges: previewEdges };
  }, [preview, projectId, selectedRequirementKey, traceRequirements, traceRequirementsProjectId]);

  const previewRebuild = async () => {
    if (!projectId || !selectedRequirementKey || previewing) return;
    previewControllerRef.current?.abort();
    const controller = new AbortController();
    previewControllerRef.current = controller;
    setPreviewing(true);
    setError('');
    try {
      const result = await apiClient.previewRebuild(projectId, [selectedRequirementKey], { signal: controller.signal });
      if (previewControllerRef.current === controller) setPreview(result);
    } catch (requestError) {
      if (requestError?.name !== 'AbortError' && previewControllerRef.current === controller) {
        setError('Rebuild preview could not be loaded.');
      }
    } finally {
      if (previewControllerRef.current === controller) {
        previewControllerRef.current = null;
        setPreviewing(false);
      }
    }
  };

  const visibleNodes = mode === 'traceability' ? traceability.nodes : nodes;
  const selectTraceabilityNode = (_, node) => {
    if (!node.id.startsWith('requirement:')) return;
    previewControllerRef.current?.abort();
    previewControllerRef.current = null;
    setPreviewing(false);
    const key = node.id.slice('requirement:'.length);
    setSelectedRequirementKey(key);
    setPreview(null);
    setError('');
  };
  const visibleEdges = mode === 'traceability' ? traceability.edges : edges;

  return (
    <div className="flex-1 flex flex-col h-full relative bg-slate-900/95 overflow-hidden">
      <div className="absolute top-4 left-4 z-20 flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800/95 p-1 shadow-lg">
        <button type="button" onClick={() => setMode('agents')} className={`rounded px-3 py-1.5 text-xs font-bold ${mode === 'agents' ? 'bg-indigo-600 text-white' : 'text-slate-300'}`}>Agent DAG</button>
        <button type="button" onClick={() => setMode('traceability')} className={`rounded px-3 py-1.5 text-xs font-bold ${mode === 'traceability' ? 'bg-indigo-600 text-white' : 'text-slate-300'}`}>Traceability DAG</button>
        {mode === 'traceability' && (
          <button type="button" onClick={previewRebuild} disabled={!selectedRequirementKey || previewing} className="rounded bg-orange-500 px-3 py-1.5 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">
            {previewing ? 'Previewing…' : 'Preview Rebuild'}
          </button>
        )}
      </div>

      {mode === 'agents' ? (
        <div className="absolute top-4 right-4 z-10 bg-slate-800/90 backdrop-blur border border-slate-700 rounded-xl px-4 py-2.5 text-[11px] text-gray-300 flex flex-wrap items-center gap-3.5 shadow-lg pointer-events-none">
          <span className="font-semibold text-white">Roller:</span>
          <span>🏛️ Manager</span><span>📁 Director</span><span>📋 Teamleader</span>
          <span>💻 Coder</span><span>🔍 Reviewer</span><span>🧪 Tester</span>
        </div>
      ) : (
        <div className="absolute top-4 right-4 z-10 rounded-lg border border-slate-700 bg-slate-800/95 px-3 py-2 text-[11px] text-slate-200">
          <span className="text-emerald-400">Verified</span> · <span className="text-rose-400">Failed</span> · <span className="text-slate-400">Skipped</span>
        </div>
      )}

      {error && <div role="alert" className="absolute left-4 top-16 z-20 rounded border border-rose-500 bg-rose-950 px-3 py-2 text-xs font-semibold text-rose-100">{error}</div>}

      {mode === 'traceability' && loadingTraceability && <div className="absolute inset-0 z-10 flex items-center justify-center text-sm text-slate-400">Loading traceability evidence…</div>}
      {mode === 'traceability' && !loadingTraceability && noAuthoritativeEvidence && <div className="absolute inset-0 z-10 flex items-center justify-center text-sm text-slate-400">No authoritative traceability evidence available.</div>}
      {mode === 'traceability' && !loadingTraceability && !noAuthoritativeEvidence && traceRequirementsProjectId === projectId && traceRequirements.length === 0 && <div className="absolute inset-0 z-10 flex items-center justify-center text-sm text-slate-400">No traceability requirements available.</div>}

      <div className="flex-1 w-full h-full">
        <ReactFlow
          key={mode}
          nodes={visibleNodes}
          edges={visibleEdges}
          onNodesChange={mode === 'agents' ? onNodesChange : undefined}
          onNodeClick={mode === 'traceability' ? selectTraceabilityNode : undefined}
          onEdgesChange={mode === 'agents' ? onEdgesChange : undefined}
          fitView
          fitViewOptions={{ padding: 0.25 }}
          minZoom={0.2}
          maxZoom={1.5}
          nodesDraggable={mode === 'agents'}
          nodesConnectable={false}
        >
          <Background color="#334155" gap={18} size={1.2} />
          <Controls className="bg-slate-800 border-slate-700 fill-white text-white shadow-md" />
        </ReactFlow>
      </div>
    </div>
  );
}
