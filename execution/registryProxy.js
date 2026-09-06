import http from 'node:http';
import https from 'node:https';
import tls from 'node:tls';
import { isIP } from 'node:net';
import dns from 'node:dns/promises';

const REGISTRY_HOST = 'registry.npmjs.org';

// Resolve and validate before connecting. IPv4-mapped IPv6 values are
// canonicalized so ::ffff:127.0.0.1 cannot bypass the IPv4 checks.

function ipv6Value(input) {
  const [address, zone] = input.split('%');
  if (zone || !address.includes(':')) return null;
  const pieces = address.split('::');
  if (pieces.length > 2) return null;
  const parse = (parts) => {
    const words = [];
    for (const piece of parts) {
      if (piece.includes('.')) {
        const octets = piece.split('.').map(Number);
        if (octets.length !== 4 || octets.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
        words.push((octets[0] << 8) | octets[1], (octets[2] << 8) | octets[3]);
      } else {
        if (!/^[0-9a-f]{1,4}$/i.test(piece)) return null;
        words.push(parseInt(piece, 16));
      }
    }
    return words;
  };
  const left = parse(pieces[0] ? pieces[0].split(':') : []);
  const right = parse(pieces.length === 2 && pieces[1] ? pieces[1].split(':') : []);
  if (!left || !right || (pieces.length === 1 && left.length !== 8) ||
      (pieces.length === 2 && left.length + right.length >= 8)) return null;
  const words = pieces.length === 2
    ? [...left, ...Array(8 - left.length - right.length).fill(0), ...right]
    : left;
  return words.reduce((value, word) => (value << 16n) | BigInt(word), 0n);
}


export function isSafeIP(input) {
  if (!isIP(input)) return false;
  if (isIP(input) === 4) {
    const [a, b, c] = input.split('.').map(Number);
    if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
    if (a === 100 && b >= 64 && b <= 127) return false;
    if (a === 169 && b === 254) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && ((b === 0 && (c === 0 || c === 2)) || b === 168)) return false;
    if (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) return false;
    if (a === 203 && b === 0 && c === 113) return false;
    return true;
  }
  const value = ipv6Value(input.toLowerCase());
  if (value === null) return false;
  const mapped = (value >> 32n) === 0xffffn;
  if (mapped) {
    const n = Number(value & 0xffffffffn);
    return isSafeIP(`${n >>> 24}.${(n >>> 16) & 255}.${(n >>> 8) & 255}.${n & 255}`);
  }
  if (value === 0n || value === 1n || (value >> 118n) === 0x3fn || (value >> 120n) === 0xffn) return false;
  for (const [prefix, bits] of [
    [0xfe800000000000000000000000000000n, 10], [0xfc000000000000000000000000000000n, 7],
    [0x20010db8000000000000000000000000n, 32], [0x2001000000000000000000000000000000n, 23],
    [0x20010020000000000000000000000000n, 28], [0x20010030000000000000000000000000n, 28],
    [0x3ffe000000000000000000000000000000n, 16],
  ]) if ((value >> BigInt(128 - bits)) === (prefix >> BigInt(128 - bits))) return false;
  return true;
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
