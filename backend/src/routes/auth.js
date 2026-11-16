const express = require('express');
const db = require('../db');
const { HttpError } = require('../errors');
const {
    verifyPassword,
    createSession,
    destroySession,
    toPublicUser,
    requireUser,
} = require('../auth');

const router = express.Router();

// Simple in-memory brake on password guessing: 10 failures per
// username + address locks that pair out for 15 minutes.
const MAX_FAILURES = 10;
const LOCKOUT_MS = 15 * 60 * 1000;
const failures = new Map();

function failureKey(req, username) {
    return `${req.ip}|${username}`;
}

router.post('/login', async (req, res) => {
    const username = String(req.body?.username || '')
        .trim()
        .toLowerCase();
    const password = String(req.body?.password || '');
    if (!username || !password)
        throw new HttpError(400, 'Enter your username and password.');

    const key = failureKey(req, username);
    const record = failures.get(key);
    if (record && Date.now() - record.first > LOCKOUT_MS) failures.delete(key);
    else if (record && record.count >= MAX_FAILURES)
        throw new HttpError(
            429,
            'Too many failed attempts. Try again in 15 minutes.',
        );

    const { rows } = await db.query(
        'SELECT * FROM users WHERE username = $1 AND active',
        [username],
    );
    const user = rows[0];
    if (!user || !(await verifyPassword(password, user.password_hash))) {
        const current = failures.get(key) || { count: 0, first: Date.now() };
        failures.set(key, { ...current, count: current.count + 1 });
        throw new HttpError(401, 'Incorrect username or password.');
    }

    failures.delete(key);
    await createSession(res, user.id);
    res.send(toPublicUser(user));
});

router.post('/logout', async (req, res) => {
    await destroySession(req, res);
    res.sendStatus(204);
});

router.get('/me', requireUser, (req, res) => {
    res.send(req.user);
});

module.exports = router;
