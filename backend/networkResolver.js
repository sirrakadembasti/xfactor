import os from 'node:os';

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
 * Kept as an explicit, side-effect-free hook for callers that want to inspect
 * the host network. It deliberately does not replace dns.lookup or configure
 * hard-coded DNS servers.
 */
export function initNetworkResolver() {
    return getActiveNetworkAdapters();
}
