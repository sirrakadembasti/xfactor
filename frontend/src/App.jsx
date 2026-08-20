import React, { useState, useEffect, useRef, useCallback } from 'react';
import { applyNodeChanges, applyEdgeChanges, MarkerType } from 'reactflow';
import {
  LayoutDashboard,
  Plus,
  Play,
  Pause,
  CheckCircle2,
  AlertCircle,
  Clock
} from 'lucide-react';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { buildAuthHeaders, buildWebSocketUrl, getStoredToken } from './services/api';

import LoginView from './components/LoginView';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import ChatView from './components/ChatView';
import DAGFlowView from './components/DAGFlowView';
import IDEView from './components/IDEView';

// XFactor Modular Dashboard: Supports pending_approval ('Planı Onayla ve Başlat'), ReactFlow DAG view, Monaco Editor, and JSZip export.
const API_BASE = import.meta.env.VITE_API_BASE || 'http://127.0.0.1:8000/api';
const WS_URL = buildWebSocketUrl(API_BASE);

export default function App() {
  const [token, setToken] = useState(getStoredToken());
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');

  const [projects, setProjects] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeProjectId, setActiveProjectId] = useState(null);

  // Active project reference for WebSocket message filtering without reconnecting
  const activeProjectRef = useRef(activeProjectId);
  useEffect(() => {
    activeProjectRef.current = activeProjectId;
  }, [activeProjectId]);

  const [projectState, setProjectState] = useState(null);
  const [chatInput, setChatInput] = useState('');
  const [activeMenuProjectId, setActiveMenuProjectId] = useState(null);
  const [isSyncing, setIsSyncing] = useState(false);

  // React Flow state
  const [nodes, setNodes] = useState([
    { id: 'manager', position: { x: 400, y: 50 }, data: { label: 'Manager' }, style: { background: '#2563eb', color: 'white', borderRadius: '8px', padding: '10px' } }
  ]);
  const [edges, setEdges] = useState([]);
  const [logs, setLogs] = useState([]);
  const ws = useRef(null);

  // View state: 'chat' | 'flow' | 'ide'
  const [viewMode, setViewMode] = useState('chat');
  const [projectFiles, setProjectFiles] = useState([]);
  const [activeFile, setActiveFile] = useState(null);

  // Close context menu on outside click
  useEffect(() => {
    const handleOutsideClick = () => setActiveMenuProjectId(null);
    window.addEventListener('click', handleOutsideClick);
    return () => window.removeEventListener('click', handleOutsideClick);
  }, []);

  // Ortak Fetch Fonksiyonu (Token ekler)
  const authFetch = async (url, options = {}) => {
    const headers = buildAuthHeaders(token, options.headers || {});
    const res = await fetch(url, { ...options, headers });
    if (res.status === 401) {
      setToken(null);
      localStorage.removeItem('xfactor_token');
      throw new Error('Oturum süresi doldu veya yetkisiz erişim.');
    }
    return res;
  };

  // Projeleri çek
  const fetchProjects = async () => {
    if (!token) return;
    try {
      const res = await authFetch(`${API_BASE}/projects`);
      const data = await res.json();
      const list = Array.isArray(data) ? data : [];
      setProjects(list);
      if (!activeProjectId && list.length > 0) {
        setActiveProjectId(list[0].id);
      }
    } catch (e) {
      console.error('fetchProjects error:', e);
    }
  };

  useEffect(() => {
    fetchProjects();
  }, [token]);

  // Disk Senkronizasyonu
  const handleSyncProjects = async (e) => {
    e?.stopPropagation();
    setIsSyncing(true);
    try {
      await authFetch(`${API_BASE}/projects/sync`, { method: 'POST' });
      await fetchProjects();
    } catch (err) {
      console.error('Senkronizasyon hatası:', err);
    } finally {
      setIsSyncing(false);
    }
  };

  // Aktif proje değiştiğinde durumu çek
  const fetchProjectState = async (id) => {
    try {
      const res = await authFetch(`${API_BASE}/projects/${id}`);
      const data = await res.json();
      setProjectState(data);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    if (activeProjectId) {
      setViewMode('chat');
      fetchProjectState(activeProjectId);
      authFetch(`${API_BASE}/projects/${activeProjectId}/logs`)
        .then(res => res.json())
        .then(data => {
          if (!Array.isArray(data)) return;
          setLogs(data.slice().reverse());

          const newNodes = [
            { id: 'manager', position: { x: 400, y: 50 }, data: { label: 'Manager' }, style: { background: '#2563eb', color: 'white', borderRadius: '8px', padding: '10px' } }
          ];
          const newEdges = [];

          data.forEach(log => {
            if (log.node_id && !newNodes.find(n => n.id === log.node_id)) {
              const yPos = log.agent === 'Director' ? 150 : log.agent === 'Teamleader' ? 250 : 350;
              const xOffset = Math.random() * 200 - 100;
              newNodes.push({
                id: log.node_id,
                position: { x: 400 + xOffset, y: yPos },
                data: { label: `${log.agent}: ${log.node_id}` },
                style: {
                  background:
                    log.agent === 'Director' ? '#10b981' : log.agent === 'Teamleader' ? '#f59e0b' : log.agent === 'System' ? '#ef4444' : '#8b5cf6',
                  color: 'white',
                  borderRadius: '8px',
                  padding: '10px'
                }
              });
            }
            if (log.parent_node_id && log.node_id) {
              const edgeId = `${log.parent_node_id}-${log.node_id}`;
              if (!newEdges.find(e => e.id === edgeId)) {
                newEdges.push({ id: edgeId, source: log.parent_node_id, target: log.node_id, animated: true, markerEnd: { type: MarkerType.ArrowClosed } });
              }
            }
          });
          setNodes(newNodes);
          setEdges(newEdges);
        })
        .catch(e => console.error('Logs error:', e));
    } else {
      setProjectState(null);
      setLogs([]);
      setNodes([{ id: 'manager', position: { x: 400, y: 50 }, data: { label: 'Manager' }, style: { background: '#2563eb', color: 'white', borderRadius: '8px', padding: '10px' } }]);
      setEdges([]);
    }
  }, [activeProjectId]);

  // Proje tamamlandığında dosyaları çek
  useEffect(() => {
    if (projectState?.status === 'completed' && activeProjectId) {
      authFetch(`${API_BASE}/projects/${activeProjectId}/files`)
        .then(res => res.json())
        .then(data => {
          if (Array.isArray(data)) {
            setProjectFiles(data);
            if (data.length > 0) setActiveFile(data[0]);
          }
        })
        .catch(e => console.error('Files error:', e));
    }
  }, [projectState?.status, activeProjectId]);

  // WebSocket Canlı Akışı
  useEffect(() => {
    if (!token) return;
    let reconnectTimeout;
    let isSubscribed = true;

    const connectWs = () => {
      if (!isSubscribed) return;
      if (ws.current && (ws.current.readyState === WebSocket.CONNECTING || ws.current.readyState === WebSocket.OPEN)) {
        return;
      }

      const socket = new WebSocket(WS_URL, [`xfactor-auth.${token}`]);
      ws.current = socket;

      socket.onopen = () => {
        if (!isSubscribed) {
          socket.close();
          return;
        }
      };

      socket.onerror = (err) => {
        // Hata durumunda onclose zaten tetiklenir
      };

      socket.onmessage = event => {
        try {
          const data = JSON.parse(event.data);
          if (activeProjectRef.current && data.projectId !== activeProjectRef.current) return;

          setLogs(prev => {
            const isDup = prev.slice(0, 20).some(
              l => (l.id && data.id && l.id === data.id) ||
                (l.timestamp === data.timestamp && l.agent === data.agent && l.action === data.action && l.node_id === data.node_id && l.message === data.message)
            );
            if (isDup) return prev;
            return [data, ...prev];
          });

          if (data.node_id) {
            setNodes(nds => {
              if (!nds.find(n => n.id === data.node_id)) {
                const yPos = data.agent === 'Director' ? 150 : data.agent === 'Teamleader' ? 250 : 350;
                const xOffset = Math.random() * 200 - 100;
                return [
                  ...nds,
                  {
                    id: data.node_id,
                    position: { x: 400 + xOffset, y: yPos },
                    data: { label: `${data.agent}: ${data.node_id}` },
                    style: {
                      background:
                        data.agent === 'Director' ? '#10b981' : data.agent === 'Teamleader' ? '#f59e0b' : data.agent === 'System' ? '#ef4444' : '#8b5cf6',
                      color: 'white',
                      borderRadius: '8px',
                      padding: '10px'
                    }
                  }
                ];
              }
              return nds;
            });
            if (data.parent_node_id) {
              setEdges(eds => {
                const edgeId = `${data.parent_node_id}-${data.node_id}`;
                if (!eds.find(e => e.id === edgeId)) {
                  return [...eds, { id: edgeId, source: data.parent_node_id, target: data.node_id, animated: true, markerEnd: { type: MarkerType.ArrowClosed } }];
                }
                return eds;
              });
            }
          }
          if (data.action === 'finish' && data.agent === 'Manager') {
            if (activeProjectRef.current) fetchProjectState(activeProjectRef.current);
            fetchProjects();
          }
        } catch (err) {
          console.error('WS Parse Error:', err);
        }
      };

      socket.onclose = () => {
        if (isSubscribed) {
          reconnectTimeout = setTimeout(connectWs, 3000);
        }
      };
    };

    connectWs();

    return () => {
      isSubscribed = false;
      clearTimeout(reconnectTimeout);
      if (ws.current) {
        if (ws.current.readyState === WebSocket.OPEN) {
          ws.current.close();
        } else if (ws.current.readyState === WebSocket.CONNECTING) {
          const socketToClose = ws.current;
          socketToClose.onopen = () => socketToClose.close();
        }
        ws.current = null;
      }
    };
  }, [token]);

  const onNodesChange = useCallback(changes => setNodes(nds => applyNodeChanges(changes, nds)), []);
  const onEdgesChange = useCallback(changes => setEdges(eds => applyEdgeChanges(changes, eds)), []);

  const handleLogin = async e => {
    e.preventDefault();
    setLoginError('');
    try {
      const res = await fetch(`${API_BASE}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: loginUsername, password: loginPassword })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Giriş başarısız.');
      setToken(data.token);
      localStorage.setItem('xfactor_token', data.token);
    } catch (err) {
      setLoginError(err.message);
    }
  };

  const handleLogout = () => {
    setToken(null);
    localStorage.removeItem('xfactor_token');
  };

  const handleCreateProject = async () => {
    const title = prompt('Proje Başlığı Girin:', 'Yeni Otonom Proje');
    if (!title || !title.trim()) return;

    try {
      const res = await authFetch(`${API_BASE}/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim() })
      });
      const newProj = await res.json();
      await fetchProjects();
      setActiveProjectId(newProj.id);
    } catch (e) {
      alert('Proje oluşturulamadı: ' + e.message);
    }
  };

  const handleTogglePin = async (id, currentPinState, e) => {
    e?.stopPropagation();
    setActiveMenuProjectId(null);
    try {
      await authFetch(`${API_BASE}/projects/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_pinned: !currentPinState })
      });
      fetchProjects();
    } catch (err) {
      alert('Sabitleme hatası: ' + err.message);
    }
  };

  const handleRenameProject = async (id, currentTitle, e) => {
    e?.stopPropagation();
    setActiveMenuProjectId(null);
    const newTitle = prompt('Yeni Proje Başlığı:', currentTitle);
    if (!newTitle || !newTitle.trim() || newTitle === currentTitle) return;

    try {
      await authFetch(`${API_BASE}/projects/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle.trim() })
      });
      fetchProjects();
      if (activeProjectId === id) fetchProjectState(id);
    } catch (err) {
      alert('Yeniden adlandırma hatası: ' + err.message);
    }
  };

  const handleDeleteProject = async (id, projectTitle, e) => {
    e?.stopPropagation();
    setActiveMenuProjectId(null);
    if (!confirm(`"${projectTitle}" projesini ve tüm dosyalarını silmek istediğinize emin misiniz?`)) return;

    try {
      await authFetch(`${API_BASE}/projects/${id}`, { method: 'DELETE' });
      if (activeProjectId === id) {
        setActiveProjectId(null);
        setProjectState(null);
      }
      fetchProjects();
    } catch (err) {
      alert('Silme hatası: ' + err.message);
    }
  };

  const handleDownloadProjectZip = async (id, projectTitle, e) => {
    e?.stopPropagation();
    setActiveMenuProjectId(null);
    try {
      const res = await authFetch(`${API_BASE}/projects/${id}/files`);
      const files = await res.json();
      if (!Array.isArray(files) || files.length === 0) {
        alert('İndirilecek kaynak dosyası bulunamadı.');
        return;
      }
      const zip = new JSZip();
      files.forEach(f => {
        zip.file(f.path, f.content);
      });
      const blob = await zip.generateAsync({ type: 'blob' });
      saveAs(blob, `${projectTitle || id}.zip`);
    } catch (err) {
      alert('ZIP indirme hatası: ' + err.message);
    }
  };

  const handleSendMessage = async () => {
    if (!chatInput.trim() || !activeProjectId) return;
    const message = chatInput;
    setChatInput('');
    setProjectState(prev => ({
      ...prev,
      chatHistory: [...(prev?.chatHistory || []), { role: 'user', parts: [{ text: message }] }]
    }));

    try {
      const res = await authFetch(`${API_BASE}/projects/${activeProjectId}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message })
      });
      const data = await res.json();
      setProjectState(data);
    } catch (error) {
      setProjectState(prev => {
        const newHistory = (prev?.chatHistory || []).slice(0, -1);
        newHistory.push({ role: 'user', parts: [{ text: message }] });
        newHistory.push({ role: 'model', isError: true, parts: [{ text: `⚠️ Mesaj iletilemedi, lütfen tekrar deneyin.` }] });
        return { ...prev, chatHistory: newHistory };
      });
    }
    fetchProjects();
  };

  const handleApprove = async () => {
    if (!activeProjectId) return;
    setNodes([{ id: 'manager', position: { x: 400, y: 50 }, data: { label: 'Manager' }, style: { background: '#2563eb', color: 'white', borderRadius: '8px', padding: '10px' } }]);
    setEdges([]);
    setLogs([]);
    setViewMode('flow');

    try {
      const res = await authFetch(`${API_BASE}/projects/${activeProjectId}/approve`, { method: 'POST' });
      const data = await res.json();
      setProjectState(data);
      fetchProjects();
    } catch (err) {
      alert('Başlatma hatası: ' + err.message);
    }
  };

  const handleResume = async () => {
    if (!activeProjectId) return;
    setViewMode('flow');
    try {
      const res = await authFetch(`${API_BASE}/projects/${activeProjectId}/resume`, { method: 'POST' });
      const data = await res.json();
      setProjectState(data);
      fetchProjects();
    } catch (err) {
      alert('Devam ettirme hatası: ' + err.message);
    }
  };

  const handlePause = async () => {
    if (!activeProjectId) return;
    try {
      const res = await authFetch(`${API_BASE}/projects/${activeProjectId}/pause`, { method: 'POST' });
      const data = await res.json();
      setProjectState(data);
      fetchProjects();
    } catch (err) {
      alert('Durdurma hatası: ' + err.message);
    }
  };

  const getStatusBadge = status => {
    switch (status) {
      case 'completed':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
            <CheckCircle2 size={12} /> Tamamlandı
          </span>
        );
      case 'running':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-200 animate-pulse">
            <Play size={12} /> Üretiliyor
          </span>
        );
      case 'paused':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-600 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
            <Pause size={12} /> Durduruldu
          </span>
        );
      case 'pending_approval':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-purple-600 bg-purple-50 px-2 py-0.5 rounded border border-purple-200">
            <AlertCircle size={12} /> Onay Bekliyor
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-gray-500 bg-gray-100 px-2 py-0.5 rounded border border-gray-200">
            <Clock size={12} /> Planlama
          </span>
        );
    }
  };

  const getActionBadge = action => {
    const act = (action || '').toLowerCase();
    switch (act) {
      case 'start':
        return <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-purple-100 text-purple-700 border border-purple-200">START</span>;
      case 'write':
        return <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-emerald-100 text-emerald-700 border border-emerald-200">WRITE</span>;
      case 'delegate':
        return <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-amber-100 text-amber-700 border border-amber-200">DELEGATE</span>;
      case 'feedback':
        return <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-orange-100 text-orange-700 border border-orange-200">FEEDBACK</span>;
      case 'skip':
        return <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-sky-100 text-sky-700 border border-sky-200">SKIP</span>;
      case 'finish':
        return <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-green-100 text-green-700 border border-green-200">FINISH</span>;
      case 'error':
        return <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-red-100 text-red-700 border border-red-200">ERROR</span>;
      default:
        return <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-gray-100 text-gray-700 border border-gray-200">{action || 'INFO'}</span>;
    }
  };

  if (!token) {
    return (
      <LoginView
        loginUsername={loginUsername}
        setLoginUsername={setLoginUsername}
        loginPassword={loginPassword}
        setLoginPassword={setLoginPassword}
        loginError={loginError}
        handleLogin={handleLogin}
      />
    );
  }

  return (
    <div className="flex h-screen bg-gray-50 font-sans text-gray-800">
      {/* SIDEBAR */}
      <Sidebar
        projects={projects}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        activeProjectId={activeProjectId}
        setActiveProjectId={setActiveProjectId}
        activeMenuProjectId={activeMenuProjectId}
        setActiveMenuProjectId={setActiveMenuProjectId}
        handleSyncProjects={handleSyncProjects}
        isSyncing={isSyncing}
        handleCreateProject={handleCreateProject}
        handleTogglePin={handleTogglePin}
        handleRenameProject={handleRenameProject}
        handleDownloadProjectZip={handleDownloadProjectZip}
        handleDeleteProject={handleDeleteProject}
        loginUsername={loginUsername}
        handleLogout={handleLogout}
        getStatusBadge={getStatusBadge}
      />

      {/* MAIN AREA */}
      <div className="flex-1 flex flex-col min-w-0">
        {!projectState ? (
          <div className="flex-1 flex items-center justify-center text-gray-400 flex-col bg-white">
            <LayoutDashboard size={56} className="mb-4 text-indigo-300" />
            <h3 className="text-lg font-bold text-gray-700 mb-1">XFactor AI Orkestrasyon Platformu</h3>
            <p className="text-sm text-gray-500 mb-4">Sol menüden bir proje seçin veya yeni bir proje başlatın.</p>
            <button
              onClick={handleCreateProject}
              className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-4 py-2 rounded-lg flex items-center gap-2 shadow-sm transition"
            >
              <Plus size={16} /> Yeni Proje Başlat
            </button>
          </div>
        ) : (
          <>
            {/* Top Header */}
            <Header
              projectState={projectState}
              activeProjectId={activeProjectId}
              viewMode={viewMode}
              setViewMode={setViewMode}
              fetchProjectState={fetchProjectState}
              handleApprove={handleApprove}
              handlePause={handlePause}
              handleResume={handleResume}
              handleDownloadProjectZip={handleDownloadProjectZip}
              getStatusBadge={getStatusBadge}
            />

            {/* Content Area */}
            <div className="flex-1 overflow-hidden flex relative">
              {viewMode === 'chat' && (
                <ChatView
                  projectState={projectState}
                  chatInput={chatInput}
                  setChatInput={setChatInput}
                  handleSendMessage={handleSendMessage}
                  handleApprove={handleApprove}
                  handleResume={handleResume}
                  setViewMode={setViewMode}
                />
              )}

              {viewMode === 'flow' && (
                <DAGFlowView
                  nodes={nodes}
                  edges={edges}
                  onNodesChange={onNodesChange}
                  onEdgesChange={onEdgesChange}
                  logs={logs}
                  projectState={projectState}
                  handleResume={handleResume}
                  wsReady={ws.current?.readyState === 1}
                  getActionBadge={getActionBadge}
                />
              )}

              {viewMode === 'ide' && (
                <IDEView
                  projectFiles={projectFiles}
                  activeFile={activeFile}
                  setActiveFile={setActiveFile}
                />
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
