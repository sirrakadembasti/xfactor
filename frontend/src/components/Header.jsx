import {
  MessageSquare,
  LayoutDashboard,
  Layers,
  ScrollText,
  Play,
  Pause,
  Download
} from 'lucide-react';
import ConnectionStatus from './ConnectionStatus';
import { canResumeProject } from '../utils/canResumeProject';

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
  getStatusBadge,
  wsState = 'disconnected'
}) {
  if (!projectState) return null;
  const latestArtifact = projectState.latestArtifact;
  const canDownloadArtifact = projectState.status === 'completed'
    && latestArtifact?.status === 'verified'
    && String(latestArtifact?.id || '').trim() !== '';
  const selectView = mode => {
    const path = mode === 'dashboard' ? '/dashboard' : '/';
    if (window.location.pathname !== path) window.history.pushState({}, '', path);
    setViewMode(mode);
  };

  return (
    <div className="h-14 bg-cream-50 border-b border-cream-300 px-6 flex items-center justify-between shadow-sm z-10">
      <div className="flex items-center gap-3 min-w-0">
        <h2 className="font-bold text-base text-gray-900 truncate">{projectState.title}</h2>
        <div>{projectState.executionMode === 'verification_only'
          ? <span className="text-xs font-semibold text-sky-800 bg-sky-50 px-2 py-1 rounded border border-sky-200">Yalnız doğrulanıyor</span>
          : projectState.executionMode === 'controlled_repair'
            ? <span className="text-xs font-semibold text-amber-800 bg-amber-50 px-2 py-1 rounded border border-amber-200">Sınırlı onarım</span>
          : getStatusBadge(projectState.status)}</div>
        <ConnectionStatus state={wsState} />
        {['missing', 'hash_mismatch', 'unreadable', 'unsafe_path', 'invalid_evidence'].includes(projectState.artifactAvailability) && (
          <span role="status" className="text-xs text-red-700 bg-red-50 px-2 py-1 rounded border border-red-200">
            {projectState.artifactAvailability === 'missing' ? 'ZIP dosyası bulunamadı' : 'ZIP doğrulanamıyor'}
          </span>
        )}
        {latestArtifact && latestArtifact.sha256 && latestArtifact.status === 'verified' && (
          <div className="flex flex-col text-left text-[10px] text-gray-500 font-mono bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
            <span className="text-emerald-700 font-bold">Artifact verified</span>
            <span className="text-gray-600">SHA-256: {latestArtifact.sha256.slice(0, 16)}...</span>
          </div>
        )}
      </div>

      {/* Action Buttons in Header */}
      <div className="flex items-center gap-2">
        {/* View Mode Switcher (Sohbet / DAG Grafiği / Canlı Loglar) */}
        <div className="flex bg-cream-200/60 p-0.5 rounded-lg border border-cream-300 mr-2">
          <button
            onClick={() => {
              selectView('chat');
              if (activeProjectId) fetchProjectState(activeProjectId);
            }}
            className={`px-3 py-1 text-xs font-semibold rounded-md flex items-center gap-1.5 transition cursor-pointer ${
              viewMode === 'chat' ? 'bg-white text-indigo-700 shadow-sm' : 'text-stone-600 hover:text-stone-900'
            }`}
          >
            <MessageSquare size={14} /> Sohbet & Mimari
          </button>
          <button
            onClick={() => selectView('dashboard')}
            className={`px-3 py-1 text-xs font-semibold rounded-md flex items-center gap-1.5 transition cursor-pointer ${
              viewMode === 'dashboard' ? 'bg-white text-indigo-700 shadow-sm' : 'text-stone-600 hover:text-stone-900'
            }`}
          >
            <LayoutDashboard size={14} /> Kalite Paneli
          </button>
          <button
            onClick={() => selectView('flow')}
            className={`px-3 py-1 text-xs font-semibold rounded-md flex items-center gap-1.5 transition cursor-pointer ${
              viewMode === 'flow' ? 'bg-white text-indigo-700 shadow-sm' : 'text-stone-600 hover:text-stone-900'
            }`}
          >
            <Layers size={14} /> Canlı DAG Grafiği
          </button>
          <button
            onClick={() => selectView('logs')}
            className={`px-3 py-1 text-xs font-semibold rounded-md flex items-center gap-1.5 transition cursor-pointer ${
              viewMode === 'logs' ? 'bg-white text-indigo-700 shadow-sm' : 'text-stone-600 hover:text-stone-900'
            }`}
          >
            <ScrollText size={14} /> Canlı Süreç Logları
          </button>
        </div>
        {/* Pending Approval Button */}
        {viewMode !== 'dashboard' && projectState.status === 'pending_approval' && (
          <button
            onClick={handleApprove}
            disabled={projectState.planScopeReview?.valid === false}
            title={projectState.planScopeReview?.valid === false ? 'Önce Manager ile onaylı kapsamı tamamlayın.' : undefined}
            className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-1.5 rounded-lg flex items-center gap-1.5 text-xs font-bold shadow-sm transition"
          >
            <Play size={14} /> Planı Onayla ve Başlat
          </button>
        )}

        {/* Running Button */}
        {viewMode !== 'dashboard' && (['running', 'implementing'].includes(projectState.status)
          || (projectState.executionMode === 'verification_only' && projectState.status === 'implementation_finished')) && (
          <button
            onClick={handlePause}
            className="bg-amber-500 hover:bg-amber-600 text-white px-4 py-1.5 rounded-lg flex items-center gap-1.5 text-xs font-bold shadow-sm transition"
          >
            <Pause size={14} /> Süreci Duraklat
          </button>
        )}

        {/* Stopped project: Active Resume Button */}
        {viewMode !== 'dashboard' && canResumeProject(projectState.status, projectState.last_error, projectState.resumeBlocked) && (
          <button
            onClick={handleResume}
            className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-1.5 rounded-lg flex items-center gap-1.5 text-xs font-bold shadow-sm transition animate-pulse"
            title="Kaldığı görevden devam ettir"
          >
            <Play size={14} /> Projeyi Devam Ettir (Resume)
          </button>
        )}

        {/* Completed Download Button */}
        {canDownloadArtifact && (
          <button
            onClick={event => handleDownloadProjectZip(activeProjectId, event)}
            className="bg-emerald-600 hover:bg-emerald-700 text-white px-3.5 py-1.5 rounded-lg flex items-center gap-1.5 text-xs font-bold transition shadow-sm"
          >
            <Download size={14} /> Projeyi (ZIP) İndir
          </button>
        )}
      </div>
    </div>
  );
}
