import React from 'react';
import {
  MessageSquare,
  Layers,
  FileCode,
  ScrollText,
  Play,
  Pause,
  Download
} from 'lucide-react';
export default function Header({
  projectState,
  activeProjectId,
  viewMode,
  setViewMode,
  fetchProjectState,
  handleApprove,
  handlePause,
  handleResume,
  handleDownloadProjectZip,
  getStatusBadge
}) {
  if (!projectState) return null;

  return (
    <div className="h-14 bg-white border-b px-6 flex items-center justify-between shadow-sm z-10">
      <div className="flex items-center gap-3 min-w-0">
        <h2 className="font-bold text-base text-gray-900 truncate">{projectState.title}</h2>
        <div>{getStatusBadge(projectState.status)}</div>
      </div>

      {/* Action Buttons in Header */}
      <div className="flex items-center gap-2">
        {/* View Mode Switcher (Sohbet / DAG Grafiği / Canlı Loglar / IDE) */}
        <div className="flex bg-gray-100 p-0.5 rounded-lg border border-gray-200 mr-2">
          <button
            onClick={() => {
              setViewMode('chat');
              if (activeProjectId) fetchProjectState(activeProjectId);
            }}
            className={`px-3 py-1 text-xs font-semibold rounded-md flex items-center gap-1.5 transition cursor-pointer ${
              viewMode === 'chat' ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <MessageSquare size={14} /> Sohbet & Mimari
          </button>
          <button
            onClick={() => setViewMode('flow')}
            className={`px-3 py-1 text-xs font-semibold rounded-md flex items-center gap-1.5 transition cursor-pointer ${
              viewMode === 'flow' ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <Layers size={14} /> Canlı DAG Grafiği
          </button>
          <button
            onClick={() => setViewMode('logs')}
            className={`px-3 py-1 text-xs font-semibold rounded-md flex items-center gap-1.5 transition cursor-pointer ${
              viewMode === 'logs' ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <ScrollText size={14} /> Canlı Süreç Logları
          </button>
          {projectState.status === 'completed' && (
            <button
              onClick={() => setViewMode('ide')}
              className={`px-3 py-1 text-xs font-semibold rounded-md flex items-center gap-1.5 transition cursor-pointer ${
                viewMode === 'ide' ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <FileCode size={14} /> Kod Editörü
            </button>
          )}
        </div>
        {/* Pending Approval Button */}
        {projectState.status === 'pending_approval' && (
          <button
            onClick={handleApprove}
            className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-1.5 rounded-lg flex items-center gap-1.5 text-xs font-bold shadow-sm transition"
          >
            <Play size={14} /> Planı Onayla ve Başlat
          </button>
        )}

        {/* Running Button */}
        {projectState.status === 'running' && (
          <button
            onClick={handlePause}
            className="bg-amber-500 hover:bg-amber-600 text-white px-4 py-1.5 rounded-lg flex items-center gap-1.5 text-xs font-bold shadow-sm transition"
          >
            <Pause size={14} /> Süreci Duraklat
          </button>
        )}

        {/* Paused: Active Resume Button */}
        {projectState.status === 'paused' && (
          <button
            onClick={handleResume}
            className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-1.5 rounded-lg flex items-center gap-1.5 text-xs font-bold shadow-sm transition animate-pulse"
            title="Kaldığı görevden devam ettir"
          >
            <Play size={14} /> Projeyi Devam Ettir (Resume)
          </button>
        )}

        {/* Completed Download Button */}
        {projectState.status === 'completed' && (
          <button
            onClick={() => handleDownloadProjectZip(activeProjectId, projectState.title)}
            className="bg-emerald-600 hover:bg-emerald-700 text-white px-3.5 py-1.5 rounded-lg flex items-center gap-1.5 text-xs font-bold transition shadow-sm"
          >
            <Download size={14} /> Projeyi (ZIP) İndir
          </button>
        )}
      </div>
    </div>
  );
}
