import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { Agent } from 'undici';
import dns from 'node:dns';

test('provider socket lookup rejects every private address including mixed DNS answers', async () => {
  const { createPublicLookup } = await import('../llm-auth/providerTransport.js');
  const lookup = answers => new Promise((resolve, reject) => createPublicLookup({
    resolver: (_, __, callback) => callback(null, answers.map(address => ({ address, family: address.includes(':') ? 6 : 4 })))
  })('provider.example', { all: true }, (error, result) => error ? reject(error) : resolve(result)));
  for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.1.1', '192.168.0.1', '169.254.169.254', '100.64.1.1', '::1', 'fd00::1', 'fe80::1', '::ffff:127.0.0.1', '2001:db8::1']) {
    await assert.rejects(() => lookup([ip]), /private|public/i);
  }
  await assert.rejects(() => lookup(['8.8.8.8', '10.0.0.1']), /private|public/i);
  assert.deepEqual(await lookup(['8.8.8.8']), [{ address: '8.8.8.8', family: 4 }]);
  assert.deepEqual(await lookup(['2606:4700:4700::1111']), [{ address: '2606:4700:4700::1111', family: 6 }]);
});

test('provider lookup follows the active platform resolver after initialization', async () => {
  const { createPublicLookup } = await import('../llm-auth/providerTransport.js');
  const original = dns.lookup;
  try {
    dns.lookup = (_, __, callback) => callback(null, [{ address: '8.8.8.8', family: 4 }]);
    const lookup = createPublicLookup();
    dns.lookup = (_, __, callback) => callback(null, [{ address: '9.9.9.9', family: 4 }]);
    const result = await new Promise((resolve, reject) => lookup('provider.example', { all: true },
      (error, addresses) => error ? reject(error) : resolve(addresses)));
    assert.equal(result[0].address, '9.9.9.9');
  } finally { dns.lookup = original; }
});

test('the real HTTP connector blocks private DNS before making any request', async () => {
  const { createPublicLookup, providerFetch } = await import('../llm-auth/providerTransport.js');
  let requests = 0;
  const server = http.createServer((_, res) => { requests++; res.end('private'); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const dispatcher = new Agent({ connect: { lookup: createPublicLookup({
    resolver: (_, __, callback) => callback(null, [{ address: '127.0.0.1', family: 4 }])
  }) } });
  try {
    await assert.rejects(() => fetch(`http://provider.example:${server.address().port}`, { dispatcher }),
      error => /public|private/.test(error.cause?.message || ''));
    assert.equal(requests, 0);
    assert.throws(() => providerFetch('https://127.0.0.1/v1'), /public HTTPS/);
  } finally { await dispatcher.close(); await new Promise(resolve => server.close(resolve)); }
});
