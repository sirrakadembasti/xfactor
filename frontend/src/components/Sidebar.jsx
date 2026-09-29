import React from 'react';
import {
  Plus,
  Search,
  FolderGit2,
  Pin,
  PinOff,
  Download,
  Trash2,
  MoreVertical,
  RefreshCw,
  LogOut,
  Settings2
} from 'lucide-react';

export default function Sidebar({
  projects,
  searchQuery,
  setSearchQuery,
  activeProjectId,
  setActiveProjectId,
  activeMenuProjectId,
  setActiveMenuProjectId,
  handleCreateProject,
  handleTogglePin,
  handleRenameProject,
  handleDeleteProject,
  handleDownloadZip,
  handleDownloadProjectZip,
  loginUsername,
  isAdmin = false,
  handleLogout,
  getStatusBadge,
  readOnly = false,
  handleSyncProjects,
  isSyncing = false
}) {
  const onDownloadZip = handleDownloadZip || handleDownloadProjectZip;
  const filteredProjects = projects.filter(p =>
    (p.title || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="w-72 bg-cream-50 border-r border-cream-300 flex flex-col shadow-sm z-20">
      {/* Sidebar Header */}
      <div className="p-3.5 border-b border-cream-200 flex items-center justify-between bg-cream-50">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-gradient-to-br from-indigo-600 to-indigo-700 rounded-lg flex items-center justify-center text-white font-black text-base shadow-sm ring-1 ring-indigo-500/20">
            X
          </div>
          <div>
            <span className="font-bold text-sm text-gray-900 block leading-tight">XFactor Projeler</span>
            <span className="text-[10px] text-gray-400 font-medium">Yönetim Paneli</span>
          </div>
        </div>
        {!readOnly && (
          <div className="flex items-center gap-1">
            {handleSyncProjects && (
              <button
                type="button"
                onClick={handleSyncProjects}
                disabled={isSyncing}
                title="Diskle Senkronize Et (Projeleri Tara)"
                className="p-1.5 bg-gray-50 hover:bg-gray-100 hover:text-indigo-600 rounded-lg text-gray-500 transition-all border border-gray-200/60 shadow-sm disabled:opacity-50 cursor-pointer"
              >
                <RefreshCw size={15} className={isSyncing ? 'animate-spin text-indigo-600' : ''} />
              </button>
            )}
            <button
              type="button"
              onClick={handleCreateProject}
              title="Yeni Proje Başlat"
              className="p-1.5 bg-indigo-50 hover:bg-indigo-100 rounded-lg text-indigo-600 hover:text-indigo-700 transition-all border border-indigo-100 shadow-sm cursor-pointer"
            >
              <Plus size={16} />
            </button>
          </div>
        )}
      </div>

      {/* Search Bar */}
      <div className="p-2.5 border-b border-cream-200 bg-cream-100/60">
        <div className="relative flex items-center">
          <Search size={14} className="absolute left-2.5 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Projelerde ara..."
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-cream-50 border border-cream-200 rounded-lg focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/20 transition"
          />
        </div>
      </div>

      {/* Project List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
        {filteredProjects.length === 0 ? (
          <div className="p-6 text-center text-gray-400 text-xs">
            <FolderGit2 size={32} className="mx-auto mb-2 opacity-40 text-gray-400" />
            Henüz proje bulunmuyor.<br />Yeni proje başlatabilirsiniz.
          </div>
        ) : (
          filteredProjects.map(p => {
            const isActive = activeProjectId === p.id;
            return (
              <div
                key={p.id}
                onClick={() => setActiveProjectId(p.id)}
                className={`p-2.5 rounded-xl cursor-pointer flex items-start justify-between relative group transition-all border ${
                  isActive
                    ? 'bg-indigo-50/70 border-indigo-200 border-l-4 border-l-indigo-600 shadow-sm'
                    : 'bg-cream-50/60 border-transparent hover:bg-cream-100 hover:border-cream-200/80'
                }`}
              >
                <div className="flex-1 min-w-0 pr-2">
                  <div className="flex items-center gap-1.5 mb-1">
                    {p.isPinned && (
                      <Pin size={12} className="text-amber-500 fill-amber-500 shrink-0" title="Sabitlendi" />
                    )}
                    <span className={`font-semibold text-xs truncate block ${isActive ? 'text-indigo-950' : 'text-gray-900'}`}>
                      {p.title}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <div>{getStatusBadge(p.status)}</div>
                    {p.missingOnDisk && (
                      <span className="text-[10px] text-red-500 bg-red-50 px-1.5 py-0.5 rounded border border-red-200 font-medium">
                        (Diskte Bulunamadı)
                      </span>
                    )}
                  </div>
                </div>

                {/* 3-Dots Menu Button */}
                {!readOnly && (
                  <div className="relative shrink-0" onClick={e => e.stopPropagation()}>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveMenuProjectId(activeMenuProjectId === p.id ? null : p.id);
                      }}
                      className="p-1 text-gray-400 hover:text-gray-700 hover:bg-gray-200/60 rounded-md transition opacity-80 group-hover:opacity-100 cursor-pointer"
                      title="Proje İşlemleri"
                    >
                      <MoreVertical size={16} />
                    </button>

                    {activeMenuProjectId === p.id && (
                      <div className="absolute right-0 top-6 w-48 bg-white border border-gray-200 rounded-lg shadow-xl py-1 z-50 text-xs font-medium text-gray-700 animate-in fade-in zoom-in-95 duration-100">
                        <button onClick={(e) => handleTogglePin(p.id, p.isPinned, e)} className="w-full px-3 py-2 text-left hover:bg-gray-50 flex items-center gap-2 cursor-pointer">
                          {p.isPinned ? <PinOff size={14} className="text-gray-500" /> : <Pin size={14} className="text-amber-500" />}
                          {p.isPinned ? 'Sabitlemeyi Kaldır' : 'Başa Sabitle'}
                        </button>
                        {p.status === 'completed' && onDownloadZip && (
                          <button onClick={(e) => { e.stopPropagation(); onDownloadZip(p.id, e); }} className="w-full px-3 py-2 text-left hover:bg-emerald-50 text-emerald-700 flex items-center gap-2 cursor-pointer">
                            <Download size={14} className="text-emerald-600" /> Projeyi (ZIP) İndir
                          </button>
                        )}
                        <div className="border-t border-gray-100 my-1"></div>
                        <button onClick={(e) => handleDeleteProject(p.id, p.title, e)} className="w-full px-3 py-2 text-left hover:bg-red-50 text-red-600 flex items-center gap-2 cursor-pointer">
                          <Trash2 size={14} /> Projeyi Sil
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Sidebar Footer */}
      <div className="p-3 border-t border-cream-300 bg-cream-100/80 space-y-2.5">
        {isAdmin && <a href="/llm" className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg text-xs font-bold transition"><Settings2 size={14} /> LLM Yönetimi</a>}
        {/* User Profile Card */}
        <div className="flex items-center gap-2.5 p-2 bg-cream-50 rounded-xl border border-cream-200/80 shadow-sm">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center text-white font-bold text-sm shadow-sm shrink-0">
            {(loginUsername || 'admin').charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-xs text-gray-900 truncate block">
                {loginUsername || 'admin'}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-indigo-50 text-indigo-700 border border-indigo-100">
                {isAdmin ? 'Yönetici' : 'Kullanıcı'}
              </span>
            </div>
          </div>
        </div>

        {/* Logout Button */}
        <button
          onClick={handleLogout}
          aria-label="Çıkış"
          className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg text-xs font-bold transition shadow-sm cursor-pointer"
        >
          <LogOut size={14} /> Oturumu Kapat
        </button>
      </div>
    </div>
  );
}
