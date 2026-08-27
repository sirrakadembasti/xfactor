import React from 'react';
import {
  Plus,
  Search,
  FolderGit2,
  Pin,
  PinOff,
  Edit2,
  Trash2,
  Download,
  MoreVertical
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
  handleDownloadProjectZip,
  handleDeleteProject,
  loginUsername,
  handleLogout,
  getStatusBadge
}) {
  const filteredProjects = projects.filter(p =>
    (p.title || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="w-72 bg-white border-r flex flex-col shadow-sm z-20">
      {/* Sidebar Header */}
      <div className="p-3.5 border-b flex items-center justify-between bg-white">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-indigo-600 rounded-md flex items-center justify-center text-white font-black text-sm">X</div>
          <span className="font-bold text-base text-gray-900">XFactor Projeler</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleCreateProject}
            title="Yeni Proje Başlat"
            className="p-1.5 bg-indigo-50 hover:bg-indigo-100 rounded text-indigo-600 transition"
          >
            <Plus size={18} />
          </button>
        </div>
      </div>

      {/* Search Bar */}
      <div className="p-2.5 border-b bg-gray-50">
        <div className="relative flex items-center">
          <Search size={15} className="absolute left-2.5 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Projelerde ara..."
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-gray-200 rounded-md focus:outline-none focus:border-indigo-400"
          />
        </div>
      </div>

      {/* Project List */}
      <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
        {filteredProjects.length === 0 ? (
          <div className="p-6 text-center text-gray-400 text-xs">
            <FolderGit2 size={32} className="mx-auto mb-2 opacity-40" />
            Henüz proje bulunmuyor.<br />Yeni proje başlatabilirsiniz.
          </div>
        ) : (
          filteredProjects.map(p => (
            <div
              key={p.id}
              onClick={() => setActiveProjectId(p.id)}
              className={`p-3 cursor-pointer hover:bg-gray-50 flex items-start justify-between relative group transition-colors ${
                activeProjectId === p.id ? 'bg-indigo-50/80 border-l-4 border-indigo-600' : ''
              }`}
            >
              <div className="flex-1 min-w-0 pr-2">
                <div className="flex items-center gap-1.5 mb-1">
                  {p.isPinned && (
                    <Pin size={12} className="text-amber-500 fill-amber-500 shrink-0" title="Sabitlendi" />
                  )}
                  <span className="font-semibold text-xs text-gray-900 truncate block">
                    {p.title}
                  </span>
                </div>
                <div>{getStatusBadge(p.status)}</div>
              </div>

              {/* 3-Dots Menu Button */}
              <div className="relative shrink-0" onClick={e => e.stopPropagation()}>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveMenuProjectId(activeMenuProjectId === p.id ? null : p.id);
                  }}
                  className="p-1 text-gray-400 hover:text-gray-700 hover:bg-gray-200/60 rounded transition opacity-80 group-hover:opacity-100"
                  title="Proje İşlemleri"
                >
                  <MoreVertical size={16} />
                </button>

                {/* Context Menu Dropdown */}
                {activeMenuProjectId === p.id && (
                  <div className="absolute right-0 top-6 w-48 bg-white border border-gray-200 rounded-lg shadow-xl py-1 z-50 text-xs font-medium text-gray-700 animate-in fade-in zoom-in-95 duration-100">
                    <button
                      onClick={(e) => handleTogglePin(p.id, p.isPinned, e)}
                      className="w-full px-3 py-2 text-left hover:bg-gray-50 flex items-center gap-2"
                    >
                      {p.isPinned ? <PinOff size={14} className="text-gray-500" /> : <Pin size={14} className="text-amber-500" />}
                      {p.isPinned ? 'Sabitlemeyi Kaldır' : 'Başa Sabitle'}
                    </button>

                    <button
                      onClick={(e) => handleRenameProject(p.id, p.title, e)}
                      className="w-full px-3 py-2 text-left hover:bg-gray-50 flex items-center gap-2"
                    >
                      <Edit2 size={14} className="text-blue-500" />
                      Yeniden Adlandır
                    </button>

                    <button
                      onClick={(e) => handleDownloadProjectZip(p.id, p.title, e)}
                      className="w-full px-3 py-2 text-left hover:bg-gray-50 flex items-center gap-2"
                    >
                      <Download size={14} className="text-emerald-500" />
                      ZIP Olarak İndir
                    </button>

                    <div className="border-t border-gray-100 my-1"></div>

                    <button
                      onClick={(e) => handleDeleteProject(p.id, p.title, e)}
                      className="w-full px-3 py-2 text-left hover:bg-red-50 text-red-600 flex items-center gap-2"
                    >
                      <Trash2 size={14} />
                      Projeyi Sil
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Sidebar Footer */}
      <div className="p-3 border-t bg-gray-50 flex items-center justify-between text-xs text-gray-500">
        <span className="truncate">{loginUsername || 'admin'}</span>
        <button
          onClick={handleLogout}
          className="text-red-600 hover:underline font-medium"
        >
          Çıkış
        </button>
      </div>
    </div>
  );
}
