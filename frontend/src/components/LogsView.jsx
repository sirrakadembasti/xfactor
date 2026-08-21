import React, { useState } from 'react';
import { Terminal, Play, Search, Filter } from 'lucide-react';

export default function LogsView({
  logs = [],
  projectState,
  handleResume,
  wsReady,
  getActionBadge
}) {
  const [filterAction, setFilterAction] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  const filteredLogs = logs.filter(log => {
    if (filterAction !== 'ALL' && (log.action || '').toUpperCase() !== filterAction) {
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
            {filteredLogs.length} / {logs.length} Kayıt
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

          {/* Resume Butonu (Eğer Duraklatılmışsa) */}
          {projectState?.status === 'paused' && (
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

      {/* Tablo Alanı */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead className="bg-gray-800 text-gray-300 uppercase text-[11px] sticky top-0 z-10 shadow-sm">
            <tr>
              <th className="py-2.5 px-4 w-44 font-semibold border-b border-gray-700">Tarih & Saat (created_at)</th>
              <th className="py-2.5 px-4 w-32 font-semibold border-b border-gray-700">Ajan (agent)</th>
              <th className="py-2.5 px-3 w-28 font-semibold border-b border-gray-700">Eylem (action)</th>
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
                const isError = log.action === 'error';
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
                  <tr key={idx} className={`${rowBg} transition-colors`}>
                    <td className="py-2 px-4 whitespace-nowrap text-gray-500 text-[11px] align-top">
                      {log.timestamp || log.created_at || '—'}
                    </td>
                    <td className="py-2 px-4 font-semibold text-gray-800 align-top">
                      {log.agent || '—'}
                    </td>
                    <td className="py-2 px-3 align-top">
                      {getActionBadge ? getActionBadge(log.action) : log.action}
                    </td>
                    <td className="py-2 px-4 text-gray-600 text-[11px] truncate max-w-xs align-top font-sans" title={log.file}>
                      {log.file || '—'}
                    </td>
                    <td className="py-2 px-4 text-gray-400 text-[10px] truncate max-w-[130px] align-top font-mono" title={log.node_id}>
                      {log.node_id || '—'}
                    </td>
                    <td className="py-2 px-4 text-gray-900 font-sans text-xs whitespace-pre-wrap leading-relaxed align-top">
                      {log.message}
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
