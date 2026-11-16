const crypto = require('crypto');
const { promisify } = require('util');
const db = require('./db');
const { HttpError } = require('./errors');

const scrypt = promisify(crypto.scrypt);

const SESSION_COOKIE = 'wsid';
const SESSION_DAYS = 14;
const MIN_PASSWORD_LENGTH = 8;

async function hashPassword(password) {
    const salt = crypto.randomBytes(16);
    const key = await scrypt(password, salt, 64);
    return `scrypt$${salt.toString('base64')}$${key.toString('base64')}`;
}

async function verifyPassword(password, stored) {
    const [scheme, salt, expected] = (stored || '').split('$');
    if (scheme !== 'scrypt' || !salt || !expected) return false;
    const expectedKey = Buffer.from(expected, 'base64');
    const key = await scrypt(
        password,
        Buffer.from(salt, 'base64'),
        expectedKey.length,
    );
    return crypto.timingSafeEqual(key, expectedKey);
}

function validatePassword(password) {
    if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH)
        throw new HttpError(
            400,
            `Passwords must be at least ${MIN_PASSWORD_LENGTH} characters.`,
        );
}

function hashToken(token) {
    return crypto.createHash('sha256').update(token).digest('hex');
}

function parseCookies(header = '') {
    const cookies = {};
    for (const part of header.split(';')) {
        const index = part.indexOf('=');
        if (index === -1) continue;
        const name = part.slice(0, index).trim();
        try {
            cookies[name] = decodeURIComponent(part.slice(index + 1).trim());
        } catch {
            // ignore malformed cookie values
        }
    }
    return cookies;
}

async function createSession(res, userId) {
    const token = crypto.randomBytes(32).toString('base64url');
    const maxAge = SESSION_DAYS * 24 * 60 * 60 * 1000;
    await db.query(
        'INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)',
        [hashToken(token), userId, new Date(Date.now() + maxAge)],
    );
    await db.query('DELETE FROM sessions WHERE expires_at < now()');
    res.cookie(SESSION_COOKIE, token, {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        maxAge,
        path: '/',
    });
}

async function destroySession(req, res) {
    const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
    if (token)
        await db.query('DELETE FROM sessions WHERE token_hash = $1', [
            hashToken(token),
        ]);
    res.clearCookie(SESSION_COOKIE, { path: '/' });
}

function toPublicUser(row) {
    return {
        id: row.id,
        username: row.username,
        displayName: row.display_name,
        email: row.email,
        isSuper: row.is_super,
        active: row.active,
    };
}

// Attaches req.user when the request carries a valid session cookie.
async function authenticate(req, res, next) {
    const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
    if (token) {
        const { rows } = await db.query(
            `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
             WHERE s.token_hash = $1 AND s.expires_at > now() AND u.active`,
            [hashToken(token)],
        );
        if (rows[0]) req.user = toPublicUser(rows[0]);
    }
    next();
}

function requireUser(req, res, next) {
    if (!req.user) throw new HttpError(401, 'Please log in.');
    next();
}

function requireSuper(req, res, next) {
    if (!req.user) throw new HttpError(401, 'Please log in.');
    if (!req.user.isSuper)
        throw new HttpError(403, 'Only the super user can do that.');
    next();
}

// Blocks cross-site form posts and scripts from acting with a user's cookie.
function sameOriginOnly(req, res, next) {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    const origin = req.headers.origin;
    if (origin) {
        const host = req.headers['x-forwarded-host'] || req.headers.host;
        let originHost;
        try {
            originHost = new URL(origin).host;
        } catch {
            originHost = null;
        }
        if (originHost !== host)
            throw new HttpError(403, 'Cross-site request blocked.');
    }
    next();
}

// Creates the super user from SUPERUSER_USERNAME / SUPERUSER_PASSWORD the
// first time the app starts with them set.
async function ensureSuperuser() {
    const { SUPERUSER_USERNAME, SUPERUSER_PASSWORD, SUPERUSER_NAME } =
        process.env;
    if (!SUPERUSER_USERNAME || !SUPERUSER_PASSWORD) {
        const { rows } = await db.query(
            'SELECT 1 FROM users WHERE is_super LIMIT 1',
        );
        if (!rows.length)
            console.warn(
                'No super user exists. Set SUPERUSER_USERNAME and SUPERUSER_PASSWORD to create one.',
            );
        return;
    }

    const username = SUPERUSER_USERNAME.trim().toLowerCase();
    const { rows } = await db.query('SELECT 1 FROM users WHERE username = $1', [
        username,
    ]);
    if (rows.length) return;

    validatePassword(SUPERUSER_PASSWORD);
    await db.query(
        `INSERT INTO users (username, display_name, email, password_hash, is_super)
         VALUES ($1, $2, $3, $4, true)`,
        [
            username,
            SUPERUSER_NAME || SUPERUSER_USERNAME,
            process.env.SUPERUSER_EMAIL || null,
            await hashPassword(SUPERUSER_PASSWORD),
        ],
    );
    console.log(`Created super user "${username}"`);
}

module.exports = {
    hashPassword,
    verifyPassword,
    validatePassword,
    parseCookies,
    createSession,
    destroySession,
    toPublicUser,
    authenticate,
    requireUser,
    requireSuper,
    sameOriginOnly,
    ensureSuperuser,
};
