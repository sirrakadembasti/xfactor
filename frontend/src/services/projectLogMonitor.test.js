import { describe, expect, it } from 'vitest';
import { buildProjectLogMonitor } from '../utils/projectLogMonitor';

const event = (id, node, action, extra = {}) => ({ id, node_id: node, action,
  agent: 'Coder', message: `event-${id}`, created_at: `2026-10-19T06:00:${String(id).padStart(2, '0')}Z`, ...extra });

describe('continuous project log monitor', () => {
  it('keeps completed work visible when a new attempt starts without replaying every event', () => {
    const logs = [event(1, 'backend.schema', 'write', { attempt_id: 'first' }),
      event(2, 'backend.schema', 'finish', { attempt_id: 'first' }),
      event(3, 'manager', 'start', { agent: 'Manager', attempt_id: 'second' }),
      event(4, 'backend.api', 'delegate', { agent: 'Teamleader', attempt_id: 'second' })];
    const result = buildProjectLogMonitor(logs);
    expect(result.rows.filter(row => row.node_id === 'backend.schema')).toHaveLength(1);
    expect(result.rows.find(row => row.node_id === 'backend.schema').monitorStatus).toBe('completed');
    expect(result.currentLogs.map(log => log.id)).toEqual([4, 3]);
    expect(result.history).toHaveLength(4);
  });

  it('exposes genuine repeated execution instead of hiding it as a reused completion', () => {
    const result = buildProjectLogMonitor([event(1, 'schema', 'finish', { attempt_id: 'first' }),
      event(2, 'schema', 'delegate', { agent: 'Teamleader', attempt_id: 'second' })]);
    expect(result.rows[0].monitorStatus).toBe('running');
    expect(result.rows[0].reexecuting).toBe(true);
    expect(result.rows[0].lastCompletedAt).toBe('2026-10-19T06:00:01Z');
    expect(result.history).toHaveLength(2);
  });

  it('keeps a task failure visible and distinguishes user pause from failure', () => {
    const result = buildProjectLogMonitor([event(1, 'backend.schema', 'delegate'),
      event(2, 'llm-coder', 'failed', { agent: 'LLM', message: 'task=schema; error=NETWORK' }),
      event(3, 'backend.api', 'failed', { message: 'error=PAUSED' })]);
    expect(result.rows.find(row => row.node_id === 'backend.schema').monitorStatus).toBe('failed');
    expect(result.rows.find(row => row.node_id === 'backend.api').monitorStatus).toBe('paused');
  });

  it('handles historical records without attempt IDs and keeps distinct tasks separate', () => {
    const logs = Object.freeze([event(1, 'one', 'finish'),
      event(2, 'manager', 'start', { agent: 'Manager' }), event(3, 'two', 'write')]);
    const result = buildProjectLogMonitor(logs);
    expect(result.rows.map(row => row.monitorKey)).toEqual(expect.arrayContaining(['node:one', 'node:two']));
    expect(result.currentLogs.map(log => log.id)).toEqual([3, 2]);
    expect(logs[0].id).toBe(1);
  });

  it('does not switch the current attempt back when a cancelled older attempt reports late', () => {
    const result = buildProjectLogMonitor([
      event(1, 'manager', 'start', { agent: 'Manager', attempt_id: 'old' }),
      event(2, 'manager', 'start', { agent: 'Manager', attempt_id: 'new' }),
      event(3, 'old-task', 'failed', { attempt_id: 'old', message: 'error=PAUSED' }),
    ]);
    expect(result.currentLogs.map(log => log.id)).toEqual([2]);
    expect(result.history).toHaveLength(3);
  });

  it('places the most recently updated job first without merging unrelated tasks', () => {
    const result = buildProjectLogMonitor([event(1, 'one', 'write'), event(2, 'two', 'write'), event(3, 'one', 'finish')]);
    expect(result.rows.map(row => row.node_id)).toEqual(['one', 'two']);
  });

  it('does not let a late cancellation overwrite the same job in a newer attempt', () => {
    const result = buildProjectLogMonitor([
      event(1, 'manager', 'start', { agent: 'Manager', attempt_id: 'old' }),
      event(2, 'schema', 'finish', { attempt_id: 'old' }),
      event(3, 'manager', 'start', { agent: 'Manager', attempt_id: 'new' }),
      event(4, 'schema', 'delegate', { agent: 'Teamleader', attempt_id: 'new' }),
      event(5, 'schema', 'failed', { attempt_id: 'old', message: 'error=PAUSED' }),
    ]);
    const row = result.rows.find(value => value.node_id === 'schema');
    expect(row.id).toBe(4);
    expect(row.monitorStatus).toBe('running');
    expect(row.reexecuting).toBe(true);
    expect(result.history).toHaveLength(5);
  });
});
