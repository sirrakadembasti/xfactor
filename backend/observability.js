import crypto from 'crypto';

const REDACTED = '[REDACTED]';
const SENSITIVE_KEYS = new Set([
    'authorization',
    'cookie',
    'setcookie',
    'password',
    'passwd',
    'pwd',
    'token',
    'accesstoken',
    'refreshtoken',
    'jwt',
    'secret',
    'apikey',
    'clientsecret',
    'privatekey',
    'accesskey',
    'credential',
    'databaseurl',
    'connectionstring'
]);

function isSensitiveKey(key) {
    const normalized = String(key).replace(/[^a-z0-9]/gi, '').toLowerCase();
    if (SENSITIVE_KEYS.has(normalized)) return true;
    return ['password', 'token', 'secret', 'apikey', 'privatekey', 'accesskey', 'credential'].some(suffix => normalized.endsWith(suffix));
}

export function redactSensitiveText(value) {
    if (typeof value !== 'string' || !value) return value;

    return value
        .replace(/\b(Bearer)\s+[A-Za-z0-9._~+/-]+=*/gi, '$1 [REDACTED]')
        .replace(
            /(\b(?:api[_-]?key|access[_-]?token|refresh[_-]?token|token|jwt|authorization|cookie|password|passwd|secret|client[_-]?secret|private[_-]?key|access[_-]?key|credential|database[_-]?url|connection[_-]?string)\b\s*(?:=|:)\s*)(?:"[^"]*"|'[^']*'|[^\s&,;]+)/gi,
            '$1[REDACTED]'
        )
        .replace(/\b((?:api\s*key)|password|passwd|pwd|token|secret|client[_-]?secret|private[_-]?key|access[_-]?key|credential)\s+is\s+(?:"[^"]*"|'[^']*'|[^\s&,;]+)/gi, '$1 is [REDACTED]')
        .replace(/(https?:\/\/[^:\s/@]+:)[^@\s/]+@/gi, '$1[REDACTED]@')
        .replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, REDACTED)
        .replace(/\bAIza[A-Za-z0-9_-]{10,}\b/g, REDACTED)
        .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, REDACTED);
}

function sanitizeLogValue(value, seen) {
    if (typeof value === 'string') return redactSensitiveText(value);
    if (typeof value === 'bigint') return value.toString();
    if (value === null || typeof value !== 'object') return value;
    if (value instanceof Error) return serializeError(value);
    if (value instanceof Date) return value.toISOString();
    if (seen.has(value)) return '[Circular]';

    seen.add(value);
    if (Array.isArray(value)) {
        return value.map(item => sanitizeLogValue(item, seen));
    }

    const sanitized = {};
    for (const [key, item] of Object.entries(value)) {
        sanitized[key] = isSensitiveKey(key) ? REDACTED : sanitizeLogValue(item, seen);
    }
    return sanitized;
}

export function generateRequestId() {
    return crypto.randomBytes(8).toString('hex');
}

export function buildStructuredLog(event, details = {}) {
    const sanitizedDetails = sanitizeLogValue(details, new WeakSet());
    const requestId = sanitizedDetails.requestId || generateRequestId();
    return {
        timestamp: new Date().toISOString(),
        event,
        requestId,
        ...sanitizedDetails
    };
}

export function serializeError(error) {
    if (!error) {
        return { name: 'Error', message: 'Unknown error', code: undefined, stack: undefined };
    }

    const safeMessage = typeof error.message === 'string' && error.message.trim()
        ? redactSensitiveText(error.message)
        : 'Unknown error';

    return {
        name: error.name || 'Error',
        message: safeMessage,
        code: typeof error.code === 'string' ? redactSensitiveText(error.code) : undefined,
        stack: undefined
    };
}

export function writeStructuredLog(level, event, details = {}, sink = null) {
    const entry = buildStructuredLog(event, details);
    const writer = sink || (level === 'error' ? console.error : level === 'warn' ? console.warn : console.log);
    writer(JSON.stringify(entry));
    return entry;
}

export function logError(event, error, details = {}, sink = null) {
    return writeStructuredLog('error', event, { ...details, error: serializeError(error) }, sink);
}

export function logWarning(event, error, details = {}, sink = null) {
    return writeStructuredLog('warn', event, { ...details, error: serializeError(error) }, sink);
}

export function buildErrorResponse(error, fallbackMessage = 'İşlem başarısız oldu.', requestId = null, code = 'INTERNAL_ERROR') {
    const resolvedRequestId = typeof requestId === 'string' && requestId.trim()
        ? requestId
        : (typeof error?.requestId === 'string' && error.requestId ? error.requestId : generateRequestId());
    const finalMessage = typeof fallbackMessage === 'string' && fallbackMessage.trim()
        ? fallbackMessage
        : 'İşlem başarısız oldu.';
    const finalCode = typeof code === 'string' && /^[A-Z][A-Z0-9_]*$/.test(code)
        ? code
        : 'INTERNAL_ERROR';

    return {
        error: finalMessage,
        code: finalCode,
        requestId: resolvedRequestId
    };
}

export function createCorrelatedContext({ attemptId = null, projectId = null, requestId = null } = {}) {
    return {
        requestId: requestId || generateRequestId(),
        projectId,
        attemptId
    };
}

export function cleanupStaleLogs(db, retentionDays = 30) {
    if (!db || typeof db.prepare !== 'function') return 0;
    const cutoffIso = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString();
    try {
        const result = db.prepare('DELETE FROM project_logs WHERE timestamp < ?').run(cutoffIso);
        return result.changes;
    } catch {
        return 0;
    }
}
export function normalizeFailurePattern(message) {
    let s = redactSensitiveText(String(message || ''));
    if (typeof s !== 'string') s = String(s || '');
    // timestamps ISO
    s = s.replace(/\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?/gi, '<TIMESTAMP>');
    s = s.replace(/\b\d{4}-\d{2}-\d{2}\b/g, '<TIMESTAMP>');
    // Windows absolute paths C:\...
    s = s.replace(/[A-Za-z]:\\[^\s"']+/g, '<PATH>');
    // POSIX absolute paths /...
    s = s.replace(/(?:\/[A-Za-z0-9._@\-+]+)+(?:\/)?/g, (m) => {
        if (m.length < 4) return m;
        return '<PATH>';
    });
    // UUID
    s = s.replace(/\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b/g, '<UUID>');
    // long hex hashes 7+ hex chars (pure hex)
    s = s.replace(/\b[0-9a-fA-F]{7,}\b/g, (m) => /^[0-9a-fA-F]+$/.test(m) ? '<HASH>' : m);
    // version-like numbers e.g. 1.2.3
    s = s.replace(/\b\d+\.\d+\.\d+[^\s]*\b/g, '<VERSION>');
    // npm error code patterns
    s = s.replace(/npm ERR! code \S+/gi, 'npm ERR! code <CODE>');
    s = s.replace(/\bE[A-Z]{4,}\b/g, '<NPM_ERROR>');
    s = s.replace(/\b\d+\b/g, '<NUM>');
    // normalize whitespace and case
    s = s.replace(/\s+/g, ' ').trim().toLowerCase();
    return s;
}

export function getFingerprint(message) {
    const normalized = normalizeFailurePattern(message);
    return crypto.createHash('sha256').update(normalized).digest('hex');
}

export function getGateMetrics(projectId, targetDb) {
    const database = targetDb;
    if (!database || typeof database.prepare !== 'function') return [];
    // prepared project-scoped aggregation with duplicate collapse
    const rows = database.prepare(`
        WITH ranked AS (
            SELECT
                vc.gate_name as gate_name,
                vc.run_id as run_id,
                vc.status as status,
                vc.id as id,
                CASE
                    WHEN vc.started_at IS NOT NULL AND vc.ended_at IS NOT NULL
                    THEN (julianday(vc.ended_at) - julianday(vc.started_at)) * 86400000
                    ELSE NULL
                END as duration_ms,
                ROW_NUMBER() OVER (
                    PARTITION BY vc.gate_name, vc.run_id
                    ORDER BY CASE vc.status WHEN 'FAIL' THEN 3 WHEN 'BLOCKED' THEN 2 WHEN 'PASS' THEN 1 ELSE 0 END DESC, vc.id ASC
                ) as rn
            FROM verification_checks vc
            JOIN verification_runs vr ON vr.id = vc.run_id AND vr.contract_id = vc.contract_id
            WHERE vr.project_id = ?
        )
        SELECT
            gate_name,
            COUNT(*) as total_runs,
            SUM(CASE WHEN status='PASS' THEN 1 ELSE 0 END) as pass_count,
            SUM(CASE WHEN status='FAIL' THEN 1 ELSE 0 END) as fail_count,
            SUM(CASE WHEN status='BLOCKED' THEN 1 ELSE 0 END) as blocked_count,
            AVG(CASE WHEN duration_ms IS NOT NULL AND duration_ms >=0 AND duration_ms < 86400000*365 THEN duration_ms ELSE NULL END) as avg_duration
        FROM ranked
        WHERE rn=1
        GROUP BY gate_name
        ORDER BY gate_name ASC
    `).all(projectId);
    return rows.map(r => ({
        gate_name: r.gate_name,
        total_runs: Number(r.total_runs) || 0,
        pass_count: Number(r.pass_count) || 0,
        fail_count: Number(r.fail_count) || 0,
        blocked_count: Number(r.blocked_count) || 0,
        avg_duration_ms: Number.isFinite(r.avg_duration) && r.avg_duration !== null ? Math.round(Number(r.avg_duration)) : 0
    }));
}

export function getStackMetrics(projectId, targetDb) {
    const database = targetDb;
    if (!database || typeof database.prepare !== 'function') return [];
    const rows = database.prepare(`
        SELECT
            COALESCE(json_extract(pc.contract_json, '$.frontend.framework'), 'unknown') as frontend_framework,
            COALESCE(NULLIF(json_extract(pc.contract_json, '$.backend.language'), ''), json_extract(pc.contract_json, '$.backend.framework'), 'unknown') as backend_language,
            COALESCE(json_extract(pc.contract_json, '$.database.engine'), 'unknown') as db_engine,
            COUNT(*) as total_runs,
            SUM(CASE WHEN vr.status='verified' THEN 1 ELSE 0 END) as verified_runs,
            AVG(CASE
                WHEN vr.started_at IS NOT NULL AND vr.ended_at IS NOT NULL AND (julianday(vr.ended_at) - julianday(vr.started_at)) * 86400000 >= 0
                THEN (julianday(vr.ended_at) - julianday(vr.started_at)) * 86400000
                ELSE NULL
            END) as avg_duration
        FROM verification_runs vr
        JOIN project_contracts pc ON pc.id = vr.contract_id
        WHERE vr.project_id = ?
          AND vr.status IN ('verified','failed','blocked','rejected')
        GROUP BY frontend_framework, backend_language, db_engine
        ORDER BY frontend_framework ASC, backend_language ASC, db_engine ASC
    `).all(projectId);
    return rows.map(r => {
        const total = Number(r.total_runs) || 0;
        const verified = Number(r.verified_runs) || 0;
        const rate = total > 0 ? verified / total : 0;
        const avg = Number.isFinite(r.avg_duration) && r.avg_duration !== null && r.avg_duration >=0 ? Math.round(Number(r.avg_duration)) : 0;
        return {
            frontend_framework: r.frontend_framework || 'unknown',
            backend_language: r.backend_language || 'unknown',
            db_engine: r.db_engine || 'unknown',
            success_rate: Math.max(0, Math.min(1, Number(rate.toFixed(4)) || 0)),
            avg_duration_ms: Number.isFinite(avg) ? avg : 0
        };
    });
}

export function getTrendMetrics(projectId, targetDb) {
    const database = targetDb;
    if (!database || typeof database.prepare !== 'function') return [];
    const rows = database.prepare(`
        SELECT
            date(COALESCE(vr.ended_at, vr.started_at)) as date,
            COUNT(*) as total_runs,
            SUM(CASE WHEN vr.status='verified' THEN 1 ELSE 0 END) as verified_runs,
            AVG(CASE
                WHEN vr.started_at IS NOT NULL AND COALESCE(vr.ended_at, vr.started_at) IS NOT NULL AND (julianday(COALESCE(vr.ended_at, vr.started_at)) - julianday(vr.started_at)) * 86400000 >= 0
                THEN (julianday(COALESCE(vr.ended_at, vr.started_at)) - julianday(vr.started_at)) * 86400000
                ELSE NULL
            END) as avg_duration
        FROM verification_runs vr
        WHERE vr.project_id = ?
          AND vr.status IN ('verified','failed','blocked','rejected')
          AND COALESCE(vr.ended_at, vr.started_at) IS NOT NULL
        GROUP BY date
        ORDER BY date ASC
    `).all(projectId);
    return rows.map(r => {
        const total = Number(r.total_runs) || 0;
        const verified = Number(r.verified_runs) || 0;
        const rate = total > 0 ? verified / total : 0;
        const avg = Number.isFinite(r.avg_duration) && r.avg_duration !== null && r.avg_duration >=0 ? Math.round(Number(r.avg_duration)) : 0;
        return {
            date: r.date,
            total_runs: total,
            success_rate: Math.max(0, Math.min(1, Number(rate.toFixed(4)) || 0)),
            average_duration_ms: Number.isFinite(avg) ? avg : 0
        };
    });
}

export function getFailureMetrics(projectId, targetDb) {
    const database = targetDb;
    if (!database || typeof database.prepare !== 'function') return [];
    const rows = database.prepare(`
        SELECT
            json_extract(vc.evidence_json, '$.reason') as reason,
            vc.ended_at as ended_at,
            vr.ended_at as run_ended_at,
            vr.started_at as run_started_at
        FROM verification_checks vc
        JOIN verification_runs vr ON vr.id = vc.run_id AND vr.contract_id = vc.contract_id
        WHERE vr.project_id = ?
          AND vc.status IN ('FAIL','BLOCKED')
          AND json_extract(vc.evidence_json, '$.reason') IS NOT NULL
          AND trim(json_extract(vc.evidence_json, '$.reason')) <> ''
    `).all(projectId);
    const groups = new Map();
    for (const row of rows) {
        const raw = row.reason || '';
        const redactedFirst = redactSensitiveText(String(raw));
        const normalized = normalizeFailurePattern(redactedFirst);
        const fingerprint = crypto.createHash('sha256').update(normalized).digest('hex');
        const pattern = normalized;
        const occurred = row.ended_at || row.run_ended_at || row.run_started_at || new Date().toISOString();
        const existing = groups.get(fingerprint);
        if (!existing) {
            groups.set(fingerprint, {
                fingerprint,
                error_message_pattern: pattern,
                occurrence_count: 1,
                last_occurred_at: occurred
            });
        } else {
            existing.occurrence_count += 1;
            if (occurred > existing.last_occurred_at) existing.last_occurred_at = occurred;
        }
    }
    const result = Array.from(groups.values());
    result.sort((a,b) => {
        if (b.occurrence_count !== a.occurrence_count) return b.occurrence_count - a.occurrence_count;
        if (b.last_occurred_at !== a.last_occurred_at) return b.last_occurred_at > a.last_occurred_at ? 1 : -1;
        return a.fingerprint < b.fingerprint ? -1 : a.fingerprint > b.fingerprint ? 1 : 0;
    });
    return result.map(r => ({
        fingerprint: r.fingerprint,
        error_message_pattern: r.error_message_pattern,
        occurrence_count: Number(r.occurrence_count) || 0,
        last_occurred_at: r.last_occurred_at
    }));
}
export function deriveCheckpointId({ project_id, task_id, contract_id, plan_hash, task_spec_hash, input_hash, output_hash, gate_version }) {
  const arr = [project_id, task_id, contract_id, plan_hash, task_spec_hash, input_hash, output_hash, gate_version];
  return crypto.createHash('sha256').update(JSON.stringify(arr)).digest('hex');
}
export function collectDownstreamTaskIds(allTaskRows, rootTaskIds, rootFilePaths = []) {
  // allTaskRows: [{id, task_spec_json}]
  // returns sorted lexically array of transitive downstream including roots, or throws with code property
  const taskMap = new Map();
  const dependents = new Map(); // depId -> [dependentIds]
  const rootFiles = new Set(rootFilePaths);
  const effectiveRootTaskIds = new Set(rootTaskIds);
  for (const row of allTaskRows) {
    let spec;
    try {
      spec = typeof row.task_spec_json === 'string' ? JSON.parse(row.task_spec_json) : row.task_spec_json;
    } catch {
      const e = new Error('Malformed task spec JSON');
      e.code = 'MALFORMED_JSON';
      throw e;
    }
    const deps = spec.dependencies;
    if (deps === undefined) {
      // missing deps treat as empty? but spec says non-array should 409, so undefined -> empty?
      // we'll treat undefined as empty array to avoid false 409 for tasks without deps key
      // but if explicit, we've handled.
    } else if (!Array.isArray(deps)) {
      const e = new Error('Dependencies is not an array');
      e.code = 'NON_ARRAY_DEPS';
      throw e;
    }
    const depArray = Array.isArray(deps) ? deps : [];
    if (Array.isArray(spec.targetFiles) && spec.targetFiles.some(filePath => rootFiles.has(filePath))) {
      effectiveRootTaskIds.add(row.id);
    }
    // unknown dependency references detection: if dep not in task set
    taskMap.set(row.id, depArray);
    if (!dependents.has(row.id)) dependents.set(row.id, []);
  }
  // check unknown refs
  for (const [id, deps] of taskMap.entries()) {
    for (const dep of deps) {
      if (!taskMap.has(dep)) {
        const e = new Error(`Unknown dependency ${dep} for task ${id}`);
        e.code = 'UNKNOWN_DEP';
        throw e;
      }
      if (!dependents.has(dep)) dependents.set(dep, []);
      dependents.get(dep).push(id);
    }
  }
  // Iterative topological validation avoids call-stack exhaustion on valid deep DAGs.
  const remainingDependencies = new Map();
  const validationQueue = [];
  for (const [id, deps] of taskMap.entries()) {
    remainingDependencies.set(id, deps.length);
    if (deps.length === 0) validationQueue.push(id);
  }
  let validationIndex = 0;
  while (validationIndex < validationQueue.length) {
    const id = validationQueue[validationIndex++];
    for (const dependentId of dependents.get(id) || []) {
      const remaining = remainingDependencies.get(dependentId) - 1;
      remainingDependencies.set(dependentId, remaining);
      if (remaining === 0) validationQueue.push(dependentId);
    }
  }
  if (validationQueue.length !== taskMap.size) {
    const e = new Error('Cycle detected');
    e.code = 'CYCLE';
    throw e;
  }
  // BFS downstream from roots
  const impacted = new Set();
  const queue = [];
  for (const rid of effectiveRootTaskIds) {
    if (taskMap.has(rid) && !impacted.has(rid)) {
      impacted.add(rid);
      queue.push(rid);
    }
  }
  let idx = 0;
  while (idx < queue.length) {
    const cur = queue[idx++];
    const deps = dependents.get(cur) || [];
    for (const dep of deps) {
      if (!impacted.has(dep)) {
        impacted.add(dep);
        queue.push(dep);
        if (queue.length > 10000) {
          const e = new Error('Bound overflow');
          e.code = 'BOUND_EXCEEDED';
          throw e;
        }
      }
    }
  }
  return Array.from(impacted).sort();
}


