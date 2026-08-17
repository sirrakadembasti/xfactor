import React, { useState, useEffect, useRef, useCallback } from 'react';
import ReactFlow, { Background, Controls, applyNodeChanges, applyEdgeChanges, MarkerType } from 'reactflow';
import 'reactflow/dist/style.css';
import {
  MessageSquare,
  LayoutDashboard,
  Pause,
  Play,
  Plus,
  Send,
  FileCode,
  Download,
  MoreVertical,
  Pin,
  PinOff,
  Edit2,
  Trash2,
  RefreshCw,
  Search,
  CheckCircle2,
  Clock,
  AlertCircle,
  FolderGit2,
  Terminal,
  Layers,
  Sparkles
} from 'lucide-react';
import Editor from '@monaco-editor/react';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { buildAuthHeaders, buildWebSocketUrl, getStoredToken } from './services/api';

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
  const [nodes, setNodes] = useState([{ id: 'manager', position: { x: 400, y: 50 }, data: { label: 'Manager' }, style: { background: '#2563eb', color: 'white', borderRadius: '8px', padding: '10px' } }]);
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
      console.error("fetchProjects error:", e);
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
      await authFetch(`${API_BASE}/projects/sync`, { method: "POST" });
      await fetchProjects();
    } catch (err) {
      console.error("Senkronizasyon hatası:", err);
    } finally {
      setIsSyncing(false);
    }
  };

  // Aktif proje değiştiğinde durumu çek ve uygun başlangıç görünümünü ayarla
  const fetchProjectState = async (id) => {
    try {
      const res = await authFetch(`${API_BASE}/projects/${id}`);
      const data = await res.json();
      setProjectState(data);

      // KURAL 1: Yeni veya planlama aşamasındaki projede CHAT ekranı açılır!
      if (data.status === 'planning' || data.status === 'pending_approval' || data.status === 'paused') {
        setViewMode('chat');
      } else if (data.status === 'running') {
        setViewMode('flow');
      } else if (data.status === 'completed') {
        setViewMode('flow');
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    if (activeProjectId) {
      fetchProjectState(activeProjectId);
      // Geçmiş Logları ve Grafiği Çek
      authFetch(`${API_BASE}/projects/${activeProjectId}/logs`)
        .then(res => res.json())
        .then(data => {
            if (!Array.isArray(data)) return;
            setLogs(data.slice().reverse());
            
            const newNodes = [{ id: 'manager', position: { x: 400, y: 50 }, data: { label: 'Manager' }, style: { background: '#2563eb', color: 'white', borderRadius: '8px', padding: '10px' } }];
            const newEdges = [];
            
            data.forEach(log => {
                if (log.node_id && !newNodes.find(n => n.id === log.node_id)) {
                    const yPos = log.agent === 'Director' ? 150 : log.agent === 'Teamleader' ? 250 : 350;
                    const xOffset = Math.random() * 200 - 100;
                    newNodes.push({
                        id: log.node_id,
                        position: { x: 400 + xOffset, y: yPos },
                        data: { label: `${log.agent}: ${log.node_id}` },
                        style: { background: log.agent === 'Director' ? '#10b981' : log.agent === 'Teamleader' ? '#f59e0b' : log.agent === 'System' ? '#ef4444' : '#8b5cf6', color: 'white', borderRadius: '8px', padding: '10px' }
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
        }).catch(e => console.error("Logs error:", e));
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
        }).catch(e => console.error("Files error:", e));
    }
  }, [projectState?.status, activeProjectId]);

  // WebSocket Canlı Akışı
  // WebSocket Canlı Akışı (Oturum başına 1 kez bağlanır, mükerrer soket oluşturmaz)
  useEffect(() => {
    if (!token) return;
    let reconnectTimeout;
    let isSubscribed = true;
    
    const connectWs = () => {
      if (!isSubscribed) return;
      if (ws.current && (ws.current.readyState === 0 || ws.current.readyState === 1)) {
        return; // Zaten bağlı
      }

      const socket = new WebSocket(WS_URL, [`xfactor-auth.${token}`]);
      ws.current = socket;
      
      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (activeProjectRef.current && data.projectId !== activeProjectRef.current) return;
          
          // Log Tekilleştirme (Deduplication)
          setLogs((prev) => {
            const isDup = prev.slice(0, 20).some(l =>
              (l.id && data.id && l.id === data.id) ||
              (l.timestamp === data.timestamp && l.agent === data.agent && l.action === data.action && l.node_id === data.node_id && l.message === data.message)
            );
            if (isDup) return prev;
            return [data, ...prev];
          });

          if (data.node_id) {
            setNodes((nds) => {
              if (!nds.find(n => n.id === data.node_id)) {
                const yPos = data.agent === 'Director' ? 150 : data.agent === 'Teamleader' ? 250 : 350;
                const xOffset = Math.random() * 200 - 100;
                return [...nds, {
                  id: data.node_id,
                  position: { x: 400 + xOffset, y: yPos },
                  data: { label: `${data.agent}: ${data.node_id}` },
                  style: { background: data.agent === 'Director' ? '#10b981' : data.agent === 'Teamleader' ? '#f59e0b' : data.agent === 'System' ? '#ef4444' : '#8b5cf6', color: 'white', borderRadius: '8px', padding: '10px' }
                }];
              }
              return nds;
            });
            if (data.parent_node_id) {
              setEdges((eds) => {
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
          console.error("WS Parse Error:", err);
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
      ws.current?.close();
      ws.current = null;
    };
  }, [token]);

  const onNodesChange = useCallback((changes) => setNodes((nds) => applyNodeChanges(changes, nds)), []);
  const onEdgesChange = useCallback((changes) => setEdges((eds) => applyEdgeChanges(changes, eds)), []);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginError('');
    try {
      const res = await fetch(`${API_BASE}/login`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: loginUsername, password: loginPassword })
      });
      const data = await res.json();
      if (res.ok) {
        setToken(data.token);
        localStorage.setItem('xfactor_token', data.token);
      } else {
        setLoginError(data.error || 'Giriş başarısız');
      }
    } catch (e) {
      setLoginError('Sunucuya bağlanılamadı');
    }
  };

  const handleLogout = () => {
    setToken(null);
    localStorage.removeItem('xfactor_token');
    setActiveProjectId(null);
    setProjects([]);
  };

  const handleCreateProject = async () => {
    const title = prompt("Yeni Proje Adı (Örn: kütüphane-otomasyonu):");
    if (!title || !title.trim()) return;
    try {
      const res = await authFetch(`${API_BASE}/projects`, {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: title.trim() })
      });
      const data = await res.json();
      await fetchProjects();
      setActiveProjectId(data.id);
      setViewMode('chat'); // Yeni projede beyin fırtınası CHAT ekranı açılır!
    } catch (err) {
      alert("Proje oluşturulamadı: " + err.message);
    }
  };

  const handleRenameProject = async (id, currentTitle, e) => {
    e?.stopPropagation();
    setActiveMenuProjectId(null);
    const newTitle = prompt("Projenin yeni adını girin:", currentTitle);
    if (!newTitle || !newTitle.trim() || newTitle.trim() === currentTitle) return;

    try {
      await authFetch(`${API_BASE}/projects/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newTitle.trim() })
      });
      await fetchProjects();
      if (activeProjectId === id) {
        setProjectState(prev => prev ? ({ ...prev, title: newTitle.trim() }) : prev);
      }
    } catch (err) {
      alert("Yeniden adlandırma başarısız: " + err.message);
    }
  };

  const handleTogglePin = async (id, currentPinned, e) => {
    e?.stopPropagation();
    setActiveMenuProjectId(null);
    try {
      await authFetch(`${API_BASE}/projects/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isPinned: !currentPinned })
      });
      await fetchProjects();
    } catch (err) {
      alert("Sabitleme işlemi başarısız: " + err.message);
    }
  };

  const handleDeleteProject = async (id, projectTitle, e) => {
    e?.stopPropagation();
    setActiveMenuProjectId(null);
    const confirmed = confirm(`"${projectTitle}" projesini ve tüm dosyalarını silmek istediğinize emin misiniz?`);
    if (!confirmed) return;

    try {
      await authFetch(`${API_BASE}/projects/${id}`, { method: "DELETE" });
      if (activeProjectId === id) {
        setActiveProjectId(null);
        setProjectState(null);
      }
      await fetchProjects();
    } catch (err) {
      alert("Proje silinemedi: " + err.message);
    }
  };

  const handleDownloadProjectZip = async (id, projectTitle, e) => {
    e?.stopPropagation();
    setActiveMenuProjectId(null);
    try {
      const res = await authFetch(`${API_BASE}/projects/${id}/files`);
      const files = await res.json();
      if (!files || !files.length) {
        alert("Bu projede henüz indirilecek dosya bulunmuyor.");
        return;
      }
      const zip = new JSZip();
      files.forEach(f => {
        zip.file(f.path, f.content);
      });
      const blob = await zip.generateAsync({ type: 'blob' });
      saveAs(blob, `${projectTitle || id}.zip`);
    } catch (err) {
      alert("ZIP indirme hatası: " + err.message);
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
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message })
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
      const res = await authFetch(`${API_BASE}/projects/${activeProjectId}/approve`, { method: "POST" });
      const data = await res.json();
      setProjectState(data);
      fetchProjects();
    } catch (err) {
      alert("Başlatma hatası: " + err.message);
    }
  };

  const handleResume = async () => {
    if (!activeProjectId) return;
    setViewMode('flow');
    try {
      const res = await authFetch(`${API_BASE}/projects/${activeProjectId}/resume`, { method: "POST" });
      const data = await res.json();
      setProjectState(data);
      fetchProjects();
    } catch (err) {
      alert("Devam ettirme hatası: " + err.message);
    }
  };

  const handlePause = async () => {
    if (!activeProjectId) return;
    try {
      const res = await authFetch(`${API_BASE}/projects/${activeProjectId}/pause`, { method: "POST" });
      const data = await res.json();
      setProjectState(data);
      fetchProjects();
    } catch (err) {
      alert("Durdurma hatası: " + err.message);
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'completed':
        return <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200"><CheckCircle2 size={12}/> Tamamlandı</span>;
      case 'running':
        return <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-200 animate-pulse"><Play size={12}/> Üretiliyor</span>;
      case 'paused':
        return <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-600 bg-amber-50 px-2 py-0.5 rounded border border-amber-200"><Pause size={12}/> Durduruldu</span>;
      case 'pending_approval':
        return <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-purple-600 bg-purple-50 px-2 py-0.5 rounded border border-purple-200"><AlertCircle size={12}/> Onay Bekliyor</span>;
      default:
        return <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-gray-500 bg-gray-100 px-2 py-0.5 rounded border border-gray-200"><Clock size={12}/> Planlama</span>;
    }
  };

  const getActionBadge = (action) => {
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

  const filteredProjects = projects.filter(p =>
    (p.title || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (!token) {
    return (
      <div className="flex items-center justify-center h-screen bg-indigo-50 font-sans">
        <div className="bg-white p-8 rounded-xl shadow-lg w-96">
          <div className="flex items-center justify-center gap-2 mb-2">
            <div className="w-9 h-9 bg-indigo-600 rounded-lg flex items-center justify-center text-white font-black text-xl">X</div>
            <h2 className="text-2xl font-bold text-indigo-700">XFactor</h2>
          </div>
          <p className="text-xs text-center text-gray-500 mb-6">Otonom AI Ajan Orkestrasyon Platformu</p>
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Kullanıcı Adı</label>
              <input type="text" value={loginUsername} onChange={e => setLoginUsername(e.target.value)} required className="w-full px-3 py-2 border rounded-md focus:outline-none focus:border-indigo-500" placeholder="admin" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Şifre</label>
              <input type="password" value={loginPassword} onChange={e => setLoginPassword(e.target.value)} required className="w-full px-3 py-2 border rounded-md focus:outline-none focus:border-indigo-500" placeholder="••••••••" />
            </div>
            {loginError && <div className="text-red-500 text-sm text-center font-medium">{loginError}</div>}
            <button type="submit" className="w-full bg-indigo-600 text-white py-2 rounded-md hover:bg-indigo-700 font-semibold transition">Giriş Yap</button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gray-50 font-sans text-gray-800">
      
      {/* SIDEBAR */}
      <div className="w-72 bg-white border-r flex flex-col shadow-sm z-20">
        
        {/* Sidebar Header */}
        <div className="p-3.5 border-b flex items-center justify-between bg-white">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-indigo-600 rounded-md flex items-center justify-center text-white font-black text-sm">X</div>
            <span className="font-bold text-base text-gray-900">XFactor Projeler</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={handleSyncProjects}
              title="Disk ile Senkronize Et"
              className={`p-1.5 hover:bg-gray-100 rounded text-gray-500 hover:text-indigo-600 transition ${isSyncing ? 'animate-spin text-indigo-600' : ''}`}
            >
              <RefreshCw size={16}/>
            </button>
            <button
              onClick={handleCreateProject}
              title="Yeni Proje Başlat"
              className="p-1.5 bg-indigo-50 hover:bg-indigo-100 rounded text-indigo-600 transition"
            >
              <Plus size={18}/>
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
              <FolderGit2 size={32} className="mx-auto mb-2 opacity-40"/>
              Henüz proje bulunmuyor.<br/>Yeni proje başlatabilirsiniz.
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
                  <div>
                    {getStatusBadge(p.status)}
                  </div>
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
              <Plus size={16}/> Yeni Proje Başlat
            </button>
          </div>
        ) : (
          <>
            {/* Top Header */}
            <div className="h-14 bg-white border-b px-6 flex items-center justify-between shadow-sm z-10">
              <div className="flex items-center gap-3 min-w-0">
                <h2 className="font-bold text-base text-gray-900 truncate">{projectState.title}</h2>
                <div>{getStatusBadge(projectState.status)}</div>
              </div>

              {/* Action Buttons in Header */}
              <div className="flex items-center gap-2">
                
                {/* View Mode Switcher (Sohbet / DAG Grafiği) */}
                <div className="flex bg-gray-100 p-0.5 rounded-lg border border-gray-200 mr-2">
                  <button
                    onClick={() => {
                      setViewMode('chat');
                      if (activeProjectId) fetchProjectState(activeProjectId);
                    }}
                    className={`px-3 py-1 text-xs font-semibold rounded-md flex items-center gap-1.5 transition ${
                      viewMode === 'chat' ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    <MessageSquare size={14} /> Sohbet & Mimari
                  </button>
                  <button
                    onClick={() => setViewMode('flow')}
                    className={`px-3 py-1 text-xs font-semibold rounded-md flex items-center gap-1.5 transition ${
                      viewMode === 'flow' ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    <Layers size={14} /> Canlı DAG Grafiği
                  </button>
                  {projectState.status === 'completed' && (
                    <button
                      onClick={() => setViewMode('ide')}
                      className={`px-3 py-1 text-xs font-semibold rounded-md flex items-center gap-1.5 transition ${
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
                    <Play size={14}/> Planı Onayla ve Başlat
                  </button>
                )}

                {/* Running Button */}
                {projectState.status === 'running' && (
                  <button
                    onClick={handlePause}
                    className="bg-amber-500 hover:bg-amber-600 text-white px-4 py-1.5 rounded-lg flex items-center gap-1.5 text-xs font-bold shadow-sm transition"
                  >
                    <Pause size={14}/> Süreci Duraklat
                  </button>
                )}

                {/* Paused: Active Resume Button */}
                {projectState.status === 'paused' && (
                  <button
                    onClick={handleResume}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-1.5 rounded-lg flex items-center gap-1.5 text-xs font-bold shadow-sm transition animate-pulse"
                    title="Kaldığı görevden devam ettir"
                  >
                    <Play size={14}/> Projeyi Devam Ettir (Resume)
                  </button>
                )}

                {/* Completed Download Button */}
                {projectState.status === 'completed' && (
                  <button
                    onClick={() => handleDownloadProjectZip(activeProjectId, projectState.title)}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white px-3.5 py-1.5 rounded-lg flex items-center gap-1.5 text-xs font-bold transition shadow-sm"
                  >
                    <Download size={14}/> Projeyi (ZIP) İndir
                  </button>
                )}
              </div>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-hidden flex relative">
              
              {/* CHAT VIEW: Manager Brainstorming & Architecture Discussion */}
              {viewMode === 'chat' && (
                <div className="flex-1 flex flex-col bg-white">
                  <div className="flex-1 overflow-y-auto p-6 space-y-5">
                    {(projectState.chatHistory || []).map((msg, i) => (
                      <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[75%] p-4 rounded-xl shadow-sm ${
                          msg.role === 'user'
                            ? 'bg-indigo-600 text-white rounded-br-none'
                            : msg.isError
                            ? 'bg-red-100 text-red-800 rounded-bl-none border border-red-300 font-medium'
                            : 'bg-gray-100 text-gray-800 rounded-bl-none'
                        }`}>
                          <pre className="whitespace-pre-wrap font-sans text-sm">{msg.parts?.[0]?.text || ''}</pre>
                          {msg.timestamp && (
                            <div className={`text-[10px] mt-2 flex items-center gap-1 font-mono ${
                              msg.role === 'user' ? 'text-indigo-200 justify-end' : 'text-gray-400 justify-start'
                            }`}>
                              <Clock size={10} />
                              <span>{msg.timestamp}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Pending Approval Banner */}
                  {projectState.status === 'pending_approval' && (
                    <div className="mx-6 mb-3 p-4 bg-emerald-50 border-2 border-emerald-400 rounded-xl flex items-center justify-between shadow-md">
                      <div>
                        <h4 className="font-bold text-emerald-900 text-sm flex items-center gap-2">
                          <Play size={16} className="text-emerald-600" /> Mimari Plan Hazırlandı — Onayınız Bekleniyor
                        </h4>
                        <p className="text-emerald-700 text-xs mt-1">
                          Manager mimari şartnameyi hazırladı. Onay verdiğinizde otonom ajan üretim süreci başlayacaktır.
                        </p>
                      </div>
                      <button
                        onClick={handleApprove}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg font-bold text-xs shadow-sm flex items-center gap-2 transition shrink-0"
                      >
                        <Play size={15} /> Planı Onayla ve Başlat
                      </button>
                    </div>
                  )}

                  {/* Paused Banner with Active Resume Button */}
                  {projectState.status === 'paused' && (
                    <div className="mx-6 mb-3 p-4 bg-amber-50 border-2 border-amber-400 rounded-xl flex items-center justify-between shadow-md">
                      <div>
                        <h4 className="font-bold text-amber-900 text-sm flex items-center gap-2">
                          <Pause size={16} className="text-amber-600" /> Süreç Durduruldu — Müdahale / Devam Modu
                        </h4>
                        <p className="text-amber-700 text-xs mt-1">
                          Aşağıdan Manager ile mimari değişiklikleri tartışabilir veya projeyi kaldığı görevden devam ettirebilirsiniz.
                        </p>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <button
                          onClick={() => setViewMode('flow')}
                          className="bg-white hover:bg-gray-100 text-gray-700 px-3 py-2 rounded-lg font-semibold text-xs border border-gray-300 transition"
                        >
                          Grafiği Gör
                        </button>
                        <button
                          onClick={handleResume}
                          className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg font-bold text-xs shadow-sm flex items-center gap-1.5 transition"
                        >
                          <Play size={14} /> Devam Et (Resume)
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Chat Input */}
                  <div className="p-4 bg-gray-50 border-t">
                    <div className="flex gap-2 max-w-4xl mx-auto">
                      <input 
                        type="text" 
                        value={chatInput} 
                        onChange={e => setChatInput(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleSendMessage()}
                        placeholder="Manager ile mimariyi tartışın, isteklerinizi veya revizyonlarınızı yazın..." 
                        className="flex-1 border border-gray-300 rounded-full px-5 py-2.5 text-sm focus:outline-none focus:border-indigo-500 shadow-sm"
                      />
                      <button
                        onClick={handleSendMessage}
                        className="bg-indigo-600 text-white p-2.5 rounded-full hover:bg-indigo-700 shadow-sm transition"
                        title="Gönder"
                      >
                        <Send size={18} />
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* REACT FLOW DAG & LOGS VIEW */}
              {viewMode === 'flow' && (
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
                        <Terminal size={15} className="text-indigo-400"/> CANLI SÜREÇ İZLEME LOGLARI ({logs.length} Kayıt)
                      </span>
                      <div className="flex items-center gap-3">
                        {projectState.status === 'paused' && (
                          <button
                            onClick={handleResume}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1 rounded text-xs font-bold flex items-center gap-1 shadow-sm"
                          >
                            <Play size={12}/> Süreci Devam Ettir
                          </button>
                        )}
                        <span className="text-[11px]">{ws.current?.readyState === 1 ? '🟢 Canlı Akış Aktif' : '🔴 Bağlantı Yok'}</span>
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
                              <td colSpan={6} className="text-gray-400 p-8 text-center font-sans">Henüz log kaydı bulunmuyor.</td>
                            </tr>
                          ) : (
                            logs.map((log, idx) => (
                              <tr key={idx} className="hover:bg-gray-50/80 transition-colors">
                                <td className="py-1.5 px-3 whitespace-nowrap text-gray-500 text-[11px]">
                                  {log.timestamp || log.created_at || '—'}
                                </td>
                                <td className="py-1.5 px-3 font-semibold text-gray-800">
                                  {log.agent || '—'}
                                </td>
                                <td className="py-1.5 px-3">
                                  {getActionBadge(log.action)}
                                </td>
                                <td className="py-1.5 px-3 text-gray-600 text-[11px] truncate max-w-xs" title={log.file}>
                                  {log.file || '—'}
                                </td>
                                <td className="py-1.5 px-3 text-gray-400 text-[10px] truncate max-w-[120px]" title={log.node_id}>
                                  {log.node_id || '—'}
                                </td>
                                <td className="py-1.5 px-3 text-gray-900 font-sans text-xs">
                                  {log.message}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* IDE VIEW: For completed projects */}
              {viewMode === 'ide' && (
                <div className="flex-1 flex">
                    <div className="w-64 bg-gray-50 border-r flex flex-col">
                        <div className="p-3 font-bold text-xs border-b bg-gray-200 text-gray-700 uppercase tracking-wide">Üretilen Dosyalar ({projectFiles.length})</div>
                        <div className="flex-1 overflow-y-auto">
                            {projectFiles.map((f, i) => (
                                <div
                                  key={i}
                                  onClick={() => setActiveFile(f)}
                                  className={`p-2.5 text-xs cursor-pointer border-b truncate hover:bg-indigo-50 flex items-center gap-2.5 transition-colors ${
                                    activeFile?.path === f.path ? 'bg-indigo-100 font-semibold border-l-4 border-indigo-600 text-indigo-900' : 'text-gray-700'
                                  }`}
                                >
                                    <FileCode size={15} className={activeFile?.path === f.path ? "text-indigo-600 shrink-0" : "text-gray-400 shrink-0"} />
                                    <span className="truncate">{f.path}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                    <div className="flex-1 bg-[#1e1e1e] flex flex-col">
                        {activeFile ? (
                          <>
                            <div className="bg-[#252526] text-gray-300 px-4 py-2 text-xs border-b border-[#333] flex items-center justify-between">
                              <span className="font-mono text-indigo-300">{activeFile.path}</span>
                              <span className="text-[11px] text-gray-500">{activeFile.content.length} karakter</span>
                            </div>
                            <div className="flex-1">
                              <Editor
                                  height="100%"
                                  language={
                                    activeFile.path.endsWith('.json') ? 'json' :
                                    activeFile.path.endsWith('.md') ? 'markdown' :
                                    activeFile.path.endsWith('.css') ? 'css' :
                                    activeFile.path.endsWith('.html') ? 'html' :
                                    activeFile.path.endsWith('.prisma') ? 'graphql' :
                                    activeFile.path.endsWith('.sql') ? 'sql' :
                                    activeFile.path.endsWith('.ts') || activeFile.path.endsWith('.tsx') ? 'typescript' :
                                    'javascript'
                                  }
                                  theme="vs-dark"
                                  value={activeFile.content}
                                  options={{ readOnly: true, minimap: { enabled: false }, fontSize: 13 }}
                              />
                            </div>
                          </>
                        ) : (
                            <div className="flex-1 h-full flex items-center justify-center text-gray-500 text-sm">Görüntülemek için soldan bir dosya seçin.</div>
                        )}
                    </div>
                </div>
              )}

            </div>
          </>
        )}
      </div>
    </div>
  );
}
