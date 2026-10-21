import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import App from '../../App';
import { api } from '../../services/api';

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  vi.spyOn(api, 'getSession').mockResolvedValue({ user: { username: 'admin' } });
  vi.spyOn(api, 'getProjects').mockResolvedValue([]);
  vi.stubGlobal('WebSocket', class {
    static OPEN = 1;
    readyState = 1;
    send() {}
    close() {}
  });
});

afterEach(() => vi.unstubAllGlobals());

async function openDialog() {
  render(<App />);
  fireEvent.click(await screen.findByTitle('Yeni Proje Başlat'));
  return screen.findByRole('dialog', { name: 'Yeni Proje Başlat' });
}

test('opens an accessible title form and cancels without creating a project', async () => {
  const create = vi.spyOn(api, 'createProject');
  await openDialog();
  expect(screen.getByRole('textbox', { name: 'Proje başlığı' })).toHaveFocus();
  fireEvent.click(screen.getByRole('button', { name: 'İptal' }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(create).not.toHaveBeenCalled();
});

test('blank titles cannot be submitted', async () => {
  const create = vi.spyOn(api, 'createProject');
  const dialog = await openDialog();
  fireEvent.change(screen.getByRole('textbox', { name: 'Proje başlığı' }), { target: { value: '   ' } });
  expect(screen.getByRole('button', { name: 'Proje Oluştur' })).toBeDisabled();
  fireEvent.submit(dialog.querySelector('form'));
  expect(create).not.toHaveBeenCalled();
});

test('submits a trimmed title once while pending and closes after success', async () => {
  let resolve;
  const create = vi.spyOn(api, 'createProject').mockReturnValue(new Promise(done => { resolve = done; }));
  const dialog = await openDialog();
  fireEvent.change(screen.getByRole('textbox', { name: 'Proje başlığı' }), { target: { value: '  Hotel Portal  ' } });
  fireEvent.submit(dialog.querySelector('form'));
  fireEvent.submit(dialog.querySelector('form'));
  expect(create).toHaveBeenCalledExactlyOnceWith('Hotel Portal');
  expect(screen.getByRole('button', { name: 'Oluşturuluyor…' })).toBeDisabled();
  vi.spyOn(api, 'getProject').mockResolvedValue({ id: 'hotel', title: 'Hotel Portal', status: 'planning', chatHistory: [] });
  vi.spyOn(api, 'getProjectLogs').mockResolvedValue([]);
  await act(async () => resolve({ id: 'hotel' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
});

test('creation errors keep the entered title available for retry', async () => {
  const create = vi.spyOn(api, 'createProject').mockRejectedValueOnce(new Error('Sunucu kullanılamıyor'));
  await openDialog();
  const title = screen.getByRole('textbox', { name: 'Proje başlığı' });
  fireEvent.change(title, { target: { value: 'Hotel Portal' } });
  fireEvent.click(screen.getByRole('button', { name: 'Proje Oluştur' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Sunucu kullanılamıyor');
  expect(title).toHaveValue('Hotel Portal');
  expect(screen.getByRole('button', { name: 'Proje Oluştur' })).toBeEnabled();
  expect(create).toHaveBeenCalledTimes(1);
});
