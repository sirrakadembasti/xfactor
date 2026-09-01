const LOCAL_API_URL = 'http://127.0.0.1:8000/api';

export const resolveApiBaseUrl = (
  configuredBase = '',
  locationLike = typeof globalThis !== 'undefined' ? globalThis.location : null,
  production = import.meta.env?.PROD === true
) => {
  const configured = String(configuredBase || '').trim();
  const browserOrigin = String(locationLike?.origin || '').replace(/\/+$/, '');
  const candidate = configured || (browserOrigin ? `${browserOrigin}/api` : LOCAL_API_URL);

  let resolved;
  try {
    resolved = new URL(candidate, browserOrigin || undefined);
  } catch {
    throw new Error('Geçersiz API endpoint yapılandırması.');
  }

  if (!['http:', 'https:'].includes(resolved.protocol)) {
    throw new Error('API endpoint HTTP veya HTTPS kullanmalıdır.');
  }
  if (production && resolved.protocol !== 'https:') {
    throw new Error('Production API endpoint HTTPS kullanmalıdır.');
  }

  return resolved.toString().replace(/\/+$/, '');
};

export const API_BASE_URL = resolveApiBaseUrl(import.meta.env?.VITE_API_BASE);
const DEFAULT_API_URL = API_BASE_URL;


export const buildApiUrl = (baseUrl = DEFAULT_API_URL, path = '') => {
  const base = String(baseUrl || DEFAULT_API_URL).replace(/\/+$/, '');
  const relativePath = String(path || '').replace(/^\/+/, '');
  if (!relativePath) return base;
  return `${base}/${relativePath}`;
};
export const buildWebSocketUrl = (apiBaseUrl = DEFAULT_API_URL) => {
  const apiUrl = new URL(String(apiBaseUrl || DEFAULT_API_URL));
  if (!['http:', 'https:'].includes(apiUrl.protocol)) {
    throw new Error('WebSocket endpoint geçerli HTTP API adresinden türetilmelidir.');
  }

  apiUrl.protocol = apiUrl.protocol === 'https:' ? 'wss:' : 'ws:';
  apiUrl.pathname = apiUrl.pathname.replace(/\/api\/?$/, '') + '/ws/logs';
  apiUrl.search = '';
  apiUrl.hash = '';
  return apiUrl.toString().replace(/\/$/, '');
};

const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export class ApiError extends Error {
  constructor(message, status = 500, code = 'API_ERROR', details = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const buildSessionRequestOptions = (options = {}) => {
  const method = String(options.method || 'GET').toUpperCase();
  const headers = { ...(options.headers || {}) };
  if (UNSAFE_METHODS.has(method)) {
    headers['X-XFactor-CSRF'] = '1';
  }
  return { ...options, method, credentials: 'include', headers };
};

export const createApiClient = (baseURL = DEFAULT_API_URL, defaultTimeoutMs = 15000) => {
  const request = async (endpoint, options = {}) => {
    const { signal, timeoutMs = defaultTimeoutMs, ...fetchOpts } = options;
    const headers = {
      'Content-Type': 'application/json',
      ...(fetchOpts.headers || {})
    };
    const url = buildApiUrl(baseURL, endpoint);

    let timer;
    let requestSignal = signal;
    let internalController = null;
    if (timeoutMs > 0 && typeof AbortController !== 'undefined') {
      internalController = new AbortController();
      if (signal) {
        signal.addEventListener('abort', () => internalController.abort(signal.reason), { once: true });
      }
      timer = setTimeout(() => {
        internalController.abort(new Error('İstek zaman aşımına uğradı (Timeout)'));
      }, timeoutMs);
      requestSignal = internalController.signal;
    }

    let res;
    try {
      res = await fetch(url, buildSessionRequestOptions({ ...fetchOpts, headers, signal: requestSignal }));
    } catch (err) {
      if (err.name === 'AbortError' || err.message?.includes('Timeout')) {
        throw err;
      }
      throw new ApiError(err.message || 'Ağ bağlantı hatası', 0, 'NETWORK_ERROR');
    } finally {
      if (timer) clearTimeout(timer);
    }
    if (res.status === 401) {
      throw new ApiError('Oturum süresi doldu veya yetkisiz erişim.', 401, 'UNAUTHORIZED');
    }

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({ error: res.statusText }));
      throw new ApiError(
        errorData.error || `HTTP error ${res.status}`,
        res.status,
        errorData.code || 'HTTP_ERROR',
        errorData
      );
    }

    return res.json();
  };

  return {
    // Auth
    login: (username, password, opts = {}) =>
      request('/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
        ...opts
      }),
    getSession: (opts = {}) => request('/session', opts),
    logout: (opts = {}) => request('/logout', { method: 'POST', ...opts }),

    // Projects
    getProjects: (opts = {}) => request('/projects', opts),
    getProject: (id, opts = {}) => request(`/projects/${id}`, opts),
    createProject: (title, opts = {}) =>
      request('/projects', {
        method: 'POST',
        body: JSON.stringify({ title }),
        ...opts
      }),

    // Project Files & Logs
    getProjectFiles: (id, opts = {}) => request(`/projects/${id}/files`, opts),
    getProjectLogs: (id, opts = {}) => request(`/projects/${id}/logs`, opts),

    // Read-only quality evidence
    getVerificationRuns: (id, opts = {}) => {
      const { cursor, limit, ...requestOpts } = opts;
      const params = new URLSearchParams();
      if (cursor) params.set('cursor', cursor);
      if (limit !== undefined) params.set('limit', String(limit));
      const query = params.toString();
      return request(`/projects/${id}/verification-runs${query ? `?${query}` : ''}`, requestOpts);
    },
    getVerificationRun: (id, runId, opts = {}) =>
      request(`/projects/${id}/verification-runs/${runId}`, opts),
    getVerificationCheckLog: (id, runId, checkId, opts = {}) =>
      request(`/projects/${id}/verification-runs/${runId}/checks/${checkId}/log`, opts),
    getVerificationSummary: (id, contractId, runId, opts = {}) => {
      const params = new URLSearchParams({ contractId, runId });
      return request(`/projects/${id}/verification-summary?${params.toString()}`, opts);
    },
    previewRebuild: (id, changedRequirementKeys, opts = {}) =>
      request(`/projects/${id}/rebuild-preview`, {
        method: 'POST',
        body: JSON.stringify({ changedRequirementKeys }),
        ...opts
      }),

    // Execution & Interaction
    sendChatMessage: (id, message, opts = {}) =>
      request(`/projects/${id}/chat`, {
        method: 'POST',
        body: JSON.stringify({ message }),
        ...opts
      }),

    approveProject: (id, opts = {}) =>
      request(`/projects/${id}/approve`, {
        method: 'POST',
        ...opts
      }),
    pauseProject: (id, opts = {}) =>
      request(`/projects/${id}/pause`, {
        method: 'POST',
        ...opts
      }),

    resumeProject: (id, opts = {}) =>
      request(`/projects/${id}/resume`, {
        method: 'POST',
        ...opts
      }),

    updateProject: (id, updates, opts = {}) =>
      request(`/projects/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(updates),
        ...opts
      }),

    deleteProject: (id, opts = {}) =>
      request(`/projects/${id}`, {
        method: 'DELETE',
        ...opts
      })
  };
};
export const api = createApiClient();
