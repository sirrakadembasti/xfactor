const LOCAL_API_URL = 'http://127.0.0.1:8000/api';

export const formatChatError = (error = {}) => {
  const messages = {
    LLM_TIMEOUT: 'Model yanıtı süre sınırını aştı. LLM yönetiminde süre ve düşünme ayarını kontrol edin.',
    LLM_RATE_LIMIT: 'Sağlayıcı hız veya kota sınırına ulaşıldı. Bir süre bekleyip kotayı kontrol edin.',
    LLM_AUTH: 'Model sağlayıcısı API anahtarını veya erişim yetkisini kabul etmedi.',
    LLM_REQUEST_REJECTED: 'Model sağlayıcısı istek ayarını reddetti. LLM yönetiminde modeli ve adresi sınayın.',
    LLM_EMPTY_RESPONSE: 'Model kullanılabilir yanıt üretmedi. Token bütçesini ve düşünme ayarını kontrol edin.',
    LLM_TRUNCATED: 'Model yanıtı token bütçesine takıldı. Bütçeyi artırın veya isteği küçültün.',
    LLM_NETWORK: 'Model sağlayıcısına ağ bağlantısı kurulamadı. İnternet, DNS ve proxy ayarlarını kontrol edin.',
    LLM_PROVIDER_ERROR: 'Model sağlayıcısından yanıt alınamadı. LLM yönetimindeki sohbet testini çalıştırın.',
    NETWORK_ERROR: 'Sunucuya bağlantı kurulamadı. Uygulamanın çalıştığını kontrol edin.'
  };
  const message = messages[error.code] || (error.status === 401 ? 'Oturum süresi doldu. Yeniden giriş yapın.'
    : error.status === 403 ? 'Bu proje için mesaj gönderme yetkisi yok.'
      : error.status === 429 ? 'İstek sınırına ulaşıldı. Bir süre bekleyin.'
        : error.status === 400 ? 'Mesaj geçersiz. Boş olmadığını ve 4000 karakter sınırını aşmadığını kontrol edin.'
          : error.status === 413 ? 'Mesaj isteği boyut sınırını aşıyor. İçeriği kısaltıp yeniden gönderin.'
        : /Timeout|Abort/.test(error.name || '') || /Timeout/.test(error.message || '')
          ? messages.LLM_TIMEOUT : 'Mesaj iletilemedi. LLM yönetimindeki sohbet testini çalıştırın.');
  const requestId = error.details?.requestId;
  return typeof requestId === 'string' && /^[a-zA-Z0-9-]{1,80}$/.test(requestId)
    ? `${message} Hata kaydı: ${requestId}.` : message;
};

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

export const buildArtifactDownloadUrl = (
  projectId,
  contractId,
  artifactId,
  baseURL = API_BASE_URL
) => {
  if (![projectId, contractId, artifactId].every(identity => String(identity ?? '').trim())) {
    throw new Error('Artefakt indirme kimliği yapılandırılmamış.');
  }

  return buildApiUrl(
    baseURL,
    `/projects/${encodeURIComponent(projectId)}` +
    `/contracts/${encodeURIComponent(contractId)}` +
    `/artifacts/${encodeURIComponent(artifactId)}/download`
  );
};

export const requestVerifiedArtifactDownload = async ({
  projectId,
  activeProjectId,
  projectState,
  getProject,
  navigate,
  actionId,
  download
}) => {
  const targetState = projectId === activeProjectId ? projectState : await getProject(projectId);
  const { contractId, latestArtifact } = targetState || {};
  if (!contractId || !latestArtifact?.id || latestArtifact.status !== 'verified') {
    throw new Error('UNVERIFIED_ARTIFACT');
  }

  const url = buildArtifactDownloadUrl(projectId, contractId, latestArtifact.id);
  if (!actionId || typeof download !== 'function') {
    navigate(url);
    return;
  }

  const blob = await download(url, buildActionRequestOptions(actionId));
  if (typeof document === 'undefined' || typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') {
    navigate(url);
    return;
  }
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = `${projectId}.zip`;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(objectUrl);
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

const encodePathSegment = identity => encodeURIComponent(String(identity));

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

export const buildActionRequestOptions = (actionId, options = {}) => {
  if (!actionId) return { ...options };
  return {
    ...options,
    headers: {
      ...(options.headers || {}),
      'X-XFactor-Action-Id': actionId
    }
  };
};

export const createApiClient = (baseURL = DEFAULT_API_URL, defaultTimeoutMs = 15000) => {
  const request = async (endpoint, options = {}) => {
    const {
      signal,
      timeoutMs = defaultTimeoutMs,
      responseType = 'json',
      ...fetchOpts
    } = options;
    if (signal?.aborted) {
      throw signal.reason || new DOMException('The operation was aborted.', 'AbortError');
    }

    const headers = {
      'Content-Type': 'application/json',
      ...(fetchOpts.headers || {})
    };
    const url = /^https?:\/\//i.test(String(endpoint))
      ? String(endpoint)
      : buildApiUrl(baseURL, endpoint);

    let timer;
    let requestSignal = signal;
    let internalController = null;
    let forwardedAbortHandler = null;
    if (timeoutMs > 0 && typeof AbortController !== 'undefined') {
      internalController = new AbortController();
      if (signal) {
        forwardedAbortHandler = () => internalController.abort(signal.reason);
        signal.addEventListener('abort', forwardedAbortHandler, { once: true });
      }
      timer = setTimeout(() => {
        internalController.abort(new Error('İstek zaman aşımına uğradı (Timeout)'));
      }, timeoutMs);
      requestSignal = internalController.signal;
    }

    try {
      const res = await fetch(url, buildSessionRequestOptions({ ...fetchOpts, headers, signal: requestSignal }));
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

      return responseType === 'blob' ? await res.blob() : await res.json();
    } catch (err) {
      if (err.name === 'AbortError' || err.message?.includes('Timeout')) {
        throw err;
      }
      if (err instanceof ApiError) throw err;
      throw new ApiError(err.message || 'Ağ bağlantı hatası', 0, 'NETWORK_ERROR');
    } finally {
      clearTimeout(timer);
      if (signal && forwardedAbortHandler) {
        signal.removeEventListener('abort', forwardedAbortHandler);
      }
    }
  };

  return {
    // Auth
    login: (username, password, totp = '', opts = {}) =>
      request('/login', {
        method: 'POST',
        body: JSON.stringify({ username, password, ...(totp ? { totp } : {}) }),
        ...opts
      }),
    getSession: (opts = {}) => request('/session', opts),
    logout: (opts = {}) => request('/logout', { method: 'POST', ...opts }),

    // Projects
    getProjects: (opts = {}) => request('/projects', opts),
    getProject: (id, opts = {}) => request(`/projects/${encodePathSegment(id)}`, opts),
    createProject: (title, opts = {}) =>
      request('/projects', {
        method: 'POST',
        body: JSON.stringify({ title }),
        ...opts
      }),

    // Project Files & Logs
    getProjectFiles: (id, opts = {}) => request(`/projects/${encodePathSegment(id)}/files`, opts),
    getProjectLogs: (id, opts = {}) => request(`/projects/${encodePathSegment(id)}/logs`, opts),

    // Read-only quality evidence
    getExecutionProgress: (id, opts = {}) => request(`/projects/${encodePathSegment(id)}/execution-progress`, opts),
    getVerificationRuns: (id, opts = {}) => {
      const { cursor, limit, ...requestOpts } = opts;
      const params = new URLSearchParams();
      if (cursor) params.set('cursor', cursor);
      if (limit !== undefined) params.set('limit', String(limit));
      const query = params.toString();
      return request(`/projects/${encodePathSegment(id)}/verification-runs${query ? `?${query}` : ''}`, requestOpts);
    },
    getVerificationRun: (id, runId, opts = {}) =>
      request(`/projects/${encodePathSegment(id)}/verification-runs/${encodePathSegment(runId)}`, opts),
    getVerificationCheckLog: (id, runId, checkId, opts = {}) =>
      request(`/projects/${encodePathSegment(id)}/verification-runs/${encodePathSegment(runId)}/checks/${encodePathSegment(checkId)}/log`, opts),
    getVerificationSummary: (id, contractId, runId, opts = {}) => {
      const params = new URLSearchParams({ contractId, runId });
      return request(`/projects/${encodePathSegment(id)}/verification-summary?${params.toString()}`, opts);
    },
    previewRebuild: (id, changedRequirementKeys, opts = {}) =>
      request(`/projects/${encodePathSegment(id)}/rebuild-preview`, {
        method: 'POST',
        body: JSON.stringify({ changedRequirementKeys }),
        ...opts
      }),
    syncProjects: (activeProjectIdOrOptions = {}, maybeOptions = {}) => {
      const options = typeof activeProjectIdOrOptions === 'string'
        ? maybeOptions
        : activeProjectIdOrOptions || {};
      const activeProjectId = typeof activeProjectIdOrOptions === 'string'
        ? activeProjectIdOrOptions
        : options.activeProjectId;
      const { activeProjectId: _ignoredActiveProjectId, ...requestOptions } = options;
      return request('/projects/sync', {
        method: 'POST',
        body: JSON.stringify(activeProjectId ? { activeProjectId } : {}),
        ...requestOptions
      });
    },
    downloadArtifact: (endpoint, opts = {}) =>
      request(endpoint, { timeoutMs: 0, ...opts, responseType: 'blob' }),

    // Execution & Interaction
    sendChatMessage: (id, message, opts = {}) =>
      request(`/projects/${encodePathSegment(id)}/chat`, {
        method: 'POST',
        body: JSON.stringify({ message }),
        // Manager generation is bounded by the backend LLM deadline. A short
        // browser deadline can report failure while that reply is still running.
        timeoutMs: 0,
        ...opts
      }),

    approveProject: (id, opts = {}) =>
      request(`/projects/${encodePathSegment(id)}/approve`, {
        method: 'POST',
        ...opts
      }),
    pauseProject: (id, opts = {}) =>
      request(`/projects/${encodePathSegment(id)}/pause`, {
        method: 'POST',
        ...opts
      }),

    rejectContractDraft: (id, revision, contractId, opts = {}) =>
      request(`/projects/${encodePathSegment(id)}/contracts/${encodePathSegment(String(revision))}/reject`, {
        method: 'POST', body: JSON.stringify({ contractId }), ...opts
      }),

    reverifyProject: (id, contractId, opts = {}) =>
      request(`/projects/${encodePathSegment(id)}/reverify`, {
        method: 'POST', body: JSON.stringify({ contractId }), ...opts
      }),

    prepareProjectRepair: (id, contractId, opts = {}) =>
      request(`/projects/${encodePathSegment(id)}/repair-proposal`, {
        method: 'POST', body: JSON.stringify({ contractId }), timeoutMs: 0, ...opts
      }),

    startProjectRepair: (id, contractId, proposalHash, opts = {}) =>
      request(`/projects/${encodePathSegment(id)}/repair`, {
        method: 'POST', body: JSON.stringify({ contractId, proposalHash }), ...opts
      }),

    reviewProjectRepair: (id, contractId, proposalHash, opts = {}) =>
      request(`/projects/${encodePathSegment(id)}/repair-review`, {
        method: 'POST', body: JSON.stringify({ contractId, proposalHash }), ...opts
      }),

    resumeProject: (id, opts = {}) =>
      request(`/projects/${encodePathSegment(id)}/resume`, {
        method: 'POST',
        ...opts
      }),

    updateProject: (id, updates, opts = {}) =>
      request(`/projects/${encodePathSegment(id)}`, {
        method: 'PATCH',
        body: JSON.stringify(updates),
        ...opts
      }),

    deleteProject: (id, opts = {}) =>
      request(`/projects/${encodePathSegment(id)}`, {
        method: 'DELETE',
        ...opts
      })

  };
};
export const api = createApiClient();
