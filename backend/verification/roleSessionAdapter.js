import { randomBytes } from 'node:crypto';

const LOCAL_PATH = /^\/(?!\/)/;
const ROLE_SETUP_SCRIPT = `const { spawnSync } = require('node:child_process');
const credentials = JSON.parse(require('node:fs').readFileSync(0, 'utf8'));
const env = { ...process.env, ...credentials, NODE_ENV: 'test' };
const result = spawnSync('npm', ['run', 'xfactor:test:setup'], {
  cwd: '/workspace', env, stdio: ['ignore', 'pipe', 'pipe'], timeout: 120000
});
if (result.error || result.status !== 0) {
  process.stderr.write('Management test setup failed.');
  process.exit(1);
}
process.stdout.write('Management test accounts prepared.');`;
const ROLE_REQUEST_SCRIPT = `const [loginUrl, targetUrl, method, username, identityField, passwordField, tokenField, payload] = process.argv.slice(1);
const password = (await import('node:fs')).readFileSync(0, 'utf8');
if (!password) throw new Error('Isolated role credential is missing');
const login = await fetch(loginUrl, {
  method: 'POST',
  headers: { 'content-type': 'application/json', accept: 'application/json' },
  body: JSON.stringify({ [identityField]: username, [passwordField]: password })
});
if (!login.ok) throw new Error('Role login failed with HTTP ' + login.status);
let loginData = {};
try { loginData = await login.json(); } catch {}
const token = loginData?.[tokenField];
const cookie = login.headers.get('set-cookie')?.split(';')[0];
if (!token && !cookie) throw new Error('Role login returned no session proof');
const headers = { accept: 'application/json' };
if (token) headers.authorization = 'Bearer ' + token;
if (cookie) headers.cookie = cookie;
if (payload) headers['content-type'] = 'application/json';
const response = await fetch(targetUrl, { method, headers, ...(payload ? { body: payload } : {}) });
const rawBody = await response.text();
let data = rawBody;
try { data = JSON.parse(rawBody); } catch {}
process.stdout.write(JSON.stringify({ statusCode: response.status, data, rawBody }));`;

function localUrl(baseUrl, path) {
    if (typeof path !== 'string' || !LOCAL_PATH.test(path) || /\.\.|[?#\\]/.test(path)) {
        throw new Error('Role verification requires a safe local path.');
    }
    return new URL(path, baseUrl);
}

export async function prepareManagementDemoUsers(adapter, management, env = {}, { signal } = {}) {
    if (typeof adapter?.execute !== 'function') throw new Error('Isolated executable adapter is required for demo setup.');
    const roles = management?.roles;
    if (!Array.isArray(roles) || roles.length === 0) throw new Error('Management roles are required for demo setup.');
    const passwords = {};
    const credentials = {};
    for (const role of roles) {
        if (typeof role?.name !== 'string' || !role.name.trim() || !role.demoUser?.username || passwords[role.name]) {
            throw new Error('Each management role requires a unique demo identity.');
        }
        const variable = `XFACTOR_DEMO_PASSWORD_${role.name.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`;
        if (credentials[variable]) throw new Error('Management role names produce duplicate demo credential variables.');
        const password = randomBytes(24).toString('base64url');
        passwords[role.name] = password;
        credentials[variable] = password;
    }
    const result = await adapter.execute({ command: 'node', args: ['-e', ROLE_SETUP_SCRIPT],
        cwd: '/workspace', env: { ...env, NODE_ENV: 'test' }, input: JSON.stringify(credentials),
        timeoutMs: 120000, signal });
    if (result.exitCode !== 0 || result.passed === false) throw new Error('Isolated management demo setup failed.');
    return passwords;
}

export function createRoleSessionAdapter(adapter, baseUrl, management, passwords = {}) {
    if (typeof adapter?.execute !== 'function') throw new Error('Isolated executable adapter is required for role verification.');
    const origin = new URL(baseUrl).origin;
    const auth = management?.authentication?.apiLogin;
    const loginUrl = localUrl(origin, auth?.path).href;
    const identityField = auth.identityField || 'username';
    const passwordField = auth.passwordField || 'password';
    const tokenField = auth.tokenField || 'token';
    for (const value of [identityField, passwordField, tokenField]) {
        if (!/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(value)) throw new Error('Invalid role login field.');
    }
    const roles = new Map((management.roles || []).map(role => [role.name, role]));
    return {
        ...adapter,
        requestAsRole: async ({ role, method = 'GET', url, data, timeoutMs = 5000, signal }) => {
            const entry = roles.get(role);
            if (!entry?.demoUser?.username || !passwords[role]) throw new Error(`Isolated credential is missing for role ${role}.`);
            const target = new URL(url);
            if (target.origin !== origin || !LOCAL_PATH.test(target.pathname)) throw new Error('Role request must use the local application origin.');
            if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) throw new Error('Unsupported role request method.');
            const result = await adapter.execute({
                command: 'node',
                args: ['-e', ROLE_REQUEST_SCRIPT, loginUrl, target.href, method,
                    entry.demoUser.username, identityField, passwordField, tokenField,
                    data == null ? '' : JSON.stringify(data)],
                cwd: '/workspace', timeoutMs, signal, input: passwords[role]
            });
            if (result.exitCode !== 0 || result.passed === false) throw new Error('Isolated role request failed.');
            return JSON.parse(result.stdout || '{}');
        }
    };
}
