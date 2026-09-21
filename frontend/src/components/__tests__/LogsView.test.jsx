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
