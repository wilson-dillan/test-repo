const fs = require('fs');
const path = require('path');
const { Pool, types } = require('pg');

// Return DATE columns as plain 'YYYY-MM-DD' strings instead of JS Dates,
// which would shift by the server's time zone.
types.setTypeParser(types.builtins.DATE, (value) => value);

let pool;

async function init(connectionString = process.env.DATABASE_URL) {
    if (!connectionString) throw new Error('DATABASE_URL is not set');

    pool = new Pool({
        connectionString,
        ssl:
            process.env.DATABASE_SSL === 'true'
                ? { rejectUnauthorized: false }
                : undefined,
    });

    // The database container may still be starting; retry for a bit.
    for (let attempt = 1; ; attempt++) {
        try {
            await pool.query('SELECT 1');
            break;
        } catch (err) {
            if (attempt >= 15) throw err;
            await new Promise((r) => setTimeout(r, 2000));
        }
    }

    await pool.query(
        fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'),
    );
}

async function teardown() {
    if (pool) await pool.end();
}

function query(sql, params) {
    return pool.query(sql, params);
}

async function transaction(fn) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const result = await fn(client);
        await client.query('COMMIT');
        return result;
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}

module.exports = { init, teardown, query, transaction };
