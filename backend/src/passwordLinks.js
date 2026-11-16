const crypto = require('crypto');
const db = require('./db');
const { HttpError } = require('./errors');

// One-time links that let someone choose a password: an "invite" for a
// new user, or a "reset" for an existing one. Only a hash of the token is
// stored, like a password.
const LIFETIME_HOURS = {
    invite: 48, // sent by the super user to a new user
    reset: 48, // sent by the super user from the Users page
    forgot: 1, // requested by anyone from the login page
};

function hashToken(token) {
    return crypto.createHash('sha256').update(token).digest('hex');
}

// Creates a link token for a user, replacing any earlier unused ones.
async function createToken(userId, kind) {
    const token = crypto.randomBytes(32).toString('base64url');
    const purpose = kind === 'invite' ? 'invite' : 'reset';
    const expiresAt = new Date(Date.now() + LIFETIME_HOURS[kind] * 3600000);
    await db.query(
        'DELETE FROM password_tokens WHERE user_id = $1 AND used_at IS NULL',
        [userId],
    );
    await db.query(
        `INSERT INTO password_tokens (token_hash, user_id, purpose, expires_at)
         VALUES ($1, $2, $3, $4)`,
        [hashToken(token), userId, purpose, expiresAt],
    );
    return { token, purpose, hours: LIFETIME_HOURS[kind] };
}

// Looks up a token, explaining why it can't be used if so.
async function findToken(token) {
    const { rows } = await db.query(
        `SELECT t.*, u.username, u.display_name, u.active
         FROM password_tokens t JOIN users u ON u.id = t.user_id
         WHERE t.token_hash = $1`,
        [hashToken(String(token || ''))],
    );
    const row = rows[0];
    if (!row || !row.active)
        throw new HttpError(404, 'This link is not valid. Ask for a new one.');
    if (row.used_at)
        throw new HttpError(
            410,
            'This link was already used. If you need to change your password again, use "Forgot password?" on the login page.',
        );
    if (row.expires_at < new Date())
        throw new HttpError(
            410,
            'This link has expired. Use "Forgot password?" on the login page, or ask your super user to send a new one.',
        );
    return row;
}

module.exports = { createToken, findToken, hashToken, LIFETIME_HOURS };
