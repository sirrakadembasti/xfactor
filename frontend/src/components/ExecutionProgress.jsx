import { useEffect, useState } from 'react';

const phaseNames = {
  dependency_lockfile: 'Kilit dosyası hazırlığı', dependency_install: 'Bağımlılık kurulumu',
  prisma_validate: 'Prisma şema denetimi', prisma_generate: 'Prisma istemci üretimi',
  database_push: 'Veritabanı hazırlığı', database_seed: 'Demo verisi hazırlığı',
  typecheck: 'TypeScript denetimi', framework_build: 'Uygulama derlemesi',
  test_setup: 'Test hazırlığı', test_execution: 'Test komutu', service_start: 'Servis başlatma',
  service_preview: 'Arayüz başlatma', browser_journey: 'Tarayıcı yolculuğu',
  inventory: 'Kaynak envanteri', http_request: 'HTTP denetimi',
  node_command: 'Node komutu', npm_command: 'npm komutu', npx_command: 'npx komutu'
};

export default function ExecutionProgress({ projectId, apiClient }) {
  const [snapshot, setSnapshot] = useState(null);
  useEffect(() => {
    if (typeof apiClient.getExecutionProgress !== 'function') return undefined;
    const controller = new AbortController();
    let disposed = false;
    let pending = false;
    setSnapshot({ projectId, loading: true, data: null, error: false });
    const refresh = async () => {
      if (disposed || pending) return;
      pending = true;
      try {
        const data = await apiClient.getExecutionProgress(projectId, { signal: controller.signal });
        if (data?.projectId !== projectId) throw new Error('Progress project mismatch');
        if (!disposed) setSnapshot({ projectId, loading: false, data, error: false });
      } catch (error) {
        if (!disposed && error?.name !== 'AbortError') setSnapshot({ projectId, loading: false, data: null, error: true });
      } finally { pending = false; }
    };
    refresh();
    const interval = setInterval(refresh, 5000);
    return () => { disposed = true; clearInterval(interval); controller.abort(); };
  }, [apiClient, projectId]);
  if (typeof apiClient.getExecutionProgress !== 'function') return null;
  const current = snapshot?.projectId === projectId ? snapshot : { loading: true };
  const data = current.data;
  const commands = Array.isArray(data?.commands) ? data.commands : [];
  const attempt = data?.lastAttempt;
  const failedAttempt = attempt && ['failed', 'failed_timeout', 'failed_interrupted', 'rejected', 'stale_terminated'].includes(attempt.status);
  return (
    <section aria-label="Canlı Worker ilerlemesi" className="rounded-xl border border-sky-200 bg-sky-50 p-4">
      <h2 className="font-bold text-sm text-sky-950">Canlı Worker ilerlemesi</h2>
      <p className="mt-1 text-xs text-sky-900">Canlı ilerleme kabul kanıtı değildir. Nihai PASS/FAIL sonuçları ayrı doğrulama kayıtlarına yazılır.</p>
      {failedAttempt && !data.active && <div role="alert" className="mt-3 rounded border border-rose-200 bg-white p-3 text-sm text-rose-900">
        <p className="font-semibold">{attempt.stage === 'prepare_dependencies' ? 'Son bağımlılık hazırlığı başarısız' : 'Son yürütme başarısız'} · {new Date(attempt.endedAt || attempt.startedAt).toLocaleString()}</p>
        {attempt.error && <p className="mt-1">{attempt.error}</p>}
        {attempt.noVerificationRun && <p className="mt-1">Bu denemede yeni doğrulama koşusu oluşmadı. Aşağıdaki kayıtlar önceki kontrollere aittir.</p>}
      </div>}
      {current.loading ? <p className="mt-3 text-sm">Canlı ilerleme alınıyor…</p>
        : current.error ? <p role="status" className="mt-3 text-sm">Canlı ilerleme alınamadı. Kayıtlı kalite kanıtları ayrı yüklenir; bağlantı yeniden denenecek.</p>
          : !data?.active ? <p className="mt-3 text-sm">Etkin worker işlemi yok. Geçmiş sonuçları aşağıdan inceleyebilirsiniz.</p>
            : !data.available ? <p className="mt-3 text-sm">Çalışan işin worker komut bilgisi henüz gelmedi.</p>
              : <>
                <p className="mt-3 text-sm">{data.operation === 'prepare_dependencies' ? 'Bağımlılık hazırlığı' : 'Bağımsız doğrulama'} · Son gözlem: {new Date(data.observedAt).toLocaleTimeString()}</p>
                {data.stale && <p className="mt-1 text-xs text-amber-900">Bu ilerleme kaydı güncel olmayabilir; yeni gözlem bekleniyor.</p>}
                <ol className="mt-3 max-h-64 overflow-y-auto space-y-1 text-xs">
                  {commands.map(command => <li key={command.commandId} className="flex justify-between gap-3 rounded bg-white px-3 py-2">
                    <span>{phaseNames[command.phase] || 'Worker komutu'} · {command.executable}</span>
                    <span>{command.endedAt == null ? 'Çalışıyor' : command.timedOut ? 'Zaman aşımı' : `Komut bitti · çıkış ${command.exitCode ?? 'bilinmiyor'}`}</span>
                  </li>)}
                </ol>
                {commands.length === 0 && <p className="mt-2 text-xs">Worker komut başlatma bilgisi bekleniyor.</p>}
              </>}
    </section>
  );
}
