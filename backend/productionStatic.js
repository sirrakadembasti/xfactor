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

    const entry = path.resolve(distRoot, 'index.html');
    try {
        const stat = await fs.stat(entry);
        if (!stat.isFile()) throw new Error('index.html is not a file');
        await fs.access(entry, constants.R_OK);
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

function isPathWithinRoot(root, requestPath) {
    try {
        const resolved = path.resolve(root, `.${decodeURIComponent(requestPath)}`);
        return resolved === root || resolved.startsWith(`${root}${path.sep}`);
    } catch {
        return false;
    }
}

export function mountProductionFrontend(app, { production, distRoot = getFrontendDistRoot() }) {
    if (!production) return;

    const root = path.resolve(distRoot);
    const staticFiles = express.static(root, {
        index: false,
        setHeaders(response, servedPath) {
            if (path.extname(servedPath).toLowerCase() === '.html') {
                response.setHeader('Cache-Control', 'no-cache');
            } else {
                response.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
            }
        }
    });

    app.use((req, res, next) => {
        if (!isPathWithinRoot(root, req.path)) return next();
        return staticFiles(req, res, next);
    });

    app.use((req, res, next) => {
        if (!isSpaNavigation(req)) return next();
        const entry = path.resolve(root, 'index.html');
        if (!isPathWithinRoot(root, req.path)) return next();
        return res.sendFile(entry, { headers: { 'Cache-Control': 'no-cache' } }, next);
    });
}
