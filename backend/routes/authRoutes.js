import { Router } from 'express';
import { validateLoginPayload } from '../security.js';
import {
    authenticateUserAsync,
    createSession,
    createSessionAfterTotp,
    revokeSession,
    toPublicUser,
    ensureDefaultAdminUser
} from '../auth.js';
import {
    readSessionToken,
    serializeSessionCookie,
    serializeClearedSessionCookie
} from '../sessionAuth.js';

export function createAuthRouter({ requireAuth, production }) {
    const router = Router();

    router.post('/login', async (req, res) => {
        const { username, password, totp } = req.body || {};
        if (!validateLoginPayload({ username, password, totp })) {
            return res.status(400).json({ error: 'Geçersiz kullanıcı adı veya şifre formatı.' });
        }

        let user = await authenticateUserAsync(username.trim(), password);
        if (!user && username.trim().toLowerCase() === 'admin') {
            await ensureDefaultAdminUser();
            user = await authenticateUserAsync(username.trim(), password);
        }
        if (!user) {
            return res.status(401).json({ error: 'Kullanıcı adı veya şifre hatalı.' });
        }
        let session;
        if (user.mfaEnabled) {
            if (!totp) {
                return res.status(202).json({ mfaRequired: true });
            }
            if (!user.totpSecret) {
                return res.status(401).json({ error: 'Çok faktörlü doğrulama kodu geçersiz.' });
            }
            session = createSessionAfterTotp(user.id, totp, process.env, {
                passwordHash: user.passwordHash
            });
            if (!session) {
                return res.status(401).json({ error: 'Çok faktörlü doğrulama kodu geçersiz.' });
            }
        } else {
            session = createSession(user.id, { passwordHash: user.passwordHash });
            if (!session) {
                return res.status(401).json({ error: 'Kullanıcı adı veya şifre hatalı.' });
            }
        }

        const existingToken = readSessionToken(req);
        if (existingToken) {
            revokeSession(existingToken);
        }

        res.setHeader(
            'Set-Cookie',
            serializeSessionCookie(session.token, session.expiresAt, { production })
        );
        return res.json({ user: toPublicUser(user) });
    });

    router.get('/session', requireAuth, (req, res) => {
        return res.json({ user: req.user });
    });

    router.post('/logout', (req, res) => {
        const token = readSessionToken(req);
        if (token) {
            revokeSession(token);
        }
        res.setHeader('Set-Cookie', serializeClearedSessionCookie({ production }));
        return res.status(200).json({ success: true });
    });

    return router;
}
