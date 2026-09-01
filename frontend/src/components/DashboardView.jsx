import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle, FileText, History, Loader2, ShieldCheck } from 'lucide-react';
import { api } from '../services/api';

const statusClasses = {
  verified: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  PASS: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  failed: 'bg-rose-50 text-rose-700 border-rose-200',
  FAIL: 'bg-rose-50 text-rose-700 border-rose-200',
  blocked: 'bg-amber-50 text-amber-700 border-amber-200',
  BLOCKED: 'bg-amber-50 text-amber-700 border-amber-200'
};

function StatusBadge({ status }) {
  return (
    <span className={`inline-flex rounded border px-2 py-0.5 text-[11px] font-bold ${statusClasses[status] || 'border-slate-200 bg-slate-50 text-slate-600'}`}>
      {status}
    </span>
  );
}

function formatTimestamp(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

export default function DashboardView({ projectId, projectTitle, apiClient = api }) {
  const [runs, setRuns] = useState([]);
  const [runsProjectId, setRunsProjectId] = useState(null);
  const [selectedRunId, setSelectedRunId] = useState(null);
  const [selectedRunProjectId, setSelectedRunProjectId] = useState(null);
  const [runDetail, setRunDetail] = useState(null);
  const [selectedCheckId, setSelectedCheckId] = useState(null);
  const [log, setLog] = useState(null);
  const [nextCursor, setNextCursor] = useState(null);
  const [loadingRuns, setLoadingRuns] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [loadingLog, setLoadingLog] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const runsRequestRef = useRef(0);
  const detailRequestRef = useRef(0);
  const logRequestRef = useRef(0);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    const requestId = ++runsRequestRef.current;
    detailRequestRef.current += 1;
    logRequestRef.current += 1;
    setRuns([]);
    setRunsProjectId(null);
    setNextCursor(null);
    setSelectedRunProjectId(null);
    setSelectedRunId(null);
    setRunDetail(null);
    setSelectedCheckId(null);
    setLog(null);
    setError('');
    setLoadingRuns(true);

    apiClient.getVerificationRuns(projectId, { limit: 50, signal: controller.signal })
      .then(data => {
        if (runsRequestRef.current !== requestId) return;
        const nextRuns = Array.isArray(data?.runs) ? data.runs : [];
        setRunsProjectId(projectId);
        setRuns(nextRuns);
        setNextCursor(data?.nextCursor || null);
        setSelectedRunProjectId(nextRuns[0] ? projectId : null);
        setSelectedRunId(nextRuns[0]?.id || null);
      })
      .catch(requestError => {
        if (requestError?.name !== 'AbortError') setError('Quality history could not be loaded.');
      })
      .finally(() => {
        if (runsRequestRef.current === requestId) setLoadingRuns(false);
      });

    return () => controller.abort();
  }, [apiClient, projectId]);

  useEffect(() => {
    if (!selectedRunId || selectedRunProjectId !== projectId) {
      detailRequestRef.current += 1;
      setRunDetail(null);
      return undefined;
    }
    const controller = new AbortController();
    const requestId = ++detailRequestRef.current;
    logRequestRef.current += 1;
    setLoadingDetail(true);
    setSelectedCheckId(null);
    setLog(null);
    apiClient.getVerificationRun(projectId, selectedRunId, { signal: controller.signal })
      .then(detail => {
        if (detailRequestRef.current === requestId) setRunDetail(detail);
      })
      .catch(requestError => {
        if (requestError?.name !== 'AbortError' && detailRequestRef.current === requestId) {
          setError('Verification evidence could not be loaded.');
        }
      })
      .finally(() => {
        if (detailRequestRef.current === requestId) setLoadingDetail(false);
      });
    return () => controller.abort();
  }, [apiClient, projectId, selectedRunId, selectedRunProjectId]);

  const loadMoreRuns = async () => {
    if (!nextCursor || loadingMore) return;
    const requestId = ++runsRequestRef.current;
    setLoadingMore(true);
    try {
      const data = await apiClient.getVerificationRuns(projectId, { cursor: nextCursor, limit: 50 });
      if (runsRequestRef.current !== requestId) return;
      setRuns(currentRuns => [...currentRuns, ...(Array.isArray(data?.runs) ? data.runs : [])]);
      setNextCursor(data?.nextCursor || null);
    } catch {
      if (runsRequestRef.current === requestId) setError('Older quality history could not be loaded.');
    } finally {
      if (runsRequestRef.current === requestId) setLoadingMore(false);
    }
  };

  const loadLog = async check => {
    const requestId = ++logRequestRef.current;
    setSelectedCheckId(check.id);
    setLoadingLog(true);
    setLog(null);
    try {
      const nextLog = await apiClient.getVerificationCheckLog(projectId, selectedRunId, check.id);
      if (logRequestRef.current === requestId) setLog(nextLog);
    } catch {
      if (logRequestRef.current === requestId) setError('Evidence log could not be loaded.');
    } finally {
      if (logRequestRef.current === requestId) setLoadingLog(false);
    }
  };

  const runsMatchProject = runsProjectId === projectId;
  const detailMatchesProject = selectedRunProjectId === projectId;
  const visibleRuns = runsMatchProject ? runs : [];
  const checks = detailMatchesProject && Array.isArray(runDetail?.checks) ? runDetail.checks : [];

  return (
    <main className="flex-1 overflow-y-auto bg-slate-50 p-6" aria-label="Quality history dashboard">
      <div className="mx-auto max-w-7xl space-y-5">
        <header className="flex flex-wrap items-start justify-between gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div>
            <div className="mb-1 flex items-center gap-2 text-indigo-700">
              <History size={20} />
              <span className="text-xs font-bold uppercase tracking-wider">Quality History</span>
            </div>
            <h1 className="text-xl font-bold text-slate-900">{projectTitle || 'Project'} Evidence Dashboard</h1>
            <p className="mt-1 text-sm text-slate-500">Immutable verification runs, checks, digests, and redacted console evidence.</p>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-bold text-indigo-700">
            <ShieldCheck size={14} /> read-only
          </span>
        </header>

        <section className="grid gap-3 md:grid-cols-2" aria-label="Evidence authority">
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
            <h2 className="flex items-center gap-2 text-sm font-bold text-emerald-900"><ShieldCheck size={16} /> Independent Sandbox Evidence</h2>
            <p className="mt-1 text-xs text-emerald-800">Authoritative quality-policy evidence. Status and digests come from isolated verification.</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="flex items-center gap-2 text-sm font-bold text-slate-800"><FileText size={16} /> Agent Self-Reports are advisory</h2>
            <p className="mt-1 text-xs text-slate-500">Narrative reports remain separate and never satisfy independent acceptance gates.</p>
          </div>
        </section>

        {error && (
          <div role="alert" className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-700">
            <AlertTriangle size={16} /> {error}
          </div>
        )}

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(380px,0.85fr)]">
          <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm" aria-labelledby="run-history-heading">
            <div className="border-b border-slate-200 px-4 py-3">
              <h2 id="run-history-heading" className="text-sm font-bold text-slate-900">Verification runs</h2>
            </div>
            {!runsMatchProject || loadingRuns ? (
              <div className="flex items-center justify-center gap-2 p-10 text-sm text-slate-500"><Loader2 className="animate-spin" size={17} /> Loading evidence…</div>
            ) : visibleRuns.length === 0 ? (
              <div className="p-10 text-center text-sm text-slate-500">No verification evidence recorded.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-500">
                    <tr><th className="px-4 py-2 font-semibold">Evidence ID</th><th className="px-4 py-2 font-semibold">Contract</th><th className="px-4 py-2 font-semibold">Status</th><th className="px-4 py-2 font-semibold">Started</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {visibleRuns.map(run => (
                      <tr key={run.id} className={selectedRunId === run.id ? 'bg-indigo-50/60' : ''}>
                        <td className="px-4 py-3">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedRunProjectId(projectId);
                              setSelectedRunId(run.id);
                            }}
                            className="font-mono font-semibold text-indigo-700 hover:underline"
                            aria-label={`Inspect verification run ${run.id}`}
                          >
                            {run.id}
                          </button>
                        </td>
                        <td className="px-4 py-3 font-mono text-slate-600">{run.contract_id}</td>
                        <td className="px-4 py-3"><StatusBadge status={run.status} /></td>
                        <td className="px-4 py-3 text-slate-600">{formatTimestamp(run.started_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {runsMatchProject && nextCursor && (
              <div className="border-t border-slate-200 p-3 text-center">
                <button
                  type="button"
                  onClick={loadMoreRuns}
                  disabled={loadingMore}
                  className="rounded-md border border-indigo-200 px-3 py-1.5 text-xs font-bold text-indigo-700 hover:bg-indigo-50 disabled:cursor-wait disabled:opacity-60"
                >
                  {loadingMore ? 'Loading older runs…' : 'Load older runs'}
                </button>
              </div>
            )}
          </section>

          <section className="min-h-80 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm" aria-labelledby="check-heading">
            <div className="border-b border-slate-200 px-4 py-3">
              <h2 id="check-heading" className="text-sm font-bold text-slate-900">Independent checks</h2>
            </div>
            {!detailMatchesProject || loadingDetail ? (
              <div className="flex items-center justify-center gap-2 p-10 text-sm text-slate-500"><Loader2 className="animate-spin" size={17} /> Loading checks…</div>
            ) : checks.length === 0 ? (
              <div className="p-10 text-center text-sm text-slate-500">Select a run to inspect check evidence.</div>
            ) : (
              <div className="divide-y divide-slate-100">
                {checks.map(check => (
                  <button key={check.id} type="button" onClick={() => loadLog(check)} aria-label={`${check.gate_name} evidence ${check.id}`} className={`flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-slate-50 ${selectedCheckId === check.id ? 'bg-indigo-50' : ''}`}>
                    <span className="min-w-0"><span className="block truncate text-sm font-semibold text-slate-800">{check.gate_name}</span><span className="block truncate font-mono text-[11px] text-slate-500">{check.id}</span></span>
                    <StatusBadge status={check.status} />
                  </button>
                ))}
              </div>
            )}
          </section>
        </div>

        {detailMatchesProject && (loadingLog || log) && (
          <section className="overflow-hidden rounded-xl border border-slate-800 bg-slate-950 shadow-sm" aria-label="Redacted evidence log">
            <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3 text-slate-200">
              <span className="text-sm font-bold">Redacted console evidence</span>
              {log?.id && <span className="font-mono text-xs text-slate-400">{log.id}</span>}
            </div>
            {loadingLog ? (
              <div className="p-5 text-sm text-slate-400">Loading redacted log…</div>
            ) : (
              <div className="grid gap-px bg-slate-800 md:grid-cols-2">
                <div className="bg-slate-950 p-4"><h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-400">stdout</h3><pre className="evidence-log whitespace-pre-wrap break-words text-xs text-emerald-300">{log?.stdout || '—'}</pre></div>
                <div className="bg-slate-950 p-4"><h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-400">stderr</h3><pre className="evidence-log whitespace-pre-wrap break-words text-xs text-amber-300">{log?.stderr || '—'}</pre></div>
              </div>
            )}
          </section>
        )}
      </div>
    </main>
  );
}
