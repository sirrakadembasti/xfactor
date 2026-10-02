import { describe, it, expect } from 'vitest';
import { mergeProjectLogs, MAX_LOGS } from '../utils/projectLogs';

describe('project log reconciliation', () => {
  const event = { created_at: '2026-10-01T12:00:00Z', node_id: 'task', action: 'done', message: 'ok' };
  it('replaces a WebSocket event with its persisted HTTP record', () => {
    const transient = { ...event };
    const persisted = { ...event, id: 42 };
    expect(mergeProjectLogs([transient], [persisted])).toEqual([persisted]);
    expect(mergeProjectLogs([persisted], [transient])).toEqual([persisted]);
  });
  it('deduplicates IDs and retains the newly received record', () => {
    const updated = { ...event, id: 42, message: 'updated' };
    expect(mergeProjectLogs([updated], [{ ...event, id: 42 }])).toEqual([updated]);
  });
  it('sorts by event time and uses ID for equal or missing times', () => {
    expect(mergeProjectLogs([{ ...event, id: 2 }, { ...event, id: 3 },
      { ...event, id: 1, created_at: '2026-10-01T13:00:00Z' }], []).map(log => log.id)).toEqual([1, 3, 2]);
    expect(mergeProjectLogs([{ id: 1 }, { id: 2 }], []).map(log => log.id)).toEqual([2, 1]);
  });
  it('limits reconciled results without modifying either input', () => {
    const incoming = Object.freeze(Array.from({ length: MAX_LOGS + 10 }, (_, id) => Object.freeze({ id })));
    const current = Object.freeze([{ id: 1 }]);
    const result = mergeProjectLogs(incoming, current);
    expect(result).toHaveLength(MAX_LOGS);
    expect(result[0].id).toBe(MAX_LOGS + 9);
    expect(incoming[0].id).toBe(0);
    expect(current).toEqual([{ id: 1 }]);
  });
});
