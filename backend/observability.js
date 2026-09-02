import crypto from 'crypto';

const REDACTED = '[REDACTED]';
const COMPACTED = '[COMPACTED]';
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
        .replace(/(\bauthorization\b\s*(?:=|:)\s*)Basic\s+[A-Za-z0-9+/]+={0,2}/gi, '$1[REDACTED]')
        .replace(/\b(Basic)\s+[A-Za-z0-9+/]+={0,2}/gi, '$1 [REDACTED]')
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

export function redactSensitiveValue(value) {
    return sanitizeLogValue(value, new WeakSet());
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

function findEvidenceExcerptRanges(text) {
    let ambiguous = false;
    const matches = [];

    function skipWhitespace(index) {
        while (index < text.length && /\s/.test(text[index])) index += 1;
        return index;
    }

    function scanString(start) {
        let index = start + 1;
        while (index < text.length) {
            if (text[index] === '\\') {
                index += 2;
                continue;
            }
            if (text[index] === '"') return index + 1;
            index += 1;
        }
        throw new SyntaxError('Unterminated JSON string');
    }

    function parseValue(index, path) {
        index = skipWhitespace(index);
        const token = text[index];
        if (token === '"') {
            const end = scanString(index);
            if (path.length === 2 && path[0] === 'evidence' && (path[1] === 'stdout' || path[1] === 'stderr')) {
                matches.push({ start: index, end, value: JSON.parse(text.slice(index, end)) });
            }
            return end;
        }
        if (token === '{') return parseObject(index, path);
        if (token === '[') return parseArray(index, path);
        while (index < text.length && !/[\s,\]}]/.test(text[index])) index += 1;
        return index;
    }

    function parseObject(index, path) {
        const keys = new Set();
        index = skipWhitespace(index + 1);
        if (text[index] === '}') return index + 1;
        while (index < text.length) {
            if (text[index] !== '"') throw new SyntaxError('Invalid JSON object key');
            const keyEnd = scanString(index);
            const key = JSON.parse(text.slice(index, keyEnd));
            if (keys.has(key)) ambiguous = true;
            keys.add(key);
            index = skipWhitespace(keyEnd);
            if (text[index] !== ':') throw new SyntaxError('Invalid JSON object separator');
            index = parseValue(index + 1, [...path, key]);
            index = skipWhitespace(index);
            if (text[index] === '}') return index + 1;
            if (text[index] !== ',') throw new SyntaxError('Invalid JSON object delimiter');
            index = skipWhitespace(index + 1);
        }
        throw new SyntaxError('Unterminated JSON object');
    }

    function parseArray(index, path) {
        let itemIndex = 0;
        index = skipWhitespace(index + 1);
        if (text[index] === ']') return index + 1;
        while (index < text.length) {
            index = parseValue(index, [...path, itemIndex]);
            itemIndex += 1;
            index = skipWhitespace(index);
            if (text[index] === ']') return index + 1;
            if (text[index] !== ',') throw new SyntaxError('Invalid JSON array delimiter');
            index = skipWhitespace(index + 1);
        }
        throw new SyntaxError('Unterminated JSON array');
    }

    const end = skipWhitespace(parseValue(0, []));
    if (end !== text.length) throw new SyntaxError('Trailing JSON content');
    return ambiguous ? [] : matches;
}

export function compactStaleEvidencePayloads(targetDb, retentionDays = 30) {
    if (!targetDb || typeof targetDb.prepare !== 'function' || typeof targetDb.exec !== 'function') {
        throw new TypeError('A writable database connection is required');
    }
    if (!Number.isFinite(retentionDays) || retentionDays < 0) {
        throw new RangeError('retentionDays must be a non-negative finite number');
    }

    const cutoffIso = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString();
    const selectCandidates = targetDb.prepare(`
        SELECT vc.id, vc.contract_id, vc.evidence_json
        FROM verification_checks vc
        JOIN verification_runs vr
          ON vr.contract_id = vc.contract_id
         AND vr.id = vc.run_id
        WHERE vc.evidence_json IS NOT NULL
          AND COALESCE(vc.ended_at, vr.ended_at, vc.started_at, vr.started_at) < ?
        ORDER BY vc.id
    `);
    const updateEvidence = targetDb.prepare(`
        UPDATE verification_checks
        SET evidence_json = ?
        WHERE contract_id = ? AND id = ?
    `);

    let compactedCount = 0;
    targetDb.exec('BEGIN IMMEDIATE');
    try {
        const candidates = selectCandidates.all(cutoffIso);
        for (const row of candidates) {
            let excerptRanges;
            try {
                JSON.parse(row.evidence_json);
                excerptRanges = findEvidenceExcerptRanges(row.evidence_json)
                    .filter(range => range.value && range.value !== COMPACTED);
            } catch {
                continue;
            }
            if (excerptRanges.length === 0) continue;

            let compactedPayload = row.evidence_json;
            excerptRanges.sort((a, b) => b.start - a.start);
            for (const range of excerptRanges) {
                compactedPayload = compactedPayload.slice(0, range.start)
                    + JSON.stringify(COMPACTED)
                    + compactedPayload.slice(range.end);
            }
            const result = updateEvidence.run(compactedPayload, row.contract_id, row.id);
            compactedCount += result.changes;
        }
        targetDb.exec('COMMIT');
        return compactedCount;
    } catch (error) {
        try {
            targetDb.exec('ROLLBACK');
        } catch {}
        throw error;
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


