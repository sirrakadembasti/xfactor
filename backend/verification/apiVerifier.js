import http from 'http';
import https from 'https';
import fsSync from 'fs';
import { URL } from 'url';
import { DatabaseSync } from 'node:sqlite';

export async function sendHttpRequest(targetUrl, method = 'GET', data = null, timeoutMs = 5000) {
    const parsed = new URL(targetUrl);
    const client = parsed.protocol === 'https:' ? https : http;

    return new Promise((resolve, reject) => {
        const payload = data ? (typeof data === 'string' ? data : JSON.stringify(data)) : null;

        const options = {
            method,
            hostname: parsed.hostname,
            port: parsed.port,
            path: `${parsed.pathname}${parsed.search}`,
            timeout: timeoutMs,
            headers: {
                'Accept': 'application/json',
                ...(payload ? {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(payload)
                } : {})
            }
        };

        const req = client.request(options, (res) => {
            let body = '';
            res.on('data', chunk => { body += chunk; });
            res.on('end', () => {
                let parsedJson = null;
                try {
                    parsedJson = JSON.parse(body);
                } catch {
                    parsedJson = body;
                }
                resolve({
                    statusCode: res.statusCode || 0,
                    headers: res.headers,
                    data: parsedJson,
                    rawBody: body
                });
            });
        });

        req.on('timeout', () => {
            req.destroy();
            reject(new Error(`HTTP request timed out after ${timeoutMs}ms`));
        });

        req.on('error', (err) => {
            reject(err);
        });

        if (payload) {
            req.write(payload);
        }
        req.end();
    });
}

export async function verifyAPIContract(apiBaseUrl, dbPath, contract = {}, options = {}) {
    const checks = [];
    const issues = [];

    // 1. DB Varlık Kontrolü
    if (!dbPath || !fsSync.existsSync(dbPath)) {
        checks.push({
            name: 'database_file_accessible',
            status: 'failed',
            reason: `Database file does not exist at: ${dbPath}`
        });
        issues.push(`Database file does not exist at: ${dbPath}`);
        return {
            passed: false,
            checks,
            issues
        };
    }

    const domains = Array.isArray(contract.domains) && contract.domains.length > 0
        ? contract.domains
        : [{ name: 'items', prefix: 'items' }];

    for (const domain of domains) {
        const prefix = typeof domain === 'string' ? domain : (domain.prefix || domain.name || 'items');
        const endpointUrl = `${apiBaseUrl.replace(/\/+$/, '')}/api/${prefix}`;

        // A. POST İsteği Gönder (Create Mutation)
        const testItemName = `Verification Item ${Date.now()}`;
        let postResponse = null;

        try {
            postResponse = await sendHttpRequest(endpointUrl, 'POST', {
                name: testItemName,
                title: testItemName,
                description: 'Created by XFactor API Verifier'
            }, options.timeoutMs || 5000);

            const isSuccess = postResponse.statusCode >= 200 && postResponse.statusCode < 300;
            checks.push({
                name: 'api_status_check',
                status: isSuccess ? 'passed' : 'failed',
                reason: `POST ${endpointUrl} returned HTTP ${postResponse.statusCode}`,
                statusCode: postResponse.statusCode
            });

            if (!isSuccess) {
                issues.push(`POST ${endpointUrl} returned unexpected status code: ${postResponse.statusCode}`);
            }
        } catch (err) {
            checks.push({
                name: 'api_status_check',
                status: 'failed',
                reason: `POST ${endpointUrl} network error: ${err.message}`
            });
            issues.push(`POST ${endpointUrl} network error: ${err.message}`);
        }

        // B. Doğrudan SQLite Veritabanı Yan Etki (Mutation) Doğrulaması
        let sqliteDb = null;
        try {
            sqliteDb = new DatabaseSync(dbPath);
            const tables = sqliteDb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map(t => t.name);

            let recordFound = false;
            for (const table of tables) {
                try {
                    const rows = sqliteDb.prepare(`SELECT * FROM ${table} ORDER BY rowid DESC LIMIT 20`).all();
                    for (const row of rows) {
                        const valuesStr = Object.values(row).join(' ');
                        if (valuesStr.includes(testItemName)) {
                            recordFound = true;
                            break;
                        }
                    }
                    if (recordFound) break;
                } catch {}
            }

            if (recordFound) {
                checks.push({
                    name: 'database_mutation_assertion',
                    status: 'passed',
                    reason: `Physical database record verified for created item "${testItemName}".`
                });
            } else if (postResponse && postResponse.statusCode >= 200 && postResponse.statusCode < 300) {
                checks.push({
                    name: 'database_mutation_assertion',
                    status: 'failed',
                    reason: `API returned success (${postResponse.statusCode}) but no mutation was persisted to database table(s).`
                });
                issues.push('API mutation was not written to SQLite database.');
            } else {
                checks.push({
                    name: 'database_mutation_assertion',
                    status: 'failed',
                    reason: 'Skipped or failed database mutation check due to prior API call failure.'
                });
            }
        } catch (dbErr) {
            checks.push({
                name: 'database_mutation_assertion',
                status: 'failed',
                reason: `Database verification query error: ${dbErr.message}`
            });
            issues.push(`Database verification error: ${dbErr.message}`);
        } finally {
            try {
                sqliteDb?.close();
            } catch {}
        }

        // C. GET İsteği Gönder (Read Query)
        try {
            const getResponse = await sendHttpRequest(endpointUrl, 'GET', null, options.timeoutMs || 5000);
            const isGetSuccess = getResponse.statusCode >= 200 && getResponse.statusCode < 300;
            checks.push({
                name: 'api_query_check',
                status: isGetSuccess ? 'passed' : 'failed',
                reason: `GET ${endpointUrl} returned HTTP ${getResponse.statusCode}`,
                statusCode: getResponse.statusCode
            });
        } catch (err) {
            checks.push({
                name: 'api_query_check',
                status: 'failed',
                reason: `GET ${endpointUrl} query error: ${err.message}`
            });
            issues.push(`GET ${endpointUrl} error: ${err.message}`);
        }
    }

    const allPassed = checks.every(c => c.status === 'passed');
    return {
        passed: allPassed && issues.length === 0,
        checks,
        issues
    };
}
