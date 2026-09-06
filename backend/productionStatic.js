import { constants } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';

const backendRoot = path.dirname(fileURLToPath(import.meta.url));
const defaultDistRoot = path.resolve(backendRoot, '../frontend/dist');

export function getFrontendDistRoot(env = process.env) {
    const configured = String(env.FRONTEND_DIST_ROOT || '').trim();
    return path.resolve(configured || defaultDistRoot);
}

export async function assertProductionFrontendAvailable({ production, distRoot = getFrontendDistRoot() }) {
    if (!production) return;

    const root = path.resolve(distRoot);
    const entry = path.resolve(root, 'index.html');
    try {
        const [canonicalRoot, canonicalEntry, stat] = await Promise.all([
            fs.realpath(root),
            fs.realpath(entry),
            fs.stat(entry)
        ]);
        if (!isCanonicalPathWithinRoot(canonicalRoot, canonicalEntry) || !stat.isFile()) {
            throw new Error('index.html is not a file within the frontend distribution root');
        }
        await fs.access(canonicalEntry, constants.R_OK);
    } catch (error) {
        throw new Error(`Production frontend index.html is unavailable: ${error.message}`);
    }
}

export function isSpaNavigation(req) {
    if (!['GET', 'HEAD'].includes(req.method)) return false;
    if (!req.accepts('html')) return false;
    if (/^\/(api|ws)(\/|$)/.test(req.path)) return false;
    if (req.path === '/healthz' || req.path === '/readyz') return false;
    return !path.posix.basename(req.path).includes('.');
}

function isCanonicalPathWithinRoot(root, target) {
    return target === root || target.startsWith(`${root}${path.sep}`);
}

async function resolveStaticTarget(root, canonicalRoot, requestPath) {
    try {
        const candidate = path.resolve(root, `.${decodeURIComponent(requestPath)}`);
        if (!isCanonicalPathWithinRoot(root, candidate)) return 'outside';
        const target = await fs.realpath(candidate);
        return isCanonicalPathWithinRoot(canonicalRoot, target) ? 'inside' : 'outside';
    } catch {
        return 'missing';
    }
}

function isFingerprintedAsset(servedPath) {
    return /[-.][a-f0-9]{6,}\.[^.]+$/i.test(path.basename(servedPath));
}

export function mountProductionFrontend(app, { production, distRoot = getFrontendDistRoot() }) {
    if (!production) return;

    const root = path.resolve(distRoot);
    const canonicalRoot = fs.realpath(root);
    const canonicalEntry = Promise.all([
        canonicalRoot,
        fs.realpath(path.resolve(root, 'index.html'))
    ]).then(([canonicalRootValue, entry]) => {
        if (!isCanonicalPathWithinRoot(canonicalRootValue, entry)) {
            throw new Error('Frontend index.html resolves outside the distribution root');
        }
        return entry;
    });
    const staticFiles = express.static(root, {
        index: false,
        setHeaders(response, servedPath) {
            if (path.extname(servedPath).toLowerCase() === '.html' || !isFingerprintedAsset(servedPath)) {
                response.setHeader('Cache-Control', 'no-cache');
            } else {
                response.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
            }
        }
    });

    app.use(async (req, res, next) => {
        try {
            const target = await resolveStaticTarget(root, await canonicalRoot, req.path);
            if (target === 'outside') return res.sendStatus(404);
            if (target === 'missing') return next();
            return staticFiles(req, res, next);
        } catch (error) {
            return next(error);
        }
    });

    app.use(async (req, res, next) => {
        if (!isSpaNavigation(req)) return next();
        try {
            return res.sendFile(await canonicalEntry, { headers: { 'Cache-Control': 'no-cache' } }, next);
        } catch (error) {
            return next(error);
        }
    });
}
