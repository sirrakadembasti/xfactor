import http from 'node:http';
import https from 'node:https';
import tls from 'node:tls';
import { isIP } from 'node:net';
import dns from 'node:dns/promises';

const REGISTRY_HOST = 'registry.npmjs.org';

// Resolve and validate before connecting. IPv4-mapped IPv6 values are
// canonicalized so ::ffff:127.0.0.1 cannot bypass the IPv4 checks.
export function isSafeIP(input) {
  if (!isIP(input)) return false;
  let ip = input.toLowerCase();
  if (ip.startsWith('::ffff:')) ip = ip.slice(7);
  if (isIP(ip) === 4) {
    const octets = ip.split('.').map(Number);
    const [a, b] = octets;
    if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
    if (a === 100 && b >= 64 && b <= 127) return false; // shared address space
    if (a === 169 && b === 254) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && (b === 0 || b === 168)) return false;
    if (a === 198 && (b === 18 || b === 19)) return false;
    if (a === 203 && b === 0 && octets[2] === 113) return false;
    if (a === 192 && b === 0 && octets[2] === 0) return false;
    return true;
  }
  // Unspecified, loopback, link-local, unique-local, multicast and reserved
  // IPv6 ranges are never valid upstream registry destinations.
  return ip !== '::' && ip !== '::1' &&
    !ip.startsWith('fe8') && !ip.startsWith('fe9') &&
    !ip.startsWith('fea') && !ip.startsWith('feb') &&
    !ip.startsWith('fc') && !ip.startsWith('fd') &&
    !ip.startsWith('ff') && !ip.startsWith('2001:db8:') &&
    !ip.startsWith('2001:10:') && !ip.startsWith('2001:20:');
}

export function createProxy({ port = 0, host = '127.0.0.1', resolver = dns } = {}) {
  const server = http.createServer(async (req, res) => {
    try {
      const rawTarget = String(req.url || '/');
      let targetUrl;
      if (/^[a-z][a-z0-9+.-]*:\/\//i.test(rawTarget)) {
        targetUrl = new URL(rawTarget);
        if (targetUrl.protocol !== 'https:' ||
            targetUrl.hostname.toLowerCase() !== REGISTRY_HOST ||
            (targetUrl.port && targetUrl.port !== '443')) {
          res.writeHead(403);
          res.end('Host not allowlisted');
          return;
        }
      } else {
        // Origin-form proxy requests carry the proxy address in Host. That
        // header is never used for authorization; this listener is a fixed
        // registry endpoint and always targets the approved registry.
        targetUrl = new URL(rawTarget, `https://${REGISTRY_HOST}`);
      }
      const targetHost = REGISTRY_HOST;
      const addresses = await resolver.resolve(targetHost);
      const safeAddress = addresses.find(isSafeIP);
      if (!safeAddress) {
        res.writeHead(403);
        res.end('DNS resolved to unsafe IP');
        return;
      }
      const proxyReq = https.request({
        hostname: safeAddress,
        port: 443,
        path: targetUrl.pathname + targetUrl.search,
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
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => resolve(server));
  });
}
