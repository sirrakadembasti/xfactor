import assert from 'node:assert/strict';
import { test } from 'node:test';
import { prepareAPIFixture, verifyAPIContract } from '../verification/apiVerifier.js';

const management = { needed: true, resources: [
    { name: 'Room', apiPath: '/api/rooms', operations: ['create'] }
], roles: [{ name: 'admin', permissions: [{ resource: 'Room', operations: ['create'] }] }] };
const step = () => ({ name: 'room', resource: 'Room', role: 'admin', createPath: '/api/rooms', createBody: { roomNumber: '{nonce}-room' } });
const prepare = (fixture, requestAsRole, extra = {}) => prepareAPIFixture({ fixture, management,
    apiBaseUrl: 'http://service:3001', nonce: 'unique-test', roleRequest: requestAsRole, ...extra });

test('fixture setup captures actual typed IDs, chains prerequisites, and renders relative ISO dates', async () => {
    const calls = [];
    const result = await prepare({ setup: [step(), { ...step(), name: 'second', createBody: { roomId: '{fixture:room.id}' } }],
        createBody: { roomId: '{fixture:second.id}', note: '{nonce}', starts: '{date:+1d}' } }, async request => {
        calls.push(request);
        return { statusCode: 201, data: { data: { id: calls.length === 1 ? 'actual-room-uuid' : 42 } } };
    }, { now: new Date('2026-10-19T12:00:00Z') });
    assert.equal(calls[0].role, 'admin');
    assert.equal(calls[0].url, 'http://service:3001/api/rooms');
    assert.equal(calls[1].data.roomId, 'actual-room-uuid');
    assert.deepEqual(result.createBody, { roomId: 42, note: 'unique-test', starts: '2026-10-20T12:00:00.000Z' });
});

test('fixture setup rejects unsafe paths and undeclared permissions before any HTTP request', async () => {
    for (const path of ['https://evil.invalid/api/rooms', '//evil.invalid/api/rooms', '/api/%2e%2e/secret', '/api/rooms?key=x', '/api/rooms#x', '/api/rooms\\evil']) {
        let calls = 0;
        await assert.rejects(prepare({ setup: [step(), { ...step(), name: 'bad', createPath: path }] }, async () => { calls++; }), /fixture|path/i);
        assert.equal(calls, 0);
    }
    for (const invalid of [{ role: 'intruder' }, { resource: 'Absent' }, { role: 'admin', createPath: '/api/other' }]) {
        let calls = 0;
        await assert.rejects(prepare({ setup: [{ ...step(), ...invalid }] }, async () => { calls++; }), /fixture|role|permission|resource/i);
        assert.equal(calls, 0);
    }
});

test('fixture setup fails closed for unresolved/forward references, oversized setup and failed creation', async () => {
    let calls = 0;
    for (const fixture of [
        { setup: [step()], createBody: { id: '{fixture:missing.id}' } },
        { setup: [{ ...step(), createBody: { id: '{fixture:later.id}' } }, { ...step(), name: 'later' }] },
        { setup: [step()], createBody: { id: 'prefix-{fixture:room.id}' } },
        { setup: Array.from({ length: 9 }, (_, i) => ({ ...step(), name: `room${i}` })) }
    ]) {
        await assert.rejects(prepare(fixture, async () => { calls++; }), /fixture|reference|setup/i);
    }
    assert.equal(calls, 0);
    for (const response of [{ statusCode: 500, data: { id: 'fake' } }, { statusCode: 201, data: {} }]) {
        await assert.rejects(prepare({ setup: [step()] }, async () => response), /fixture|setup|ID/i);
    }
});

test('a rejected fixture names the status, the contract fields sent and the application answer so a repair can find the cause', async () => {
    await assert.rejects(prepare({ setup: [step()] }, async () => ({ statusCode: 400,
        data: { success: false, error: 'Doğrulama hatası', message: 'Kategori zorunludur',
            details: [{ field: 'categoryId', message: 'Kategori zorunludur' }] } })), error =>
        error.message.includes('Fixture setup failed to create room with an actual ID (POST /api/rooms HTTP 400; contract fields: roomNumber; ')
        && error.message.includes('response: Doğrulama hatası | Kategori zorunludur | [{"field":"categoryId","message":"Kategori zorunludur"}]'));
    await assert.rejects(prepare({ setup: [step()] }, async () => ({ statusCode: 201, data: {} })),
        /HTTP 201; contract fields: roomNumber\)\.$/);
});

test('main create and retention setup use captured IDs while negative probes and retention readback remain enforced', async () => {
    const calls = [];
    let parent;
    let related;
    let roomCount = 0;
    const rooms = [];
    const contract = { management: { needed: true, resources: [
        { ...management.resources[0], operations: ['create', 'read'], verification: {
            identityField: 'roomNumber', createBody: { roomNumber: '{nonce}' }
        } },
        { name: 'Guest', apiPath: '/api/guests', operations: ['create', 'read', 'delete'],
            deletionPolicy: { relatedData: 'preserve' }, verification: {
                itemPath: '/api/guests/{id}', identityField: 'fullName', deleteExpectation: { kind: 'absent' },
                setup: [step()], createBody: { fullName: '{nonce}', roomId: '{fixture:room.id}' },
                retention: { setup: [step()], createPath: '/api/reservations', itemPath: '/api/reservations/{id}', parentField: 'guestId',
                    createBody: { guestId: '{parentId}', roomId: '{fixture:room.id}', note: '{nonce}' } }
            } }
    ], roles: [
        { name: 'admin', permissions: [{ resource: 'Room', operations: ['create', 'read'] }, { resource: 'Guest', operations: ['create', 'read', 'delete'] }] },
        { name: 'viewer', permissions: [{ resource: 'Guest', operations: ['read'] }] }
    ] } };
    const adapter = { id: 'fixture-integration', request: async req => { calls.push({ ...req, role: 'anonymous' }); return { statusCode: 403, data: {} }; },
        requestAsRole: async req => {
            calls.push(req);
            if (req.url.endsWith('/api/rooms') && req.method === 'POST') {
                if (req.role !== 'admin') return { statusCode: 403, data: {} };
                if (req.data.roomNumber.length > 20) return { statusCode: 400, data: { error: 'roomNumber exceeds 20 characters' } };
                const room = { id: `actual-room-${++roomCount}`, ...req.data };
                rooms.push(room); return { statusCode: 201, data: room };
            }
            if (req.url.endsWith('/api/rooms') && req.method === 'GET') return { statusCode: 200, data: rooms };
            if (req.url.endsWith('/api/guests') && req.method === 'POST') {
                if (req.role !== 'admin') return { statusCode: 403, data: {} };
                assert.match(req.data.roomId, /^actual-room-/);
                parent = { id: 'guest-uuid', fullName: req.data.fullName };
                return { statusCode: 201, data: parent };
            }
            if (req.url.endsWith('/api/guests') && req.method === 'GET') return { statusCode: 200, data: parent ? [parent] : [] };
            if (req.url.endsWith('/api/reservations') && req.method === 'POST') {
                assert.match(req.data.roomId, /^actual-room-/);
                related = { id: 'reservation-uuid', ...req.data };
                return { statusCode: 201, data: related };
            }
            if (req.url.endsWith('/api/reservations/reservation-uuid')) return { statusCode: 200, data: related };
            if (req.url.endsWith('/api/guests/guest-uuid') && req.method === 'DELETE') {
                if (req.role !== 'admin') return { statusCode: 403, data: {} };
                parent = null; return { statusCode: 200, data: {} };
            }
            return { statusCode: 404, data: {} };
        } };
    const result = await verifyAPIContract('http://service:3001', null, contract, { adapter });
    assert.equal(result.passed, true, JSON.stringify(result.issues));
    assert.equal(result.checks.find(c => c.name === 'api_delete_related_retention')?.status, 'passed', JSON.stringify(result.issues));
    assert.equal(result.checks.find(c => c.name === 'api_role_create_denied')?.status, 'passed');
    assert.ok(calls.some(c => c.role === 'anonymous' && c.method === 'POST' && c.url.endsWith('/api/guests') && /^actual-room-/.test(c.data.roomId)));
});

test('management probes keep create, update and denied identities within short text fields', async () => {
    let record = null;
    const identities = [];
    const contract = { management: { needed: true, resources: [{
        name: 'Room', apiPath: '/api/rooms', operations: ['create', 'read', 'update'],
        verification: { identityField: 'roomNumber', createBody: { roomNumber: '{nonce}' },
            updateBody: { roomNumber: '{nonce}' }, itemPath: '/api/rooms/{id}', updateMethod: 'PATCH' }
    }], roles: [
        { name: 'admin', permissions: [{ resource: 'Room', operations: ['create', 'read', 'update'] }] },
        { name: 'viewer', permissions: [{ resource: 'Room', operations: ['read'] }] }
    ] } };
    const request = async req => {
        if (req.method === 'GET') return { statusCode: 200, data: record ? [record] : [] };
        identities.push(req.data.roomNumber);
        if (!req.role || req.role !== 'admin') return { statusCode: 403, data: {} };
        if (req.data.roomNumber.length > 20) return { statusCode: 400, data: {} };
        record = { id: 'actual-room-id', ...req.data };
        return { statusCode: req.method === 'POST' ? 201 : 200, data: record };
    };
    const result = await verifyAPIContract('http://service:3001', null, contract,
        { adapter: { id: 'short-domain-field', request, requestAsRole: request } });
    assert.equal(result.passed, true, JSON.stringify(result.issues));
    assert.equal(result.checks.find(c => c.name === 'api_update_persistence')?.status, 'passed');
    assert.ok(identities.length >= 5, 'create/update and forbidden/anonymous paths must all run');
    assert.ok(identities.every(identity => identity.length <= 20));
    assert.ok(new Set(identities).size >= 3, 'create, update and denial use independent identities');
});
