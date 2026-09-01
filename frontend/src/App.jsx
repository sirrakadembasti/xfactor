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
// JSZip and file-saver dynamically loaded on demand for bundle optimization
import { api, buildWebSocketUrl, ApiError } from './services/api';
import { computeHierarchicalDAG, getAgentVisualTheme } from './utils/dagLayout';
import LoginView from './components/LoginView';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import ChatView from './components/ChatView';
import DAGFlowView from './components/DAGFlowView';
import LogsView from './components/LogsView';
import IDEView from './components/IDEView';
import DashboardView from './components/DashboardView';

// XFactor Modular Dashboard: Supports pending_approval ('Planı Onayla ve Başlat'), ReactFlow DAG view, Monaco Editor, and JSZip export.
const MAX_LOGS = 500;
export default function App() {
  const [authStatus, setAuthStatus] = useState('checking');
  const [currentUser, setCurrentUser] = useState(null);
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');

  const [projects, setProjects] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeProjectId, setActiveProjectId] = useState(null);
  const [uiError, setUiError] = useState('');
  const isPollingRef = useRef(false);
  // Active project reference for WebSocket message filtering without reconnecting
  const activeProjectRef = useRef(activeProjectId);
  useEffect(() => {
    activeProjectRef.current = activeProjectId;
  }, [activeProjectId]);

  const [projectState, setProjectState] = useState(null);
  const [chatInput, setChatInput] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [activeMenuProjectId, setActiveMenuProjectId] = useState(null);

  // React Flow state (Algoritmik hiyerarşik başlangıç)
  const [nodes, setNodes] = useState(computeHierarchicalDAG([]).nodes);
  const [edges, setEdges] = useState(computeHierarchicalDAG([]).edges);
  const [logs, setLogs] = useState([]);

  // WebSocket state machine
  const [wsState, setWsState] = useState('disconnected');
  const ws = useRef(null);
  const reconnectTimerRef = useRef(null);
  const reconnectAttemptRef = useRef(0);

  // Request cancellation ref for project switches
  const projectAbortRef = useRef(null);

  // View state: 'chat' | 'dashboard' | 'flow' | 'ide' | 'logs'
  const [viewMode, setViewMode] = useState(() => window.location.pathname === '/dashboard' ? 'dashboard' : 'chat');
  useEffect(() => {
    const handleNavigation = () => setViewMode(window.location.pathname === '/dashboard' ? 'dashboard' : 'chat');
    window.addEventListener('popstate', handleNavigation);
    return () => window.removeEventListener('popstate', handleNavigation);
  }, []);
  const [projectFiles, setProjectFiles] = useState([]);
  const [activeFile, setActiveFile] = useState(null);

  const clearAccountState = useCallback(() => {
    if (projectAbortRef.current) {
      projectAbortRef.current.abort();
      projectAbortRef.current = null;
    }
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (ws.current) {
      ws.current.close();
      ws.current = null;
    }
    setWsState('disconnected');
    activeProjectRef.current = null;
    setProjects([]);
    setSearchQuery('');
    setActiveProjectId(null);
    setProjectState(null);
    setChatInput('');
    setIsThinking(false);
    setActiveMenuProjectId(null);
    const emptyDag = computeHierarchicalDAG([]);
    setNodes(emptyDag.nodes);
    setEdges(emptyDag.edges);
    setLogs([]);
    setViewMode('chat');
    setProjectFiles([]);
    setActiveFile(null);
    setLoginPassword('');
    setLoginError('');
  }, []);

  const becomeAnonymous = useCallback(() => {
    clearAccountState();
    setCurrentUser(null);
    setAuthStatus('anonymous');
  }, [clearAccountState]);

  useEffect(() => {
    let active = true;
    api.getSession()
      .then(data => {
        if (!active) return;
        setCurrentUser(data.user);
        setAuthStatus('authenticated');
      })
      .catch(() => {
        if (active) becomeAnonymous();
      });
    return () => {
      active = false;
    };
  }, [becomeAnonymous]);

  // Close context menu on outside click
  useEffect(() => {
    const handleOutsideClick = () => setActiveMenuProjectId(null);
    window.addEventListener('click', handleOutsideClick);
    return () => window.removeEventListener('click', handleOutsideClick);
  }, []);

  // Projeleri çek (F-01 Fix: selected-project reconciliation without stale closure)
  // Projeleri çek (F-01 Fix: selected-project reconciliation without stale closure, non-overlapping polling)
  const fetchProjects = useCallback(async () => {
    if (authStatus !== 'authenticated' || isPollingRef.current) return;
    isPollingRef.current = true;
    try {
      const data = await api.getProjects();
      const list = Array.isArray(data) ? data : [];
      setProjects(list);
      setActiveProjectId(currentId => {
        if (currentId && list.some(p => p.id === currentId)) {
          return currentId;
        }
        return list.length > 0 ? list[0].id : null;
      });
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        becomeAnonymous();
      }
    } finally {
      isPollingRef.current = false;
    }
  }, [authStatus, becomeAnonymous]);

  useEffect(() => {
    if (authStatus !== 'authenticated') return;
    fetchProjects();
    const interval = setInterval(fetchProjects, 4000);
    return () => clearInterval(interval);
  }, [authStatus, fetchProjects]);
  // Aktif proje değiştiğinde durumu çek (F-03 Fix: Request cancellation & sequence identity)
  const fetchProjectState = useCallback(async (id, signal) => {
    try {
      const data = await api.getProject(id, { signal });
      setProjectState(data);
      return data;
    } catch (e) {
      if (e.name === 'AbortError') return null;
      if (e instanceof ApiError && e.status === 401) {
        becomeAnonymous();
      }
      return null;
    }
  }, [becomeAnonymous]);

  useEffect(() => {
    if (projectAbortRef.current) {
      projectAbortRef.current.abort();
    }

    if (activeProjectId) {
      const controller = new AbortController();
      projectAbortRef.current = controller;

      setViewMode(window.location.pathname === '/dashboard' ? 'dashboard' : 'chat');
      fetchProjectState(activeProjectId, controller.signal);

      api.getProjectLogs(activeProjectId, { signal: controller.signal })
        .then(data => {
          if (!Array.isArray(data)) return;
          const sortedLogs = data.slice(-MAX_LOGS).reverse();
          setLogs(sortedLogs);
          const { nodes: computedNodes, edges: computedEdges } = computeHierarchicalDAG(sortedLogs);
          setNodes(computedNodes);
          setEdges(computedEdges);
        })
        .catch(e => {
          if (e.name !== 'AbortError') console.error('Logs error:', e);
        });

      return () => {
        controller.abort();
      };
    } else {
      setProjectState(null);
      setLogs([]);
      const { nodes: initNodes, edges: initEdges } = computeHierarchicalDAG([]);
      setNodes(initNodes);
      setEdges(initEdges);
    }
  }, [activeProjectId, fetchProjectState]);

  // Proje tamamlandığında dosyaları çek
  useEffect(() => {
    if (projectState?.status === 'completed' && activeProjectId) {
      api.getProjectFiles(activeProjectId)
        .then(data => {
          if (Array.isArray(data)) {
            setProjectFiles(data);
            if (data.length > 0) setActiveFile(data[0]);
          }
        })
        .catch(e => {
          if (e.name !== 'AbortError') console.error('Files error:', e);
        });
    }
  }, [projectState?.status, activeProjectId]);

  // WebSocket Canlı Akışı (F-05: State Machine & Bounded Backoff)
  useEffect(() => {
    if (authStatus !== 'authenticated') return;
    let isSubscribed = true;

    const subscribeToActiveProject = socket => {
      const projectId = activeProjectRef.current;
      if (projectId && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'subscribe', projectId }));
      }
    };

    const connectWs = () => {
      if (!isSubscribed) return;
      if (ws.current && (ws.current.readyState === WebSocket.CONNECTING || ws.current.readyState === WebSocket.OPEN)) {
        return;
      }

      setWsState(reconnectAttemptRef.current > 0 ? 'reconnecting' : 'connecting');
      const wsUrl = buildWebSocketUrl();
      const socket = new WebSocket(wsUrl);
      ws.current = socket;

      socket.onopen = () => {
        if (!isSubscribed) {
          socket.close();
          return;
        }
        reconnectAttemptRef.current = 0;
        setWsState('connected');
        subscribeToActiveProject(socket);
      };

      socket.onerror = () => {
        // onclose will trigger reconnection
      };

      let pendingLogBatch = [];
      let batchFrameId = null;

      const flushPendingLogs = () => {
        if (pendingLogBatch.length === 0) return;
        const batch = [...pendingLogBatch];
        pendingLogBatch = [];

        setLogs(prev => {
          const newLogs = [...batch.reverse(), ...prev].slice(0, MAX_LOGS);
          const { nodes: computedNodes, edges: computedEdges } = computeHierarchicalDAG(newLogs);
          setNodes(computedNodes);
          setEdges(computedEdges);
          return newLogs;
        });
      };

      socket.onmessage = event => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'subscribed') return;
          if (data.type === 'error') {
            console.error(`WS protocol error: ${data.code}`);
            return;
          }
          if (activeProjectRef.current && data.projectId !== activeProjectRef.current) return;

          pendingLogBatch.push(data);
          if (!batchFrameId) {
            batchFrameId = setTimeout(() => {
              batchFrameId = null;
              flushPendingLogs();
            }, 100);
          }

          if (data.action === 'finish' || data.action === 'error' || data.action === 'start') {
            if (activeProjectRef.current) fetchProjectState(activeProjectRef.current);
            fetchProjects();
          }
        } catch (err) {
          console.error('WS Parse Error:', err);
        }
      };

      socket.onclose = () => {
        setWsState('disconnected');
        if (isSubscribed) {
          reconnectAttemptRef.current += 1;
          const delay = Math.min(1000 * Math.pow(1.5, reconnectAttemptRef.current), 16000);
          reconnectTimerRef.current = setTimeout(connectWs, delay);
        }
      };
    };

    connectWs();

    return () => {
      isSubscribed = false;
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
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
  }, [authStatus, fetchProjectState, fetchProjects]);

  useEffect(() => {
    const socket = ws.current;
    if (authStatus === 'authenticated' && activeProjectId && socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: 'subscribe', projectId: activeProjectId }));
    }
  }, [activeProjectId, authStatus]);

  const onNodesChange = useCallback(changes => setNodes(nds => applyNodeChanges(changes, nds)), []);
  const onEdgesChange = useCallback(changes => setEdges(eds => applyEdgeChanges(changes, eds)), []);

  const handleLogin = async e => {
    e.preventDefault();
    setLoginError('');
    try {
      const data = await api.login(loginUsername, loginPassword);
      setCurrentUser(data.user);
      setLoginPassword('');
      setAuthStatus('authenticated');
    } catch (err) {
      setLoginError(err.message);
    }
  };

  const handleLogout = async () => {
    try {
      await api.logout();
    } finally {
      becomeAnonymous();
    }
  };

  const handleCreateProject = async () => {
    const title = prompt('Proje Başlığı Girin:', 'Yeni Otonom Proje');
    if (!title || !title.trim()) return;

    try {
      const newProj = await api.createProject(title.trim());
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
      await api.updateProject(id, { is_pinned: !currentPinState });
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
      await api.updateProject(id, { title: newTitle.trim() });
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
      await api.deleteProject(id);
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
      const targetState = id === activeProjectId ? projectState : await api.getProject(id);
      const latestArtifact = targetState?.latestArtifact;
      const contractId = targetState?.contractId || targetState?.contract_id || targetState?.plan?.contractId || 'current';
      if (latestArtifact && latestArtifact.id && latestArtifact.status === 'verified') {
        window.location.href = `/api/projects/${id}/contracts/${contractId}/artifacts/${latestArtifact.id}/download`;
        return;
      }
      const files = await api.getProjectFiles(id);
      if (!Array.isArray(files) || files.length === 0) {
        setUiError('İndirilecek kaynak dosyası bulunamadı.');
        return;
      }
      const [{ default: JSZipModule }, { saveAs: saveAsFn }] = await Promise.all([
        import('jszip'),
        import('file-saver')
      ]);
      const zip = new JSZipModule();
      files.forEach(f => {
        zip.file(f.path, f.content);
      });
      const blob = await zip.generateAsync({ type: 'blob' });
      saveAsFn(blob, `${projectTitle || id}.zip`);
    } catch (err) {
      setUiError('ZIP indirme hatası: ' + err.message);
    }
  };

  const handleSendMessage = async () => {
    if (!chatInput.trim() || !activeProjectId || isThinking) return;
    const message = chatInput;
    setChatInput('');
    setIsThinking(true);
    setProjectState(prev => ({
      ...prev,
      chatHistory: [...(prev?.chatHistory || []), { role: 'user', parts: [{ text: message }] }]
    }));

    try {
      const data = await api.sendChatMessage(activeProjectId, message);
      setProjectState(data);
    } catch (error) {
      setProjectState(prev => {
        const newHistory = (prev?.chatHistory || []).slice(0, -1);
        newHistory.push({ role: 'user', parts: [{ text: message }] });
        newHistory.push({ role: 'model', isError: true, parts: [{ text: `⚠️ Mesaj iletilemedi, lütfen tekrar deneyin.` }] });
        return { ...prev, chatHistory: newHistory };
      });
    } finally {
      setIsThinking(false);
      fetchProjects();
    }
  };

  const handleApprove = async () => {
    if (!activeProjectId) return;
    const { nodes: resetNodes, edges: resetEdges } = computeHierarchicalDAG([]);
    setNodes(resetNodes);
    setEdges(resetEdges);
    setLogs([]);
    setViewMode('flow');

    try {
      const data = await api.approveProject(activeProjectId);
      setProjectState(data);
      fetchProjects();
    } catch (err) {
      setUiError('Başlatma hatası: ' + err.message);
    }
  };

  const handleResume = async () => {
    if (!activeProjectId) return;
    setViewMode('flow');
    try {
      const data = await api.resumeProject(activeProjectId);
      setProjectState(data);
      fetchProjects();
    } catch (err) {
      setUiError('Devam ettirme hatası: ' + err.message);
    }
  };

  const handlePause = async () => {
    if (!activeProjectId) return;
    try {
      const data = await api.pauseProject(activeProjectId);
      setProjectState(data);
      fetchProjects();
    } catch (err) {
      setUiError('Durdurma hatası: ' + err.message);
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
      case 'failed':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-600 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
            <AlertCircle size={12} /> Hata / Durduruldu
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
      case 'veto':
        return <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-rose-100 text-rose-800 border border-rose-300">VETO</span>;
      case 'error':
        return <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-red-100 text-red-700 border border-red-200">ERROR</span>;
      default:
    }
  };

  if (authStatus === 'checking') {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-100 text-sm font-semibold text-slate-600">
        Oturum doğrulanıyor…
      </div>
    );
  }

  if (authStatus === 'anonymous') {
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
        handleCreateProject={handleCreateProject}
        handleTogglePin={handleTogglePin}
        handleRenameProject={handleRenameProject}
        handleDownloadProjectZip={handleDownloadProjectZip}
        handleDeleteProject={handleDeleteProject}
        loginUsername={currentUser?.username || loginUsername}
        handleLogout={handleLogout}
        getStatusBadge={getStatusBadge}
        readOnly={viewMode === 'dashboard'}
      />

      {/* MAIN AREA */}
      <div className="flex-1 flex flex-col min-w-0">
        {!projectState ? (
          <div className="flex-1 flex items-center justify-center text-gray-400 flex-col bg-white">
            <LayoutDashboard size={56} className="mb-4 text-indigo-300" />
            <h3 className="text-lg font-bold text-gray-700 mb-1">XFactor AI Orkestrasyon Platformu</h3>
            <p className="text-sm text-gray-500 mb-4">Sol menüden bir proje seçin veya yeni bir proje başlatın.</p>
            {viewMode !== 'dashboard' && (
              <button
                onClick={handleCreateProject}
                className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-4 py-2 rounded-lg flex items-center gap-2 shadow-sm transition"
              >
                <Plus size={16} /> Yeni Proje Başlat
              </button>
            )}
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
            <div className="flex-1 overflow-hidden flex flex-col relative">
              {viewMode === 'chat' && (
                <ChatView
                  projectState={projectState}
                  chatInput={chatInput}
                  setChatInput={setChatInput}
                  handleSendMessage={handleSendMessage}
                  handleApprove={handleApprove}
                  handleResume={handleResume}
                  setViewMode={setViewMode}
                  isThinking={isThinking}
                />
              )}

              {viewMode === 'flow' && (
                <DAGFlowView
                  nodes={nodes}
                  edges={edges}
                  onNodesChange={onNodesChange}
                  onEdgesChange={onEdgesChange}
                  projectId={activeProjectId}
                />
              )}

              {viewMode === 'logs' && (
                <LogsView
                  logs={logs}
                  projectState={projectState}
                  handleResume={handleResume}
                  wsReady={ws.current?.readyState === 1}
                  getActionBadge={getActionBadge}
                />
              )}
              {viewMode === 'dashboard' && (
                <DashboardView
                  projectId={activeProjectId}
                  projectTitle={projectState.title}
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
