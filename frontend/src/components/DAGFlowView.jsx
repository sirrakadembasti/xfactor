import React from 'react';
import ReactFlow, { Background, Controls } from 'reactflow';
import 'reactflow/dist/style.css';
import { Terminal, Play } from 'lucide-react';

export default function DAGFlowView({
  nodes,
  edges,
  onNodesChange,
  onEdgesChange,
  logs,
  projectState,
  handleResume,
  wsReady,
  getActionBadge
}) {
  return (
    <div className="flex-1 flex flex-col">
      {/* React Flow Grafiği */}
      <div className="flex-1 relative bg-gray-100">
        <ReactFlow nodes={nodes} edges={edges} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} fitView>
          <Background color="#bbb" gap={16} />
          <Controls />
        </ReactFlow>
      </div>

      {/* Gelişmiş Canlı Süreç Log Tablosu */}
      <div className="h-72 bg-white border-t overflow-hidden flex flex-col shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)]">
        <div className="bg-gray-900 px-4 py-2.5 text-xs font-semibold text-gray-200 flex justify-between items-center shrink-0">
          <span className="flex items-center gap-2">
            <Terminal size={15} className="text-indigo-400" /> CANLI SÜREÇ İZLEME LOGLARI ({logs.length} Kayıt)
          </span>
          <div className="flex items-center gap-3">
            {projectState?.status === 'paused' && (
              <button
                onClick={handleResume}
                className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1 rounded text-xs font-bold flex items-center gap-1 shadow-sm"
              >
                <Play size={12} /> Süreci Devam Ettir
              </button>
            )}
            <span className="text-[11px]">{wsReady ? '🟢 Canlı Akış Aktif' : '🔴 Bağlantı Yok'}</span>
          </div>
        </div>

        <div className="flex-1 overflow-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-gray-800 text-gray-300 uppercase text-[11px] sticky top-0 z-10">
              <tr>
                <th className="py-2 px-3 w-40 font-semibold border-b border-gray-700">Tarih & Saat (created_at)</th>
                <th className="py-2 px-3 w-28 font-semibold border-b border-gray-700">Ajan (agent)</th>
                <th className="py-2 px-3 w-24 font-semibold border-b border-gray-700">Eylem (action)</th>
                <th className="py-2 px-3 w-48 font-semibold border-b border-gray-700">Hedef Dosya (file)</th>
                <th className="py-2 px-3 w-36 font-semibold border-b border-gray-700">Düğüm ID (node_id)</th>
                <th className="py-2 px-3 font-semibold border-b border-gray-700">İşlem Mesajı (message)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 font-mono">
              {logs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-gray-400 p-8 text-center font-sans">
                    Henüz log kaydı bulunmuyor.
                  </td>
                </tr>
              ) : (
                logs.map((log, idx) => (
                  <tr key={idx} className="hover:bg-gray-50/80 transition-colors">
                    <td className="py-1.5 px-3 whitespace-nowrap text-gray-500 text-[11px]">
                      {log.timestamp || log.created_at || '—'}
                    </td>
                    <td className="py-1.5 px-3 font-semibold text-gray-800">{log.agent || '—'}</td>
                    <td className="py-1.5 px-3">{getActionBadge(log.action)}</td>
                    <td className="py-1.5 px-3 text-gray-600 text-[11px] truncate max-w-xs" title={log.file}>
                      {log.file || '—'}
                    </td>
                    <td className="py-1.5 px-3 text-gray-400 text-[10px] truncate max-w-[120px]" title={log.node_id}>
                      {log.node_id || '—'}
                    </td>
                    <td className="py-1.5 px-3 text-gray-900 font-sans text-xs">{log.message}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
