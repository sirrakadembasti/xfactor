import { useEffect, useMemo, useState } from 'react';
import { Terminal, Play, Search } from 'lucide-react';
import { canResumeProject } from '../utils/canResumeProject';
import { buildProjectLogMonitor, logMonitorStatus } from '../utils/projectLogMonitor';
import { MAX_LOGS } from '../utils/projectLogs';

const monitorLabels = { completed: 'Tamamlanma kaydı var', running: 'İşlem sürüyor',
  paused: 'Duraklatıldı', failed: 'Hata / veto' };

export default function LogsView({
  logs = [],
  projectState,
  handleResume,
  wsReady,
  getActionBadge
}) {
  const [filterAction, setFilterAction] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [view, setView] = useState('monitor');
  useEffect(() => {
    setView('monitor');
    setFilterAction('ALL');
    setSearchQuery('');
  }, [projectState?.id]);
  const monitor = useMemo(() => buildProjectLogMonitor(logs), [logs]);
  const visibleLogs = view === 'monitor' ? monitor.rows : view === 'current' ? monitor.currentLogs : monitor.history;

  const filteredLogs = visibleLogs.filter(log => {
    const matchesAction = filterAction === 'ERROR'
      ? logMonitorStatus(log) === 'failed'
      : filterAction === 'FINISH' && view === 'monitor'
        ? log.monitorStatus === 'completed' : (log.action || '').toUpperCase() === filterAction;
    if (filterAction !== 'ALL' && !matchesAction) {
      return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchMsg = (log.message || '').toLowerCase().includes(q);
      const matchAgent = (log.agent || '').toLowerCase().includes(q);
      const matchFile = (log.file || '').toLowerCase().includes(q);
      const matchNode = (log.node_id || '').toLowerCase().includes(q);
      return matchMsg || matchAgent || matchFile || matchNode;
    }
    return true;
  });

  return (
    <div className="flex-1 flex flex-col bg-white overflow-hidden h-full">
      {/* Üst Bar: Başlık, Arama, Filtreleme ve Durum */}
      <div className="bg-gray-900 px-6 py-3 text-xs font-semibold text-gray-200 flex flex-wrap justify-between items-center gap-3 shrink-0 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-sm font-bold text-white">
            <Terminal size={17} className="text-indigo-400" /> CANLI SÜREÇ İZLEME LOGLARI
          </div>
          <span className="bg-gray-800 text-indigo-300 px-2.5 py-0.5 rounded-full text-[11px] font-mono border border-gray-700">
            {filteredLogs.length} / {visibleLogs.length} {view === 'monitor' ? 'Son durum' : 'Kayıt'}
          </span>
        </div>

        {/* Filtre ve Arama Alanı */}
        <div className="flex items-center gap-2">
          {/* Arama Input */}
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Loglarda ara..."
              className="bg-gray-800 border border-gray-700 rounded-lg pl-8 pr-3 py-1 text-xs text-white focus:outline-none focus:border-indigo-500 placeholder-gray-400 w-44"
            />
          </div>

          {/* Action Filtre Seçici */}
          <select
            aria-label="Eylem filtresi"
            value={filterAction}
            onChange={e => setFilterAction(e.target.value)}
            className="bg-gray-800 border border-gray-700 text-white rounded-lg px-2.5 py-1 text-xs focus:outline-none focus:border-indigo-500 cursor-pointer"
          >
            <option value="ALL">Tüm Eylemler</option>
            <option value="ERROR">Sadece Hatalar (ERROR)</option>
            <option value="VETO">Sadece Vetolar (VETO)</option>
            <option value="FEEDBACK">İncelemeler (FEEDBACK)</option>
            <option value="WRITE">Yazma (WRITE)</option>
            <option value="FINISH">Tamamlananlar (FINISH)</option>
            <option value="DELEGATE">Devirler (DELEGATE)</option>
          </select>

          {/* Resume Butonu (Devam ettirilebilir durumlardaysa) */}
          {canResumeProject(projectState?.status, projectState?.last_error) && (
            <button
              onClick={handleResume}
              className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1 rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-sm transition cursor-pointer animate-pulse"
            >
              <Play size={12} /> Süreci Devam Ettir
            </button>
          )}

          <div className="flex items-center gap-1.5 ml-1 bg-gray-800 px-2.5 py-1 rounded-lg border border-gray-700">
            <span className={`w-2 h-2 rounded-full ${wsReady ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'}`}></span>
            <span className="text-[11px] text-gray-300">{wsReady ? 'Canlı Akış Aktif' : 'Bağlantı Yok'}</span>
          </div>
        </div>
      </div>

      <div className="border-b border-gray-200 bg-slate-50 px-6 py-3 shrink-0">
        <div role="group" aria-label="Süreç izleme görünümü" className="flex flex-wrap gap-2">
          {[['monitor', 'İşlerin son durumu'], ['current', 'Son çalışma kayıtları'], ['history', 'Yüklenen kayıt geçmişi']].map(([value, label]) => (
            <button key={value} type="button" aria-pressed={view === value} onClick={() => setView(value)}
              className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${view === value ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-100'}`}>
              {label}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-gray-600">
          {view === 'monitor' ? 'Her işin son kaydı gösterilir. Yeni bir çalışma başladığında önceki tamamlanma kayıtları korunur.'
            : view === 'current' ? 'Yalnız son çalışmanın olayları gösterilir. Önceki çalışmalar kayıt geçmişinde korunur.'
              : `Yüklenmiş en fazla ${MAX_LOGS} olay gösterilir; arama ve filtreler bu kayıtlar üzerinde çalışır.`}
        </p>
        <p className="mt-1 text-xs text-gray-500">Bu ekran izleme amaçlıdır; teslim uygunluğunu Kalite Paneli gösterir.</p>
      </div>

      {/* Tablo Alanı */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead className="bg-gray-800 text-gray-300 uppercase text-[11px] sticky top-0 z-10 shadow-sm">
            <tr>
              <th className="py-2.5 px-4 w-44 font-semibold border-b border-gray-700">Tarih & Saat (created_at)</th>
              <th className="py-2.5 px-4 w-32 font-semibold border-b border-gray-700">Ajan (agent)</th>
              <th className="py-2.5 px-3 w-28 font-semibold border-b border-gray-700">{view === 'monitor' ? 'Son durum' : 'Eylem (action)'}</th>
              <th className="py-2.5 px-4 w-52 font-semibold border-b border-gray-700">Hedef Dosya (file)</th>
              <th className="py-2.5 px-4 w-44 font-semibold border-b border-gray-700">Düğüm ID (node_id)</th>
              <th className="py-2.5 px-4 font-semibold border-b border-gray-700">İşlem Mesajı (message)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 font-mono">
            {filteredLogs.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-gray-400 p-12 text-center font-sans text-sm">
                  {logs.length === 0 ? 'Henüz kaydedilmiş bir süreç logu bulunmuyor.' : 'Arama kriterlerine uygun log bulunamadı.'}
                </td>
              </tr>
            ) : (
              filteredLogs.map((log, idx) => {
                const isError = logMonitorStatus(log) === 'failed';
                const isVeto = log.action === 'veto';
                const isFeedback = log.action === 'feedback';
                const rowBg = isError
                  ? 'bg-red-50/90 hover:bg-red-100/90 border-l-4 border-l-red-500'
                  : isVeto
                  ? 'bg-amber-50/90 hover:bg-amber-100/90 border-l-4 border-l-amber-500'
                  : isFeedback
                  ? 'bg-orange-50/60 hover:bg-orange-100/60'
                  : idx % 2 === 0
                  ? 'bg-white hover:bg-gray-50'
                  : 'bg-gray-50/50 hover:bg-gray-100/70';

                return (
                  <tr key={log.monitorKey || log.id || JSON.stringify([log.created_at, log.node_id, log.action, log.message])} className={`${rowBg} transition-colors`}>
                    <td className="py-2 px-4 whitespace-nowrap text-gray-500 text-[11px] align-top">
                      {log.timestamp || log.created_at || '—'}
                    </td>
                    <td className="py-2 px-4 font-semibold text-gray-800 align-top">
                      {log.agent || '—'}
                    </td>
                    <td className="py-2 px-3 align-top">
                      {view === 'monitor' ? (
                        <span className={`inline-block rounded px-2 py-1 font-sans font-semibold ${isError ? 'bg-red-100 text-red-800' : log.monitorStatus === 'completed' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700'}`}>
                          {projectState?.status === 'paused' && log.monitorStatus === 'running' ? 'Duraklatıldı' : log.reexecuting ? 'Yeniden çalıştırılıyor' : monitorLabels[log.monitorStatus]}
                        </span>
                      ) : getActionBadge?.(log.action) || String(log.action || '—').toUpperCase()}
                    </td>
                    <td className="py-2 px-4 text-gray-600 text-[11px] truncate max-w-xs align-top font-sans" title={log.file}>
                      {log.file || '—'}
                    </td>
                    <td className="py-2 px-4 text-gray-400 text-[10px] truncate max-w-[130px] align-top font-mono" title={log.node_id}>
                      {log.node_id || '—'}
                    </td>
                    <td className="py-2 px-4 text-gray-900 font-sans text-xs whitespace-pre-wrap leading-relaxed align-top">
                      {log.message}
                      {view === 'monitor' && (
                        <div className="mt-1 text-[11px] text-gray-500">
                          {log.eventCount} olay
                          {log.reexecuting && ` · Önceki tamamlanma: ${log.lastCompletedAt}. Bu iş yeniden başlatılmış; tamamlandı sayılmıyor.`}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
