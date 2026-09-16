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
import { api, buildWebSocketUrl, requestVerifiedArtifactDownload, ApiError } from './services/api';
import { computeHierarchicalDAG, getAgentVisualTheme } from './utils/dagLayout';
import LoginView from './components/LoginView';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import ChatView from './components/ChatView';
import DAGFlowView from './components/DAGFlowView';
import LogsView from './components/LogsView';
import IDEView from './components/IDEView';
import DashboardView from './components/DashboardView';

// XFactor Modular Dashboard: Supports pending_approval ('Planı Onayla ve Başlat') and ReactFlow DAG view.
const MAX_LOGS = 500;
export default function App() {
  const [authStatus, setAuthStatus] = useState('checking');
  const [currentUser, setCurrentUser] = useState(null);
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginTotp, setLoginTotp] = useState('');
  const [mfaRequired, setMfaRequired] = useState(false);
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
  const uiErrorRef = useRef(null);
  const uiErrorTriggerRef = useRef(null);
  const rememberUiErrorTrigger = useCallback(trigger => {
    const candidate = trigger?.currentTarget
      || (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    if (candidate && candidate !== document.body) uiErrorTriggerRef.current = candidate;
  }, []);
  const dismissUiError = useCallback(() => {
    setUiError('');
    const trigger = uiErrorTriggerRef.current;
    uiErrorTriggerRef.current = null;
    if (trigger?.isConnected) trigger.focus();
  }, []);
  useEffect(() => {
    if (uiError) uiErrorRef.current?.focus();
  }, [uiError]);

  const [projectState, setProjectState] = useState(null);
  const projectStateRef = useRef(projectState);
  useEffect(() => {
    projectStateRef.current = projectState;
  }, [projectState]);
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

  const filesAbortRef = useRef(null);
  const authEpochRef = useRef(0);
  const projectEpochRef = useRef(0);
  const requestSeqRef = useRef(new Map());
  const logoutPendingRef = useRef(null);
  const [logoutPending, setLogoutPending] = useState(false);
  const wsBatchRef = useRef(null);
  const beginRequest = useCallback(key => {
    const next = (requestSeqRef.current.get(key) || 0) + 1;
    requestSeqRef.current.set(key, next);
    return next;
  }, []);
  const isCurrentRequest = useCallback(({ authEpoch, projectId, key, sequence }) => (
    authEpoch === authEpochRef.current
    && projectId === activeProjectRef.current
    && requestSeqRef.current.get(key) === sequence
  ), []);
  const captureRequest = useCallback((key, projectId = activeProjectRef.current) => ({
    authEpoch: authEpochRef.current,
    projectId,
    key,
    sequence: beginRequest(key)
  }), [beginRequest]);


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
    authEpochRef.current += 1;
    projectEpochRef.current += 1;
    requestSeqRef.current.clear();
    if (projectAbortRef.current) {
      projectAbortRef.current.abort();
      projectAbortRef.current = null;
    }
    if (filesAbortRef.current) {
      filesAbortRef.current.abort();
      filesAbortRef.current = null;
    }
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (wsBatchRef.current) {
      clearTimeout(wsBatchRef.current.timer);
      wsBatchRef.current = null;
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
    setUiError('');
    setLoginPassword('');
    setLoginTotp('');
    setMfaRequired(false);
    setLoginError('');
  }, []);

  const becomeAnonymous = useCallback(() => {
    clearAccountState();
    setCurrentUser(null);
    setAuthStatus('anonymous');
  }, [clearAccountState]);

  useEffect(() => {
    let active = true;
    const identity = captureRequest('session', null);
    api.getSession()
      .then(data => {
        if (!active || !isCurrentRequest(identity)) return;
        setCurrentUser(data.user);
        setAuthStatus('authenticated');
      })
      .catch(() => {
        if (active && isCurrentRequest(identity)) becomeAnonymous();
      });
    return () => {
      active = false;
    };
  }, [becomeAnonymous, captureRequest, isCurrentRequest]);

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
    const identity = {
      authEpoch: authEpochRef.current,
      projectId: activeProjectRef.current,
      key: 'projects',
      sequence: beginRequest('projects')
    };
    isPollingRef.current = true;
    try {
      const data = await api.getProjects();
      if (!isCurrentRequest(identity)) return;
      const list = Array.isArray(data) ? data : [];
      setProjects(list);
      setActiveProjectId(currentId => {
        if (identity.authEpoch !== authEpochRef.current) return currentId;
        if (currentId && list.some(p => p.id === currentId)) return currentId;
        return list.length > 0 ? list[0].id : null;
      });
    } catch (e) {
      if (!isCurrentRequest(identity)) return;
      if (e instanceof ApiError && e.status === 401) becomeAnonymous();
    } finally {
      isPollingRef.current = false;
    }
  }, [authStatus, beginRequest, becomeAnonymous, isCurrentRequest]);

  useEffect(() => {
    if (authStatus !== 'authenticated') return;
    fetchProjects();
    const interval = setInterval(fetchProjects, 4000);
    return () => clearInterval(interval);
  }, [authStatus, fetchProjects]);

  // Aktif proje değiştiğinde durumu çek (F-03 Fix: Request cancellation & sequence identity)
  const fetchProjectState = useCallback(async (id, signal) => {
    const identity = {
      authEpoch: authEpochRef.current,
      projectId: id,
      key: 'projectState',
      sequence: beginRequest('projectState')
    };
    try {
      const data = await api.getProject(id, { signal });
      if (!isCurrentRequest(identity)) return null;
      setProjectState(data);
      if (data?.plan) {
        setLogs(currentLogs => {
          const { nodes: computedNodes, edges: computedEdges } = computeHierarchicalDAG(currentLogs, data.plan);
          setNodes(computedNodes);
          setEdges(computedEdges);
          return currentLogs;
        });
      }
      return data;
    } catch (e) {
      if (e.name === 'AbortError' || !isCurrentRequest(identity)) return null;
      if (e instanceof ApiError && e.status === 401) becomeAnonymous();
      return null;
    }
  }, [beginRequest, becomeAnonymous, isCurrentRequest]);

  useEffect(() => {
    projectEpochRef.current += 1;
    if (projectAbortRef.current) projectAbortRef.current.abort();
    if (filesAbortRef.current) filesAbortRef.current.abort();
    projectAbortRef.current = null;
    filesAbortRef.current = null;
    if (wsBatchRef.current) {
      clearTimeout(wsBatchRef.current.timer);
      wsBatchRef.current = null;
    }

    setProjectState(null);
    setProjectFiles([]);
    setActiveFile(null);
    setIsThinking(false);
    setLogs([]);
    const emptyDag = computeHierarchicalDAG([]);
    setNodes(emptyDag.nodes);
    setEdges(emptyDag.edges);

    if (!activeProjectId) return;

    const controller = new AbortController();
    projectAbortRef.current = controller;
    const authEpoch = authEpochRef.current;
    const projectId = activeProjectId;
    const logIdentity = {
      authEpoch,
      projectId,
      key: 'logs',
      sequence: beginRequest('logs')
    };
    setViewMode(window.location.pathname === '/dashboard' ? 'dashboard' : 'chat');
    fetchProjectState(projectId, controller.signal);

    api.getProjectLogs(projectId, { signal: controller.signal })
      .then(data => {
        if (!Array.isArray(data) || !isCurrentRequest(logIdentity)) return;
        const sortedLogs = data.slice(-MAX_LOGS).reverse();
        setLogs(sortedLogs);
        const { nodes: computedNodes, edges: computedEdges } = computeHierarchicalDAG(sortedLogs, projectStateRef.current?.plan);
        setNodes(computedNodes);
        setEdges(computedEdges);
      })
      .catch(e => {
        if (e.name !== 'AbortError' && isCurrentRequest(logIdentity)) console.error('Logs error:', e);
      });

    return () => {
      controller.abort();
      if (projectAbortRef.current === controller) projectAbortRef.current = null;
    };
  }, [activeProjectId, beginRequest, fetchProjectState, isCurrentRequest]);

  // Proje tamamlandığında dosyaları çek
  useEffect(() => {
    if (filesAbortRef.current) filesAbortRef.current.abort();
    filesAbortRef.current = null;
    if (projectState?.status !== 'completed' || !activeProjectId) return;

    const controller = new AbortController();
    filesAbortRef.current = controller;
    const identity = {
      authEpoch: authEpochRef.current,
      projectId: activeProjectId,
      key: 'files',
      sequence: beginRequest('files')
    };
    api.getProjectFiles(activeProjectId, { signal: controller.signal })
      .then(data => {
        if (!Array.isArray(data) || !isCurrentRequest(identity)) return;
        setProjectFiles(data);
        setActiveFile(data[0] || null);
      })
      .catch(e => {
        if (e.name !== 'AbortError' && isCurrentRequest(identity)) console.error('Files error:', e);
      });

    return () => {
      controller.abort();
      if (filesAbortRef.current === controller) filesAbortRef.current = null;
    };
  }, [activeProjectId, beginRequest, isCurrentRequest, projectState?.status]);

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

      socket.onerror = () => {};

      const flushPendingLogs = () => {
        const batch = wsBatchRef.current;
        wsBatchRef.current = null;
        if (!batch) return;
        if (
          batch.authEpoch !== authEpochRef.current
          || batch.projectEpoch !== projectEpochRef.current
          || batch.projectId !== activeProjectRef.current
        ) return;

        setLogs(prev => {
          if (
            batch.authEpoch !== authEpochRef.current
            || batch.projectEpoch !== projectEpochRef.current
            || batch.projectId !== activeProjectRef.current
          ) return prev;
          const newLogs = [...batch.items].reverse().concat(prev).slice(0, MAX_LOGS);
          const { nodes: computedNodes, edges: computedEdges } = computeHierarchicalDAG(newLogs, projectStateRef.current?.plan);
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
          const projectId = activeProjectRef.current;
          if (data.projectId !== activeProjectRef.current) return;

          // pendingLogBatch queue
          let batch = wsBatchRef.current;
          if (
            !batch
            || batch.authEpoch !== authEpochRef.current
            || batch.projectEpoch !== projectEpochRef.current
            || batch.projectId !== projectId
          ) {
            if (batch) clearTimeout(batch.timer);
            batch = {
              authEpoch: authEpochRef.current,
              projectEpoch: projectEpochRef.current,
              projectId,
              items: [],
              timer: null
            };
            wsBatchRef.current = batch;
          }
          batch.items.push(data);
          if (!batch.timer) {
            batch.timer = setTimeout(flushPendingLogs, 100);
          }

          if (data.action === 'finish' || data.action === 'error' || data.action === 'start') {
            if (projectId) fetchProjectState(projectId);
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
      if (wsBatchRef.current) {
        clearTimeout(wsBatchRef.current.timer);
        wsBatchRef.current = null;
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

  const cancelMfa = useCallback(() => {
    setLoginPassword('');
    setLoginTotp('');
    setMfaRequired(false);
    setLoginError('');
  }, []);

  const handleLogin = async e => {
    e.preventDefault();
    if (logoutPendingRef.current) return;
    const identity = captureRequest('login', null);
    setLoginError('');
    try {
      const data = await api.login(loginUsername, loginPassword, loginTotp);
      if (!isCurrentRequest(identity)) return;
      if (data.mfaRequired) {
        setLoginTotp('');
        setMfaRequired(true);
        return;
      }
      authEpochRef.current += 1;
      setLoginPassword('');
      setLoginTotp('');
      setMfaRequired(false);
      setCurrentUser(data.user);
      setAuthStatus('authenticated');
    } catch (err) {
      if (isCurrentRequest(identity)) setLoginError(err.message);
    }
  };

  const handleLogout = async () => {
    const token = Symbol('logout');
    logoutPendingRef.current = token;
    setLogoutPending(true);
    becomeAnonymous();
    try {
      await api.logout();
    } catch {
      // Logout is best-effort; local state was invalidated before the request.
    } finally {
      if (logoutPendingRef.current === token) {
        logoutPendingRef.current = null;
        setLogoutPending(false);
      }
    }
  };

  const handleCreateProject = async () => {
    const title = prompt('Proje Başlığı Girin:', 'Yeni Otonom Proje');
    if (!title || !title.trim()) return;
    const identity = captureRequest('createProject');

    try {
      const newProj = await api.createProject(title.trim());
      if (!isCurrentRequest(identity)) return;
      await fetchProjects();
      if (isCurrentRequest(identity)) setActiveProjectId(newProj.id);
    } catch (e) {
      if (isCurrentRequest(identity)) alert('Proje oluşturulamadı: ' + e.message);
    }
  };

  const handleTogglePin = async (id, currentPinState, e) => {
    e?.stopPropagation();
    setActiveMenuProjectId(null);
    const identity = captureRequest('togglePin');
    try {
      await api.updateProject(id, { is_pinned: !currentPinState });
      if (isCurrentRequest(identity)) fetchProjects();
    } catch (err) {
      if (isCurrentRequest(identity)) alert('Sabitleme hatası: ' + err.message);
    }
  };

  const handleRenameProject = async (id, currentTitle, e) => {
    e?.stopPropagation();
    setActiveMenuProjectId(null);
    const newTitle = prompt('Yeni Proje Başlığı:', currentTitle);
    if (!newTitle || !newTitle.trim() || newTitle === currentTitle) return;
    const identity = captureRequest('renameProject');

    try {
      await api.updateProject(id, { title: newTitle.trim() });
      if (!isCurrentRequest(identity)) return;
      await fetchProjects();
      if (isCurrentRequest(identity) && activeProjectRef.current === id) fetchProjectState(id);
    } catch (err) {
      if (isCurrentRequest(identity)) alert('Yeniden adlandırma hatası: ' + err.message);
    }
  };

  const handleDeleteProject = async (id, projectTitle, e) => {
    e?.stopPropagation();
    setActiveMenuProjectId(null);
    if (!confirm(`"${projectTitle}" projesini ve tüm dosyalarını silmek istediğinize emin misiniz?`)) return;
    const identity = captureRequest('deleteProject');

    try {
      await api.deleteProject(id);
      if (!isCurrentRequest(identity)) return;
      if (activeProjectRef.current === id) setActiveProjectId(null);
      fetchProjects();
    } catch (err) {
      if (isCurrentRequest(identity)) alert('Silme hatası: ' + err.message);
    }
  };

  const handleDownloadProjectZip = async (id, event) => {
    // /contracts/${contractId}/artifacts/${latestArtifact.id}/download
    rememberUiErrorTrigger(event);
    setActiveMenuProjectId(null);
    const identity = captureRequest('downloadProject');
    try {
      await requestVerifiedArtifactDownload({
        projectId: id,
        activeProjectId,
        projectState,
        getProject: api.getProject,
        navigate: window.location.assign.bind(window.location)
      });
      if (!isCurrentRequest(identity)) return;
    } catch {
      if (isCurrentRequest(identity)) setUiError('Bu proje için doğrulanmış ZIP artefaktı bulunmuyor.');
    }
  };

  const handleSendMessage = async () => {
    if (!chatInput.trim() || !activeProjectId || isThinking) return;
    const message = chatInput;
    const identity = captureRequest('chat', activeProjectId);
    setChatInput('');
    setIsThinking(true);
    setProjectState(prev => ({
      ...prev,
      chatHistory: [...(prev?.chatHistory || []), { role: 'user', parts: [{ text: message }] }]
    }));

    try {
      const data = await api.sendChatMessage(activeProjectId, message);
      if (isCurrentRequest(identity)) setProjectState(data);
    } catch (error) {
      if (isCurrentRequest(identity)) {
        setProjectState(prev => {
          const newHistory = (prev?.chatHistory || []).slice(0, -1);
          newHistory.push({ role: 'user', parts: [{ text: message }] });
          newHistory.push({ role: 'model', isError: true, parts: [{ text: '⚠️ Mesaj iletilemedi, lütfen tekrar deneyin.' }] });
          return { ...prev, chatHistory: newHistory };
        });
      }
    } finally {
      if (isCurrentRequest(identity)) {
        setIsThinking(false);
        fetchProjects();
      }
    }
  };

  const handleApprove = async event => {
    if (!activeProjectId) return;
    rememberUiErrorTrigger(event);
    const identity = captureRequest('approve', activeProjectId);
    const { nodes: resetNodes, edges: resetEdges } = computeHierarchicalDAG([], projectState?.plan || projectStateRef.current?.plan);
    setNodes(resetNodes);
    setEdges(resetEdges);
    setLogs([]);
    setViewMode('flow');

    try {
      const data = await api.approveProject(activeProjectId);
      if (isCurrentRequest(identity)) {
        setProjectState(data);
        fetchProjects();
      }
    } catch (err) {
      if (isCurrentRequest(identity)) setUiError('Başlatma hatası: ' + err.message);
    }
  };

  const handleResume = async event => {
    if (!activeProjectId) return;
    rememberUiErrorTrigger(event);
    const identity = captureRequest('resume', activeProjectId);
    setViewMode('flow');
    try {
      const data = await api.resumeProject(activeProjectId);
      if (isCurrentRequest(identity)) {
        setProjectState(data);
        fetchProjects();
      }
    } catch (err) {
      if (isCurrentRequest(identity)) setUiError('Devam ettirme hatası: ' + err.message);
    }
  };

  const handlePause = async event => {
    if (!activeProjectId) return;
    rememberUiErrorTrigger(event);
    const identity = captureRequest('pause', activeProjectId);
    try {
      const data = await api.pauseProject(activeProjectId);
      if (isCurrentRequest(identity)) {
        setProjectState(data);
        fetchProjects();
      }
    } catch (err) {
      if (isCurrentRequest(identity)) setUiError('Durdurma hatası: ' + err.message);
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
        mfaRequired={mfaRequired}
        loginTotp={loginTotp}
        setLoginTotp={setLoginTotp}
        cancelMfa={cancelMfa}
        logoutPending={logoutPending}
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
        handleDeleteProject={handleDeleteProject}
        loginUsername={currentUser?.username || loginUsername}
        handleLogout={handleLogout}
        getStatusBadge={getStatusBadge}
        readOnly={viewMode === 'dashboard'}
      />

      {/* MAIN AREA */}
      <div className="flex-1 flex flex-col min-w-0">
        {uiError && (
          <div
            ref={uiErrorRef}
            role="alert"
            tabIndex="-1"
            className="flex items-center justify-between gap-3 bg-red-50 px-4 py-3 text-sm text-red-800"
          >
            <span>{uiError}</span>
            <button type="button" onClick={dismissUiError} className="font-semibold underline">
              Kapat
            </button>
          </div>
        )}
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
              wsState={wsState}
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
