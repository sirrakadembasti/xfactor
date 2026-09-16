import os from 'node:os';
import dns from 'node:dns';

let isInitialized = false;

/**
 * Return active non-internal IPv4 interfaces for diagnostics and explicit
 * networking configuration. Node's default resolver remains authoritative.
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

/**
 * Initializes network resolver with a transparent fallback to direct DNS
 * resolution (dns.resolve4) when the OS getaddrinfo (dns.lookup) fails
 * with ENOTFOUND/EAI_AGAIN on restricted or corporate Windows networks.
 */
export function initNetworkResolver() {
    if (!isInitialized) {
        isInitialized = true;
        const originalLookup = dns.lookup;
        dns.lookup = function (hostname, options, callback) {
            if (typeof options === 'function') {
                callback = options;
                options = {};
            }
            originalLookup(hostname, options, (err, address, family) => {
                if (err && (err.code === 'ENOTFOUND' || err.code === 'EAI_AGAIN')) {
                    dns.resolve4(hostname, (err4, addresses) => {
                        if (!err4 && Array.isArray(addresses) && addresses.length > 0) {
                            if (options && options.all) {
                                return callback(null, addresses.map(addr => ({ address: addr, family: 4 })));
                            }
                            return callback(null, addresses[0], 4);
                        }
                        callback(err, address, family);
                    });
                    return;
                }
                callback(err, address, family);
            });
        };
    }
    return getActiveNetworkAdapters();
}

