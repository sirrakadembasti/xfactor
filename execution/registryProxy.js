import http from 'node:http';
import https from 'node:https';
import tls from 'node:tls';
import { isIP } from 'node:net';
import dns from 'node:dns/promises';

// Prevent SSRF and loopback/private/link-local/metadata escapes.
function isSafeIP(ip) {
  if (!isIP(ip)) return false;
  if (ip.startsWith('127.') || ip.startsWith('10.')) return false;
  if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(ip)) return false;
  if (ip.startsWith('192.168.') || ip.startsWith('169.254.')) return false;
  const normalized = ip.toLowerCase();
  return normalized !== '::1' && !normalized.startsWith('fe80:') &&
    !normalized.startsWith('fc') && !normalized.startsWith('fd');
}

export function createProxy({ port = 0 } = {}) {
  const allowlistHosts = new Set(['registry.npmjs.org']);
  const server = http.createServer(async (req, res) => {
    try {
      const rawHost = req.headers.host?.replace(/:\d+$/, '').toLowerCase();
      const requestUrl = new URL(req.url, `http://${rawHost || ''}`);
      const targetHost = requestUrl.hostname.toLowerCase();
      if (!allowlistHosts.has(targetHost) || rawHost !== targetHost) {
        res.writeHead(403);
        res.end('Host not allowlisted');
        return;
      }

      // Resolve once and use the validated address as the actual connection
      // target. SNI and certificate verification still use the registry name.
      const addresses = await dns.resolve(targetHost);
      const safeAddress = addresses.find(isSafeIP);
      if (!safeAddress) {
        res.writeHead(403);
        res.end('DNS resolved to unsafe IP');
        return;
      }

      const proxyReq = https.request({
        hostname: safeAddress,
        port: 443,
        path: requestUrl.pathname + requestUrl.search,
        method: req.method,
        headers: { ...req.headers, host: targetHost },
        servername: targetHost,
        checkServerIdentity: (_address, certificate) =>
          tls.checkServerIdentity(targetHost, certificate),
      }, (proxyRes) => {
        res.writeHead(proxyRes.statusCode, proxyRes.headers);
        proxyRes.pipe(res);
      });
      proxyReq.on('error', () => {
        if (!res.headersSent) res.writeHead(502);
        res.end('Bad Gateway');
      });
      req.pipe(proxyReq);
    } catch {
      if (!res.headersSent) res.writeHead(500);
      res.end('Proxy Error');
    }
  });

  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}
