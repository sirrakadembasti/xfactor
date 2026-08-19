import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { validateLoginPayload } from '../security.js';
import { authenticateUser, findUserByUsername } from '../auth.js';

export function createAuthRouter({ JWT_SECRET, ADMIN_USER, ADMIN_PASS }) {
    const router = Router();

    // Login Endpoint
    router.post('/login', (req, res) => {
        const { username, password } = req.body || {};
        if (!validateLoginPayload({ username, password })) {
            return res.status(400).json({ error: "Geçersiz kullanıcı adı veya şifre formatı." });
        }

        const cleanUsername = typeof username === 'string' ? username.trim() : '';
        const dbUser = cleanUsername ? findUserByUsername(cleanUsername) : null;
        const credentialsMatch = dbUser ? authenticateUser(cleanUsername, password) : false;
        const envAdminMatch = cleanUsername === ADMIN_USER && password === ADMIN_PASS;

        if (credentialsMatch || envAdminMatch) {
            const payload = dbUser
                ? { userId: dbUser.id, username: dbUser.username }
                : { username: ADMIN_USER };

            const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '24h' });
            return res.json({ token, user: payload });
        }

        return res.status(401).json({ error: "Kullanıcı adı veya şifre hatalı." });
    });

    return router;
}
