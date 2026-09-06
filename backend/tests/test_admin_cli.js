import assert from 'assert';
import { EventEmitter } from 'events';
import { createTestHarness } from './testHarness.js';
import { runCreateAdmin } from '../scripts/create_admin.js';

const { runAsyncTest, finish } = createTestHarness();

class FakeInput extends EventEmitter {
    constructor({ isTTY = true } = {}) {
        super();
        this.isTTY = isTTY;
        this.rawModeTransitions = [];
    }

    setEncoding() {}
    resume() {}
    pause() {}
    setRawMode(value) {
        this.rawModeTransitions.push(value);
    }
}

class FakeOutput {
    constructor({ isTTY = true } = {}) {
        this.isTTY = isTTY;
        this.text = '';
    }

    write(value) {
        this.text += String(value);
    }
}

function nextTurn() {
    return new Promise(resolve => setImmediate(resolve));
}

await runAsyncTest('Admin CLI hides password and provisions the named user', async () => {
    const stdin = new FakeInput();
    const stdout = new FakeOutput();
    const provisionCalls = [];
    const running = runCreateAdmin({
        args: ['existing-admin'],
        stdin,
        stdout,
        provision: (username, password) => {
            provisionCalls.push({ username, password });
            return { id: 'admin-id', username, isAdmin: true };
        }
    });

    await nextTurn();
    stdin.emit('data', 'StrongPassword!2026\r');
    await nextTurn();
    stdin.emit('data', 'StrongPassword!2026\r');

    assert.deepStrictEqual(await running, {
        id: 'admin-id',
        username: 'existing-admin',
        isAdmin: true
    });
    assert.deepStrictEqual(provisionCalls, [{
        username: 'existing-admin',
        password: 'StrongPassword!2026'
    }]);
    assert.ok(!stdout.text.includes('StrongPassword!2026'), 'Password must never be echoed');
    assert.deepStrictEqual(stdin.rawModeTransitions, [true, false, true, false]);
    assert.ok(stdout.text.includes('Admin hazır: existing-admin'));
});

await runAsyncTest('Admin CLI rejects password arguments before reading terminal input', async () => {
    await assert.rejects(
        runCreateAdmin({
            args: ['admin', 'plaintext-password'],
            stdin: new FakeInput(),
            stdout: new FakeOutput(),
            provision: () => assert.fail('Provision must not run')
        }),
        /username argument/i
    );
});

await runAsyncTest('Admin CLI rejects password confirmation mismatch', async () => {
    const stdin = new FakeInput();
    const stdout = new FakeOutput();
    const running = runCreateAdmin({
        args: ['admin'],
        stdin,
        stdout,
        provision: () => assert.fail('Provision must not run')
    });

    await nextTurn();
    stdin.emit('data', 'StrongPassword!2026\r');
    await nextTurn();
    stdin.emit('data', 'DifferentPassword!2026\r');
    await assert.rejects(running, /match/i);
    assert.ok(!stdout.text.includes('StrongPassword!2026'));
    assert.ok(!stdout.text.includes('DifferentPassword!2026'));
});

await runAsyncTest('Admin CLI requires an interactive TTY', async () => {
    await assert.rejects(
        runCreateAdmin({
            args: ['admin'],
            stdin: new FakeInput({ isTTY: false }),
            stdout: new FakeOutput(),
            provision: () => assert.fail('Provision must not run')
        }),
        /TTY/i
    );
});

await runAsyncTest('Admin CLI renews password with --renew flag', async () => {
    const stdin = new FakeInput();
    const stdout = new FakeOutput();
    const renewCalls = [];
    const running = runCreateAdmin({
        args: ['admin', '--renew'],
        stdin,
        stdout,
        provision: () => assert.fail('Provision must not run'),
        renew: async (username, currentPassword, newPassword) => {
            renewCalls.push({ username, currentPassword, newPassword });
            return { username };
        }
    });

    await nextTurn();
    stdin.emit('data', 'OldPassword!2026\r');
    await nextTurn();
    stdin.emit('data', 'NewPassword!2027\r');
    await nextTurn();
    stdin.emit('data', 'NewPassword!2027\r');

    assert.deepStrictEqual(await running, { username: 'admin' });
    assert.deepStrictEqual(renewCalls, [{
        username: 'admin',
        currentPassword: 'OldPassword!2026',
        newPassword: 'NewPassword!2027'
    }]);
    assert.ok(!stdout.text.includes('OldPassword!2026'));
    assert.ok(!stdout.text.includes('NewPassword!2027'));
    assert.ok(stdout.text.includes('Parola yenilendi: admin'));
});

await runAsyncTest('Admin CLI rejects renewal on confirmation mismatch', async () => {
    const stdin = new FakeInput();
    const stdout = new FakeOutput();
    const running = runCreateAdmin({
        args: ['admin', '--renew'],
        stdin,
        stdout,
        provision: () => assert.fail('Provision must not run'),
        renew: () => assert.fail('Renew must not run')
    });

    await nextTurn();
    stdin.emit('data', 'OldPassword!2026\r');
    await nextTurn();
    stdin.emit('data', 'NewPassword!2027\r');
    await nextTurn();
    stdin.emit('data', 'DifferentPassword!2028\r');
    await assert.rejects(running, /match/i);
});

await runAsyncTest('Admin CLI rejects unknown second argument', async () => {
    await assert.rejects(
        runCreateAdmin({
            args: ['admin', '--unknown'],
            stdin: new FakeInput(),
            stdout: new FakeOutput(),
            provision: () => assert.fail('Provision must not run'),
            renew: () => assert.fail('Renew must not run')
        }),
        /renew|username argument/i
    );
});

await runAsyncTest('Admin CLI resets password with --reset flag without current password', async () => {
    const stdin = new FakeInput();
    const stdout = new FakeOutput();
    const resetCalls = [];
    const running = runCreateAdmin({
        args: ['admin', '--reset'],
        stdin,
        stdout,
        provision: () => assert.fail('Provision must not run'),
        renew: () => assert.fail('Renew must not run'),
        reset: async (username, newPassword) => {
            resetCalls.push({ username, newPassword });
            return { username };
        }
    });

    await nextTurn();
    stdin.emit('data', 'ResetPassword!2029\r');
    await nextTurn();
    stdin.emit('data', 'ResetPassword!2029\r');

    assert.deepStrictEqual(await running, { username: 'admin' });
    assert.deepStrictEqual(resetCalls, [{ username: 'admin', newPassword: 'ResetPassword!2029' }]);
    assert.ok(!stdout.text.includes('ResetPassword!2029'));
    assert.ok(stdout.text.includes('Parola sıfırlandı: admin'));
});

await runAsyncTest('Admin CLI rejects reset on confirmation mismatch', async () => {
    const stdin = new FakeInput();
    const stdout = new FakeOutput();
    const running = runCreateAdmin({
        args: ['admin', '--reset'],
        stdin,
        stdout,
        provision: () => assert.fail('Provision must not run'),
        renew: () => assert.fail('Renew must not run'),
        reset: () => assert.fail('Reset must not run')
    });

    await nextTurn();
    stdin.emit('data', 'ResetPassword!2029\r');
    await nextTurn();
    stdin.emit('data', 'DifferentPassword!2030\r');
    await assert.rejects(running, /match/i);
});

finish();
