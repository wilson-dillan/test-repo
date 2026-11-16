const express = require('express');
const db = require('../db');
const { HttpError } = require('../errors');
const {
    hashPassword,
    validatePassword,
    toPublicUser,
    requireUser,
    requireSuper,
} = require('../auth');
const { sendTestEmail } = require('../mailer');

const router = express.Router();

const USERNAME_PATTERN = /^[a-z0-9._-]{2,40}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function cleanDisplayName(value) {
    const name = String(value || '').trim();
    if (!name || name.length > 80)
        throw new HttpError(400, 'Enter a name (up to 80 characters).');
    return name;
}

function cleanEmail(value) {
    const email = String(value || '').trim();
    if (!email) return null;
    if (!EMAIL_PATTERN.test(email) || email.length > 200)
        throw new HttpError(400, 'Enter a valid email address.');
    return email;
}

// Everyone can list users (to pick an owner); only the super user sees
// emails and deactivated accounts.
router.get('/', requireUser, async (req, res) => {
    const { rows } = await db.query(
        `SELECT * FROM users ${req.user.isSuper ? '' : 'WHERE active'}
         ORDER BY active DESC, lower(display_name)`,
    );
    res.send(
        rows.map((row) => {
            const user = toPublicUser(row);
            if (!req.user.isSuper) delete user.email;
            return user;
        }),
    );
});

router.post('/', requireSuper, async (req, res) => {
    const username = String(req.body?.username || '')
        .trim()
        .toLowerCase();
    if (!USERNAME_PATTERN.test(username))
        throw new HttpError(
            400,
            'Usernames are 2-40 characters: letters, numbers, dots, dashes or underscores.',
        );
    const displayName = cleanDisplayName(req.body.displayName);
    const email = cleanEmail(req.body.email);
    validatePassword(req.body.password);

    const { rows: existing } = await db.query(
        'SELECT 1 FROM users WHERE username = $1',
        [username],
    );
    if (existing.length)
        throw new HttpError(409, `The username "${username}" is taken.`);

    const { rows } = await db.query(
        `INSERT INTO users (username, display_name, email, password_hash, is_super)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [
            username,
            displayName,
            email,
            await hashPassword(req.body.password),
            Boolean(req.body.isSuper),
        ],
    );
    res.status(201).send(toPublicUser(rows[0]));
});

// Sends a test message so the super user can check email settings. Any
// failure comes back with an explanation.
router.post('/test-email', requireSuper, async (req, res) => {
    const to = cleanEmail(req.body?.to || req.user.email);
    if (!to)
        throw new HttpError(400, 'Enter an email address to send the test to.');
    try {
        await sendTestEmail(to, req.user);
    } catch (err) {
        throw new HttpError(502, err.message);
    }
    res.send({ sentTo: to });
});

router.patch('/:id', requireSuper, async (req, res) => {
    const id = Number(req.params.id);
    const { rows: found } = await db.query(
        'SELECT * FROM users WHERE id = $1',
        [id],
    );
    if (!found[0]) throw new HttpError(404, 'User not found.');

    const isSelf = id === req.user.id;
    const updates = {};
    const body = req.body || {};

    if ('displayName' in body)
        updates.display_name = cleanDisplayName(body.displayName);
    if ('email' in body) updates.email = cleanEmail(body.email);
    if ('password' in body) {
        validatePassword(body.password);
        updates.password_hash = await hashPassword(body.password);
    }
    if ('isSuper' in body) {
        if (isSelf && !body.isSuper)
            throw new HttpError(
                400,
                "You can't remove your own super user access.",
            );
        updates.is_super = Boolean(body.isSuper);
    }
    if ('active' in body) {
        if (isSelf && !body.active)
            throw new HttpError(400, "You can't deactivate your own account.");
        updates.active = Boolean(body.active);
    }

    const columns = Object.keys(updates);
    if (!columns.length) return res.send(toPublicUser(found[0]));

    const { rows } = await db.query(
        `UPDATE users SET ${columns.map((c, i) => `${c} = $${i + 2}`).join(', ')}
         WHERE id = $1 RETURNING *`,
        [id, ...columns.map((c) => updates[c])],
    );

    // A password reset or deactivation signs the user out everywhere.
    if (updates.password_hash || updates.active === false)
        await db.query('DELETE FROM sessions WHERE user_id = $1', [id]);

    res.send(toPublicUser(rows[0]));
});

module.exports = router;
