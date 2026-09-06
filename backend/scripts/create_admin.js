import { pathToFileURL } from 'url';
import { changeUserPassword, promoteUserToAdmin, resetUserPassword } from '../auth.js';

export function readTerminalLine(prompt, {
    hidden = false,
    stdin = process.stdin,
    stdout = process.stdout
} = {}) {
    if (!stdin?.isTTY || !stdout?.isTTY || typeof stdin.setRawMode !== 'function') {
        return Promise.reject(new Error('Admin provisioning requires an interactive TTY.'));
    }

    stdout.write(prompt);
    stdin.setEncoding('utf8');
    stdin.setRawMode(true);
    stdin.resume();

    return new Promise((resolve, reject) => {
        let value = '';
        let settled = false;

        const cleanup = () => {
            if (settled) return;
            settled = true;
            stdin.off('data', onData);
            stdin.setRawMode(false);
            stdin.pause();
            stdout.write('\n');
        };

        const onData = chunk => {
            for (const character of String(chunk)) {
                if (character === '\u0003') {
                    cleanup();
                    reject(new Error('Admin provisioning cancelled.'));
                    return;
                }
                if (character === '\r' || character === '\n') {
                    cleanup();
                    resolve(value);
                    return;
                }
                if (character === '\u007f' || character === '\b') {
                    if (value.length > 0) {
                        value = value.slice(0, -1);
                        if (!hidden) stdout.write('\b \b');
                    }
                    continue;
                }
                if (character >= ' ') {
                    value += character;
                    if (!hidden) stdout.write(character);
                }
            }
        };

        stdin.on('data', onData);
    });
}

export async function runCreateAdmin({
    args = process.argv.slice(2),
    stdin = process.stdin,
    stdout = process.stdout,
    provision = promoteUserToAdmin,
    renew = changeUserPassword,
    reset = resetUserPassword
} = {}) {
    const mode = args.length === 2 && (args[1] === '--renew' || args[1] === '--reset') ? args[1] : null;
    if (!Array.isArray(args) || args.length > 2 || (args.length === 2 && mode === null)) {
        throw new Error('Pass at most one username argument, optionally followed by --renew or --reset; passwords are prompted interactively.');
    }

    const username = String(args[0] || await readTerminalLine('Kullanıcı adı: ', {
        stdin,
        stdout
    })).trim();
    stdout.write('Parola en az 12 karakter olmalı (en fazla 256); iki giriş aynı olmalı.\n');
    if (mode === '--reset') {
        const newPassword = await readTerminalLine('Yeni parola: ', {
            hidden: true,
            stdin,
            stdout
        });
        const confirmation = await readTerminalLine('Yeni parola tekrar: ', {
            hidden: true,
            stdin,
            stdout
        });

        if (newPassword !== confirmation) {
            throw new Error('Password confirmation does not match.');
        }

        const user = await reset(username, newPassword);
        stdout.write(`Parola sıfırlandı: ${user.username}\n`);
        return user;
    }
    if (mode === '--renew') {
        const currentPassword = await readTerminalLine('Mevcut parola: ', {
            hidden: true,
            stdin,
            stdout
        });
        const newPassword = await readTerminalLine('Yeni parola: ', {
            hidden: true,
            stdin,
            stdout
        });
        const confirmation = await readTerminalLine('Yeni parola tekrar: ', {
            hidden: true,
            stdin,
            stdout
        });

        if (newPassword !== confirmation) {
            throw new Error('Password confirmation does not match.');
        }

        const user = await renew(username, currentPassword, newPassword);
        stdout.write(`Parola yenilendi: ${user.username}\n`);
        return user;
    }
    const password = await readTerminalLine('Parola: ', {
        hidden: true,
        stdin,
        stdout
    });
    const confirmation = await readTerminalLine('Parola tekrar: ', {
        hidden: true,
        stdin,
        stdout
    });

    if (password !== confirmation) {
        throw new Error('Password confirmation does not match.');
    }

    const user = await provision(username, password);
    stdout.write(`Admin hazır: ${user.username}\n`);
    return user;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    runCreateAdmin().catch(error => {
        process.stderr.write(`${error.message}\n`);
        process.exitCode = 1;
    });
}
