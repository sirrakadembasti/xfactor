import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, FileText, History, Loader2, SearchCheck, ShieldCheck } from 'lucide-react';
import { api } from '../services/api';

const statusClasses = {
  verified: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  PASS: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  failed: 'bg-rose-50 text-rose-700 border-rose-200',
  FAIL: 'bg-rose-50 text-rose-700 border-rose-200',
  blocked: 'bg-amber-50 text-amber-700 border-amber-200',
  BLOCKED: 'bg-amber-50 text-amber-700 border-amber-200',
  NOT_APPLICABLE: 'bg-slate-50 text-slate-600 border-slate-200',
  running: 'bg-blue-50 text-blue-700 border-blue-200',
  queued: 'bg-slate-50 text-slate-600 border-slate-200'
};

const statusLabels = {
  verified: 'Doğrulandı',
  PASS: 'GEÇTİ',
  failed: 'Başarısız',
  FAIL: 'KALDI',
  blocked: 'Bloke',
  BLOCKED: 'BLOKE',
  NOT_APPLICABLE: 'Uygulanmıyor',
  running: 'Sürüyor',
  queued: 'Sırada'
};

const gateDescriptions = {
  package_json: ['Paket tanımı', 'Uygulamanın bağımlılık ve komut tanımlarını denetler.'],
  lockfile: ['Kilit dosyası', 'Kurulacak paket sürümlerinin sabitlenip sabitlenmediğini denetler.'],
  ast_import_inventory: ['İçe aktarımlar', 'Kodun kullandığı paketlerle bağımlılık listesini karşılaştırır.'],
  clean_install: ['Temiz kurulum', 'Bağımlılıkların sıfırdan kurulabildiğini sınar.'],
  typecheck: ['Tip denetimi', 'TypeScript tür hatalarını arar.'],
  framework_build: ['Uygulama derlemesi', 'Üretim derlemesinin tamamlanıp tamamlanmadığını sınar.'],
  requirement_traceability: ['Gereksinim izleri', 'Zorunlu gereksinimlerin makine kanıtına bağlanmasını denetler.'],
  service_manifest: ['Servis tanımı', 'Başlatma komutu, port ve servis bildirimini denetler.'],
  database_verification: ['Veritabanı', 'Şema, bağlantı ve veri yazma işlemlerini sınar.'],
  api_contract: ['API uç noktaları', 'API yanıtları ve veri işlemleri beklenen sözleşmeye uyuyor mu, sınar.'],
  browser_journey: ['Tarayıcı akışı', 'Sayfa açılışını ve tanımlı kullanıcı adımlarını sınar.'],
  smoke_gate: ['Canlı servis', 'Uygulamanın başlatılıp sağlık yanıtı verdiğini sınar.'],
  test_infrastructure: ['Uygulama testleri', 'Test komutunun varlığını ve çalışmasını denetler.'],
  domain_entity_check: ['Alan ve veri modeli', 'İstenen iş alanının ve varlıkların karşılanmasını denetler.'],
  placeholder_check: ['Eksik kod taraması', 'Boş veya geçici kod parçalarını arar.'],
  contamination_check: ['İçerik temizliği', 'Başka projelerden taşınmış içerikleri arar.'],
  security_baseline: ['Güvenlik temeli', 'Temel güvenlik kurallarının uygulanmasını denetler.'],
  readme_check: ['Kurulum rehberi', 'README komutlarının uygulama ayarlarıyla uyumunu denetler.'],
  management_runtime_contract: ['Yönetim çalışma sözleşmesi', 'Yönetim API ve ekran adreslerinin doğrulama için tanımlı olmasını denetler.'],
  management_demo_seed: ['Demo rol hesapları', 'Her rol için ayrı test hesabının izole ortamda hazırlandığını denetler.'],
  management_role_login: ['Rol girişleri', 'Her demo rolünün gerçek giriş akışıyla oturum açabildiğini denetler.'],
  api_anonymous_mutation_denied: ['Oturumsuz yazma reddi', 'Giriş yapmayan kullanıcının yönetim kaydını değiştirememesini sınar.'],
  api_anonymous_read_policy: ['Oturumsuz okuma kuralı', 'Anonim okumanın onaylı erişim kuralına uyduğunu sınar.'],
  api_delete_related_retention: ['İlişkili kayıt saklama kuralı', 'Silme sonrasında ilişkili kayıtların onaylı saklama davranışını sınar.'],
  api_unverified_mutation_operation: ['Eksik CRUD doğrulaması', 'Onaylı yönetim işlemlerinden kanıtı eksik olanları gösterir.'],
  database_mutation_assertion: ['Veri kalıcılığı', 'API ile yapılan değişikliğin sonraki okumada gerçekten görüldüğünü sınar.'],
  browser_management_interaction: ['Yönetim paneli etkileşimleri', 'Rol bazlı tıklama, form, görünür sonuç ve erişilebilirlik yolculuklarını sınar.']
};

function gateDetails(gateName) {
  const roleOperation = /^api_role_(create|read|update|delete)_(allowed|denied)$/.exec(gateName || '');
  if (roleOperation) {
    const action = { create: 'oluşturma', read: 'okuma', update: 'güncelleme', delete: 'silme' }[roleOperation[1]];
    return roleOperation[2] === 'allowed'
      ? [`Rol bazlı ${action} izni`, `Yetkili rolün ${action} işlemini yapıp sonucunu görebildiğini sınar.`]
      : [`Rol bazlı ${action} reddi`, `Yetkisiz rolün ${action} işlemi yapamadığını ve verinin değişmediğini sınar.`];
  }
  return gateDescriptions[gateName] || [gateName, 'Bu kontrolün teknik adı ve makine sonucu aşağıda gösterilir.'];
}

function StatusBadge({ status }) {
  return (
    <span className={`inline-flex rounded border px-2 py-0.5 text-[11px] font-bold ${statusClasses[status] || 'border-slate-200 bg-slate-50 text-slate-600'}`}>
      {statusLabels[status] || status}
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
        if (requestError?.name !== 'AbortError') setError('Kalite geçmişi yüklenemedi.');
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
          setError('Doğrulama kanıtı yüklenemedi.');
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
      if (runsRequestRef.current === requestId) setError('Daha eski kalite geçmişi yüklenemedi.');
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
      if (logRequestRef.current === requestId) setError('Kanıt logu yüklenemedi.');
    } finally {
      if (logRequestRef.current === requestId) setLoadingLog(false);
    }
  };

  const runsMatchProject = runsProjectId === projectId;
  const detailMatchesProject = selectedRunProjectId === projectId;
  const visibleRuns = runsMatchProject ? runs : [];
  const checks = detailMatchesProject && Array.isArray(runDetail?.checks) ? runDetail.checks : [];
  const selectedCheck = checks.find(check => check.id === selectedCheckId);
  const passedCount = checks.filter(check => check.status === 'PASS').length;
  const failedCount = checks.filter(check => check.status === 'FAIL').length;
  const blockedCount = checks.filter(check => check.status === 'BLOCKED').length;
  const localExecution = checks.some(check => check.executionProfile === 'local-trusted' && check.osIsolation === false);

  return (
    <main className="flex-1 overflow-y-auto bg-stone-50 p-4 sm:p-6" aria-label="Kalite geçmişi paneli">
      <div className="mx-auto max-w-7xl space-y-5">
        <header className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-950 via-indigo-900 to-slate-800 p-6 text-white shadow-sm">
          <div>
            <div className="mb-2 flex items-center gap-2 text-indigo-200">
              <History size={20} />
              <span className="text-xs font-bold uppercase tracking-wider">Kalite Geçmişi</span>
            </div>
            <h1 className="text-2xl font-bold">{projectTitle || 'Proje'} Kalite Paneli</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-indigo-100">Üretilen uygulamanın kurulumu, derlemesi, çalışması ve güvenliği için yapılan gerçek kontrolleri burada izleyebilirsiniz. Her koşu ayrı kaydedilir; bir kontrolü seçerek sonucunun makine kanıtını görebilirsiniz.</p>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/30 bg-white/10 px-3 py-1 text-xs font-bold text-white">
            <ShieldCheck size={14} /> Salt-Okunur
          </span>
        </header>

        <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm" aria-labelledby="panel-purpose-heading">
          <h2 id="panel-purpose-heading" className="text-base font-bold text-slate-900">Bu panel neyi gösterir?</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">Önce soldan bir doğrulama koşusu seçin. Sağdaki kontrollerde hangi adımın geçtiğini veya neden durduğunu görün. Kontrole tıklayınca zaman, çıkış kodu, çıktı özeti ve gizli bilgiler temizlenmiş kayıtlar açılır.</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3"><span className="text-xs font-bold text-emerald-800">PASS</span><p className="mt-1 text-xs text-emerald-900">PASS: kontrol başarıyla tamamlandı ve kanıtı kaydedildi.</p></div>
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-3"><span className="text-xs font-bold text-rose-800">FAIL</span><p className="mt-1 text-xs text-rose-900">FAIL: çalıştırılan kontrol hata buldu; teslim tamamlanmaz.</p></div>
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3"><span className="text-xs font-bold text-amber-800">BLOCKED</span><p className="mt-1 text-xs text-amber-900">BLOCKED: zorunlu kontrol için yeterli yürütme kanıtı yok.</p></div>
          </div>
          <p className="mt-3 text-xs text-slate-500">İsteğe bağlı bir kontrol uygulanmıyorsa “Uygulanmıyor” görünür. Zorunlu kontroller atlanarak proje doğrulanmış sayılamaz.</p>
        </section>

        <section className="grid gap-3 md:grid-cols-2" aria-label="Kanıt otoritesi">
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
            <h2 className="flex items-center gap-2 text-sm font-bold text-emerald-900"><ShieldCheck size={16} /> Bağımsız Worker Kanıtı</h2>
            <p className="mt-1 text-xs text-emerald-800">Yetkili kalite politikası kanıtı. Durum ve özetler gerçek doğrulama kontrollerinden üretilir.</p>
            {localExecution && <p className="mt-2 text-xs font-semibold text-amber-900">Yerel worker · local-trusted · OS izolasyonu yok. Üretilen kod bu bilgisayardaki kullanıcının yetkileriyle çalışır.</p>}
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="flex items-center gap-2 text-sm font-bold text-slate-800"><FileText size={16} /> Ajan Öz-Raporları Tavsiye Niteliğindedir</h2>
            <p className="mt-1 text-xs text-slate-500">Anlatı raporları ayrı tutulur ve bağımsız kabul kapılarını tek başına karşılayamaz.</p>
          </div>
        </section>

        {detailMatchesProject && runDetail?.run && (
          <section className="rounded-xl border border-indigo-100 bg-indigo-50 p-4" aria-label="Seçili koşu özeti">
            <div className="flex flex-wrap items-center gap-3">
              <SearchCheck size={19} className="text-indigo-700" />
              <h2 className="text-sm font-bold text-slate-900">Seçili koşunun sonucu</h2>
              <StatusBadge status={runDetail.run.status} />
            </div>
            <p className="mt-2 text-sm text-slate-700">{passedCount} kontrol geçti · {failedCount} kontrol başarısız · {blockedCount} kontrol engellendi</p>
            <p className="mt-1 text-xs text-slate-600">Başlangıç: {formatTimestamp(runDetail.run.started_at)} · Bitiş: {formatTimestamp(runDetail.run.ended_at)} · Politika: {runDetail.run.policy_version || '—'}</p>
          </section>
        )}

        {error && (
          <div role="alert" className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-700">
            <AlertTriangle size={16} /> {error}
          </div>
        )}

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(380px,0.85fr)]">
          <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm" aria-labelledby="run-history-heading">
            <div className="border-b border-slate-200 px-4 py-3">
              <h2 id="run-history-heading" className="text-sm font-bold text-slate-900">1. Doğrulama Koşuları</h2>
              <p className="mt-1 text-xs text-slate-500">Her koşu, uygulama için yapılmış ayrı bir doğrulama denemesidir. En yenisi üsttedir.</p>
            </div>
            {!runsMatchProject || loadingRuns ? (
              <div className="flex items-center justify-center gap-2 p-10 text-sm text-slate-500"><Loader2 className="animate-spin" size={17} /> Kanıtlar yükleniyor…</div>
            ) : visibleRuns.length === 0 ? (
              <div className="p-10 text-center text-sm text-slate-500">Kayıtlı doğrulama kanıtı bulunamadı.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-500">
                    <tr><th className="px-4 py-2 font-semibold">Kanıt ID</th><th className="px-4 py-2 font-semibold">Sözleşme</th><th className="px-4 py-2 font-semibold">Durum</th><th className="px-4 py-2 font-semibold">Başlangıç</th></tr>
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
                            aria-label={`${run.id} doğrulama koşusunu incele`}
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
                  {loadingMore ? 'Daha eski koşular yükleniyor…' : 'Daha Eski Koşuları Yükle'}
                </button>
              </div>
            )}
          </section>

          <section className="min-h-80 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm" aria-labelledby="check-heading">
            <div className="border-b border-slate-200 px-4 py-3">
              <h2 id="check-heading" className="text-sm font-bold text-slate-900">2. Yapılan Kontroller</h2>
              <p className="mt-1 text-xs text-slate-500">Bir satır seçerek neyin denetlendiğini ve kayıtlı kanıtı inceleyin.</p>
            </div>
            {!detailMatchesProject || loadingDetail ? (
              <div className="flex items-center justify-center gap-2 p-10 text-sm text-slate-500"><Loader2 className="animate-spin" size={17} /> Kontroller yükleniyor…</div>
            ) : checks.length === 0 ? (
              <div className="p-10 text-center text-sm text-slate-500">Kontrol kanıtlarını incelemek için bir koşu seçin.</div>
            ) : (
              <div className="divide-y divide-slate-100">
                {checks.map(check => (
                  <button key={check.id} type="button" onClick={() => loadLog(check)} aria-label={`${check.gate_name} kanıtı ${check.id}`} className={`flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-slate-50 ${selectedCheckId === check.id ? 'bg-indigo-50' : ''}`}>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-slate-800">{gateDetails(check.gate_name)[0]}</span>
                      <span className="block text-xs leading-5 text-slate-600">{gateDetails(check.gate_name)[1]}</span>
                      <span className="flex flex-wrap gap-1 font-mono text-[11px] text-slate-500"><span>{check.gate_name}</span><span>· {check.id}</span></span>
                    </span>
                    <StatusBadge status={check.status} />
                  </button>
                ))}
              </div>
            )}
          </section>
        </div>

        {detailMatchesProject && selectedCheck && (
          <section className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm" aria-label="Seçili kontrolün makine kanıtı">
            <div className="flex flex-wrap items-center gap-3">
              <CheckCircle2 size={18} className="text-indigo-700" />
              <h2 className="text-sm font-bold text-slate-900">3. {gateDetails(selectedCheck.gate_name)[0]} kanıtı</h2>
              <StatusBadge status={selectedCheck.status} />
            </div>
            <p className="mt-2 text-sm text-slate-600">{gateDetails(selectedCheck.gate_name)[1]}</p>
            <dl className="mt-4 grid gap-3 text-xs sm:grid-cols-2 lg:grid-cols-4">
              <div><dt className="font-semibold text-slate-500">Zorunluluk</dt><dd className="mt-1 text-slate-800">{selectedCheck.applicability === 'MANDATORY' ? 'Zorunlu' : 'İsteğe bağlı'}</dd></div>
              <div><dt className="font-semibold text-slate-500">Çıkış kodu</dt><dd className="mt-1 text-slate-800">{selectedCheck.exit_code ?? 'Kaydedilmedi'}</dd></div>
              <div><dt className="font-semibold text-slate-500">Başlangıç</dt><dd className="mt-1 text-slate-800">{formatTimestamp(selectedCheck.started_at)}</dd></div>
              <div><dt className="font-semibold text-slate-500">Bitiş</dt><dd className="mt-1 text-slate-800">{formatTimestamp(selectedCheck.ended_at)}</dd></div>
              <div className="sm:col-span-2"><dt className="font-semibold text-slate-500">Standart çıktı SHA-256 özeti</dt><dd className="mt-1 break-all font-mono text-slate-700">{selectedCheck.stdout_digest || 'Kaydedilmedi'}</dd></div>
              <div className="sm:col-span-2"><dt className="font-semibold text-slate-500">Hata çıktısı SHA-256 özeti</dt><dd className="mt-1 break-all font-mono text-slate-700">{selectedCheck.stderr_digest || 'Kaydedilmedi'}</dd></div>
            </dl>
            {selectedCheck.timed_out && <p className="mt-3 text-xs font-semibold text-amber-800">Bu kontrol zaman sınırına takıldı.</p>}
          </section>
        )}

        {detailMatchesProject && (loadingLog || log) && (
          <section className="overflow-hidden rounded-xl border border-slate-800 bg-slate-950 shadow-sm" aria-label="Sansürlenmiş konsol kanıtı">
            <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3 text-slate-200">
              <span className="text-sm font-bold">4. Sansürlenmiş konsol kanıtı</span>
              {log?.id && <span className="font-mono text-xs text-slate-400">{log.id}</span>}
            </div>
            {loadingLog ? (
              <div className="p-5 text-sm text-slate-400">Sansürlenmiş log yükleniyor…</div>
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
