const express = require('express');
const db = require('../db');
const { HttpError } = require('../errors');
const {
    hashPassword,
    validatePassword,
    verifyPassword,
    createSession,
    destroySession,
    toPublicUser,
    requireUser,
} = require('../auth');
const mailer = require('../mailer');
const { createToken, findToken, hashToken } = require('../passwordLinks');

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

// "Forgot password?": emails a 1-hour reset link and tells the super user.
// The answer is the same whether or not the account exists, so this can't
// be used to discover usernames or emails.
const forgotRequests = new Map();
const FORGOT_LIMIT = 5;

router.post('/forgot', async (req, res) => {
    const login = String(req.body?.login || '')
        .trim()
        .toLowerCase();
    if (!login) throw new HttpError(400, 'Enter your username or email.');

    const recent = (forgotRequests.get(req.ip) || []).filter(
        (t) => Date.now() - t < LOCKOUT_MS,
    );
    if (recent.length >= FORGOT_LIMIT)
        throw new HttpError(
            429,
            'Too many reset requests. Try again in 15 minutes.',
        );
    forgotRequests.set(req.ip, [...recent, Date.now()]);

    res.send({
        message:
            "If that account exists, we've emailed a link to reset the password. It expires in 1 hour.",
    });

    // Work happens after replying so the response time gives nothing away.
    try {
        const { rows } = await db.query(
            'SELECT * FROM users WHERE active AND (username = $1 OR lower(email) = $1) LIMIT 1',
            [login],
        );
        const user = rows[0];
        if (!user) return;

        let outcome = { linkSent: false };
        if (user.email) {
            try {
                await mailer.sendPasswordLink(
                    user,
                    await createToken(user.id, 'forgot'),
                );
                outcome = { linkSent: true };
            } catch (err) {
                outcome = { linkSent: false, error: err.message };
            }
        }
        await mailer.notifyResetRequested(user, outcome);
    } catch (err) {
        console.error('Forgot-password request failed:', err);
    }
});

// The "set your password" page checks its link before showing the form.
router.get('/password-link/:token', async (req, res) => {
    const link = await findToken(req.params.token);
    res.send({
        username: link.username,
        displayName: link.display_name,
        purpose: link.purpose,
    });
});

// Sets the password, uses up the link, signs the user out everywhere else
// and logs them in here.
router.post('/password-link/:token', async (req, res) => {
    const link = await findToken(req.params.token);
    validatePassword(req.body?.password);

    const { rowCount } = await db.query(
        'UPDATE password_tokens SET used_at = now() WHERE token_hash = $1 AND used_at IS NULL',
        [hashToken(req.params.token)],
    );
    if (!rowCount) throw new HttpError(410, 'This link was already used.');

    await db.query('UPDATE users SET password_hash = $2 WHERE id = $1', [
        link.user_id,
        await hashPassword(req.body.password),
    ]);
    await db.query(
        'DELETE FROM password_tokens WHERE user_id = $1 AND used_at IS NULL',
        [link.user_id],
    );
    await db.query('DELETE FROM sessions WHERE user_id = $1', [link.user_id]);
    await createSession(res, link.user_id);

    const { rows } = await db.query('SELECT * FROM users WHERE id = $1', [
        link.user_id,
    ]);
    res.send(toPublicUser(rows[0]));
});

module.exports = router;
