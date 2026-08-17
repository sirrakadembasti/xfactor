const DEFAULT_API_URL = import.meta.env?.VITE_API_BASE || 'http://127.0.0.1:8000/api';

export const getStoredToken = () => {
  if (typeof window !== 'undefined' && window.localStorage) {
    return window.localStorage.getItem('xfactor_token') || null;
  }
  if (typeof globalThis !== 'undefined' && globalThis.localStorage) {
    return globalThis.localStorage.getItem('xfactor_token') || null;
  }
  return null;
};

export const setStoredToken = (token) => {
  if (typeof window !== 'undefined' && window.localStorage) {
    if (token) {
      window.localStorage.setItem('xfactor_token', token);
    } else {
      window.localStorage.removeItem('xfactor_token');
    }
  }
};

export const clearStoredToken = () => {
  setStoredToken(null);
};

export const buildApiUrl = (baseUrl = DEFAULT_API_URL, path = '') => {
  const base = String(baseUrl || DEFAULT_API_URL).replace(/\/+$/, '');
  const relativePath = String(path || '').replace(/^\/+/, '');
  if (!relativePath) return base;
  return `${base}/${relativePath}`;
};

export const buildWebSocketUrl = (apiBaseUrl = DEFAULT_API_URL, token = '') => {
  const base = String(apiBaseUrl || DEFAULT_API_URL).replace(/^http/, 'ws').replace(/\/+$/, '');
  const wsBase = base.replace(/\/api$/, '');
  void token;
  return `${wsBase}/ws/logs`;
};

export const buildAuthHeaders = (token, extraHeaders = {}) => {
  const headers = { ...extraHeaders };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
};

export const createApiClient = (baseURL = DEFAULT_API_URL) => {
  const request = async (endpoint, options = {}) => {
    const token = getStoredToken();
    const headers = buildAuthHeaders(token, {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    });

    const url = buildApiUrl(baseURL, endpoint);
    const res = await fetch(url, { ...options, headers });

    if (res.status === 401) {
      clearStoredToken();
      throw new Error('Oturum süresi doldu veya yetkisiz erişim.');
    }

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(errorData.error || `HTTP error ${res.status}`);
    }

    return res.json();
  };

  return {
    // Auth
    login: (username, password) =>
      request('/login', {
        method: 'POST',
        body: JSON.stringify({ username, password })
      }),

    // Projects
    getProjects: () => request('/projects'),
    getProject: (id) => request(`/projects/${id}`),
    createProject: (title) =>
      request('/projects', {
        method: 'POST',
        body: JSON.stringify({ title })
      }),

    // Project Files & Logs
    getProjectFiles: (id) => request(`/projects/${id}/files`),
    getProjectLogs: (id) => request(`/projects/${id}/logs`),

    // Execution & Interaction
    sendChatMessage: (id, message) =>
      request(`/projects/${id}/chat`, {
        method: 'POST',
        body: JSON.stringify({ message })
      }),

    approveProject: (id) =>
      request(`/projects/${id}/approve`, {
        method: 'POST'
      }),
    pauseProject: (id) =>
      request(`/projects/${id}/pause`, {
        method: 'POST'
      }),

    resumeProject: (id) =>
      request(`/projects/${id}/resume`, {
        method: 'POST'
      }),

    updateProject: (id, updates) =>
      request(`/projects/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(updates)
      }),

    deleteProject: (id) =>
      request(`/projects/${id}`, {
        method: 'DELETE'
      }),

    syncProjects: () =>
      request('/projects/sync', {
        method: 'POST'
      })
  };
};
export const api = createApiClient();
