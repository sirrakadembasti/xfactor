import os from 'node:os';
import dns from 'node:dns';

/**
 * Sistemdeki tüm aktif ve bağlı (IPv4) ağ bağdaştırıcılarını otomatik tespit eder.
 */
export function getActiveNetworkAdapters() {
    const interfaces = os.networkInterfaces();
    const active = [];
    for (const [name, addrs] of Object.entries(interfaces)) {
        if (!addrs) continue;
        for (const addr of addrs) {
            if (!addr.internal && addr.family === 'IPv4') {
                active.push({
                    name,
                    address: addr.address,
                    netmask: addr.netmask,
                    mac: addr.mac
                });
            }
        }
    }
    return active;
}

let isInitialized = false;

/**
 * Node.js ağ çözümleyicisini aktif bağdaştırıcılar ve yedek DNS sunucuları ile başlatır.
 */
export function initNetworkResolver() {
    if (isInitialized) return;
    isInitialized = true;

    const activeAdapters = getActiveNetworkAdapters();
    const systemDnsServers = dns.getServers() || [];
    const fallbackServers = [...new Set([...systemDnsServers, '10.236.120.138', '8.8.8.8', '1.1.1.1', '8.8.4.4'])];

    const resolver = new dns.Resolver();
    try {
        resolver.setServers(fallbackServers);
    } catch {
        // Sessizce devam et
    }

    const originalLookup = dns.lookup;
    dns.lookup = function (hostname, options, callback) {
        let cb = callback;
        let opts = options;
        if (typeof options === 'function') {
            cb = options;
            opts = {};
        }

        originalLookup(hostname, opts, (err, address, family) => {
            if (err && (err.code === 'ENOTFOUND' || err.code === 'ETIMEOUT' || err.code === 'ECONNREFUSED')) {
                resolver.resolve4(hostname, (resErr, addresses) => {
                    if (!resErr && addresses && addresses.length > 0) {
                        if (opts?.all) {
                            return cb(null, addresses.map(addr => ({ address: addr, family: 4 })));
                        }
                        return cb(null, addresses[0], 4);
                    }
                    cb(err, address, family);
                });
                return;
            }
            cb(err, address, family);
        });
    };
}

// Otomatik başlatma
initNetworkResolver();
