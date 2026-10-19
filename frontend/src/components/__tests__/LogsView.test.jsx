import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import LogsView from '../LogsView';

test('LogsView offers Resume for verification_failed projects', () => {
  const handleResume = vi.fn();
  render(
    <LogsView
      logs={[]}
      projectState={{ status: 'verification_failed' }}
      handleResume={handleResume}
      wsReady={false}
      getActionBadge={() => null}
    />
  );

  fireEvent.click(screen.getByRole('button', { name: /Süreci Devam Ettir/ }));
  expect(handleResume).toHaveBeenCalledTimes(1);
});

test('monitor defaults to one latest row per task and preserves raw history on demand', () => {
  render(<LogsView logs={[
    { id: 1, node_id: 'schema', agent: 'Coder', action: 'write', message: 'ilk yazma' },
    { id: 2, node_id: 'schema', agent: 'Coder', action: 'finish', message: 'tamamlandı' },
    { id: 3, node_id: 'schema', agent: 'Teamleader', action: 'delegate', message: 'yeniden devir' },
  ]} projectState={{ status: 'implementing' }} />);
  expect(screen.queryByText('ilk yazma')).not.toBeInTheDocument();
  expect(screen.getByText(/Yeniden çalıştırılıyor/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Yüklenen kayıt geçmişi' }));
  expect(screen.getByText('ilk yazma')).toBeInTheDocument();
  expect(screen.getByText('tamamlandı')).toBeInTheDocument();
});

test('switching to another project resets the log view and search without leaking previous context', () => {
  const { rerender } = render(<LogsView logs={[]} projectState={{ id: 'first' }} />);
  fireEvent.click(screen.getByRole('button', { name: 'Yüklenen kayıt geçmişi' }));
  fireEvent.change(screen.getByPlaceholderText('Loglarda ara...'), { target: { value: 'old query' } });
  rerender(<LogsView logs={[]} projectState={{ id: 'second' }} />);
  expect(screen.getByRole('button', { name: 'İşlerin son durumu' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByPlaceholderText('Loglarda ara...')).toHaveValue('');
});
