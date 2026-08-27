import { Router } from 'express';
import { validateLoginPayload } from '../security.js';
import {
    authenticateUser,
    authenticateUserAsync,
    createSession,
    revokeSession,
    toPublicUser
} from '../auth.js';
import {
    readSessionToken,
    serializeSessionCookie,
    serializeClearedSessionCookie
} from '../sessionAuth.js';

export function createAuthRouter({ requireAuth, production }) {
    const router = Router();

    router.post('/login', async (req, res) => {
        const { username, password } = req.body || {};
        if (!validateLoginPayload({ username, password })) {
            return res.status(400).json({ error: 'Geçersiz kullanıcı adı veya şifre formatı.' });
        }

        const user = await authenticateUserAsync(username.trim(), password);
        if (!user) {
            return res.status(401).json({ error: 'Kullanıcı adı veya şifre hatalı.' });
        }
        const existingToken = readSessionToken(req);
        if (existingToken) {
            revokeSession(existingToken);
        }

        const session = createSession(user.id);
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
