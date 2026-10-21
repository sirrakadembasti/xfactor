import { useEffect, useRef, useState } from 'react';

export default function CreateProjectDialog({ onCreate, onClose }) {
  const [title, setTitle] = useState('Yeni Otonom Proje');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pending = useRef(false);
  const mounted = useRef(false);
  const input = useRef(null);
  const dialog = useRef(null);

  useEffect(() => {
    mounted.current = true;
    const trigger = document.activeElement;
    input.current?.focus();
    input.current?.select();
    return () => {
      mounted.current = false;
      if (trigger?.isConnected) trigger.focus();
    };
  }, []);

  const submit = async event => {
    event.preventDefault();
    if (pending.current || !title.trim()) return;
    pending.current = true;
    setBusy(true);
    setError('');
    try {
      await onCreate(title.trim());
      if (mounted.current) onClose();
    } catch (failure) {
      if (mounted.current) setError('Proje oluşturulamadı: ' + failure.message);
    } finally {
      pending.current = false;
      if (mounted.current) setBusy(false);
    }
  };

  const handleKeyDown = event => {
    if (event.key === 'Escape') {
      event.preventDefault();
      if (!pending.current) onClose();
    }
    if (event.key === 'Tab') {
      const controls = [...dialog.current.querySelectorAll('input:not(:disabled), button:not(:disabled)')];
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/40 p-4">
      <div ref={dialog} role="dialog" aria-modal="true" aria-labelledby="create-project-heading"
        onKeyDown={handleKeyDown} className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
        <h2 id="create-project-heading" className="text-lg font-bold text-stone-900">Yeni Proje Başlat</h2>
        <form onSubmit={submit} className="mt-4 space-y-4" aria-busy={busy}>
          <div>
            <label htmlFor="create-project-title" className="block text-sm font-semibold text-stone-700">Proje başlığı</label>
            <input ref={input} id="create-project-title" value={title}
              onChange={event => setTitle(event.target.value)} readOnly={busy} required
              aria-describedby={error ? 'create-project-error' : undefined}
              className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
          {error && <p id="create-project-error" role="alert" className="text-sm text-red-700">{error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} disabled={busy}
              className="rounded-lg border border-stone-300 px-4 py-2 text-sm font-semibold disabled:opacity-50">İptal</button>
            <button type="submit" disabled={busy || !title.trim()}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">
              {busy ? 'Oluşturuluyor…' : 'Proje Oluştur'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
