import { mergeProjectLogs } from './projectLogs';

export function logMonitorStatus(log) {
  const action = String(log.action || '').toLowerCase();
  if (/\berror=PAUSED\b|\bPAUSED\b/.test(log.message || '') || action === 'pause' || action === 'paused') return 'paused';
  if (['error', 'failed', 'veto', 'blocked'].includes(action)) return 'failed';
  if (['finish', 'completed', 'reused', 'skip', 'skipped'].includes(action)) return 'completed';
  return 'running';
}

// A read-only projection of loaded events, never an execution/checkpoint source.
export function buildProjectLogMonitor(logs = []) {
  const history = mergeProjectLogs(logs, []);
  const ordered = [...history].reverse();
  const nodeIds = [...new Set(ordered.filter(log => String(log.agent).toLowerCase() !== 'llm')
    .map(log => log.node_id).filter(Boolean))];
  const groups = new Map();
  const sessions = new Map();
  let session = 'legacy:initial';
  let latestSession = session;
  let hasStartBoundary = false;

  ordered.forEach((log, index) => {
    const action = String(log.action || '').toLowerCase();
    const agent = String(log.agent || '').toLowerCase();
    const startsRun = agent === 'manager' && ['start', 'resume'].includes(action);
    const eventSession = log.attempt_id ? `attempt:${log.attempt_id}`
      : startsRun ? `legacy:${log.id ?? log.created_at ?? index}` : session;
    if (startsRun || !hasStartBoundary) {
      session = eventSession;
      latestSession = eventSession;
    }
    if (startsRun) hasStartBoundary = true;
    if (!sessions.has(eventSession)) sessions.set(eventSession, []);
    sessions.get(eventSession).push(log);

    let node = log.node_id;
    if (agent === 'llm') {
      const task = /(?:^|[;\s])task=([^;\s]+)/.exec(log.message || '')?.[1]?.replace(/\.review\.\d+$/, '');
      const matches = task ? nodeIds.filter(id => id === task || id.endsWith(`.${task}`)) : [];
      // Ambiguous domain task names must remain separate to retain their errors.
      node = matches.length === 1 ? matches[0] : null;
      if (!node) node = `llm:${task || log.file || log.node_id || log.id || index}`;
    }
    const key = node ? `node:${node}` : `event:${log.id ?? index}`;
    const previous = groups.get(key);
    if (previous?.monitorSession === latestSession && eventSession !== latestSession) {
      groups.set(key, { ...previous, eventCount: previous.eventCount + 1 });
      return;
    }
    const status = logMonitorStatus(log);
    const lastCompletedAt = status === 'completed' ? (log.created_at || log.timestamp || 'Kayıtlı') : previous?.lastCompletedAt;
    groups.delete(key);
    groups.set(key, { ...log, node_id: node || log.node_id, monitorKey: key, monitorStatus: status,
      monitorSession: eventSession,
      lastCompletedAt, reexecuting: Boolean(lastCompletedAt && status === 'running'),
      eventCount: (previous?.eventCount || 0) + 1 });
  });

  return { history, rows: [...groups.values()].reverse(),
    currentLogs: [...(sessions.get(latestSession) || [])].reverse(), sessionCount: sessions.size };
}
