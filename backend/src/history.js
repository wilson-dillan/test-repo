const db = require('./db');
const { HttpError } = require('./errors');

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function text(label, maxLength, { required = true } = {}) {
    return async (value) => {
        const result = String(value ?? '').trim();
        if (required && !result)
            throw new HttpError(400, `${label} is required.`);
        if (result.length > maxLength)
            throw new HttpError(
                400,
                `${label} must be ${maxLength} characters or fewer.`,
            );
        return result;
    };
}

async function date(value) {
    if (value === null || value === '' || value === undefined) return null;
    const result = String(value);
    if (!DATE_PATTERN.test(result) || isNaN(Date.parse(result)))
        throw new HttpError(400, 'Enter a valid due date.');
    return result;
}

async function owner(value, client) {
    const id = Number(value);
    const { rows } = await client.query(
        'SELECT 1 FROM users WHERE id = $1 AND active',
        [Number.isInteger(id) ? id : -1],
    );
    if (!rows.length)
        throw new HttpError(400, 'Choose an active user as owner.');
    return String(id);
}

async function state(value) {
    if (value !== 'todo' && value !== 'done')
        throw new HttpError(400, 'State must be To Do or Done.');
    return value;
}

async function active(value) {
    if (typeof value !== 'boolean')
        throw new HttpError(400, 'Active must be true or false.');
    return String(value);
}

// The fields users can change on each kind of record, with how to
// validate them. Every change to one of these is recorded in history.
const EDITABLE_FIELDS = {
    project: {
        customer_name: text('Customer name', 200),
        address: text('Address', 300),
        due_date: date,
        owner_id: owner,
        state,
        active,
    },
    task: {
        owner_id: owner,
        state,
        notes: text('Notes', 5000, { required: false }),
    },
};

const TABLES = { project: 'projects', task: 'tasks' };

function toText(value) {
    return value === null || value === undefined ? null : String(value);
}

async function lockRow(client, kind, id) {
    const { rows } = await client.query(
        `SELECT * FROM ${TABLES[kind]} WHERE id = $1 FOR UPDATE`,
        [id],
    );
    if (!rows[0])
        throw new HttpError(
            404,
            kind === 'project' ? 'Project not found.' : 'Task not found.',
        );
    return rows[0];
}

async function writeFields(client, kind, id, values) {
    const sets = values.map(([field], i) => `${field} = $${i + 2}`);
    const state = values.find(([field]) => field === 'state');
    if (state)
        sets.push(`completed_at = ${state[1] === 'done' ? 'now()' : 'NULL'}`);
    await client.query(
        `UPDATE ${TABLES[kind]} SET ${sets.join(', ')} WHERE id = $1`,
        [id, ...values.map(([, value]) => value)],
    );
}

async function record(client, entry) {
    await client.query(
        `INSERT INTO history (project_id, task_id, actor_id, action, field, old_value, new_value, undo_of)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
            entry.projectId,
            entry.taskId || null,
            entry.actorId,
            entry.action,
            entry.field || null,
            entry.oldValue ?? null,
            entry.newValue ?? null,
            entry.undoOf || null,
        ],
    );
}

// Validates and applies field changes, recording one history entry per
// changed field. Only the super user may move something from Done back to
// To Do. Returns the changed fields.
async function applyChanges(client, kind, id, changes, user) {
    const row = await lockRow(client, kind, id);
    const fields = EDITABLE_FIELDS[kind];

    const changed = [];
    for (const [field, raw] of Object.entries(changes || {})) {
        if (!fields[field])
            throw new HttpError(400, `"${field}" can't be changed.`);
        const newValue = await fields[field](raw, client);
        const oldValue = toText(row[field]);
        if (newValue === oldValue) continue;
        if (field === 'state' && oldValue === 'done' && !user.isSuper)
            throw new HttpError(
                403,
                'This is marked done. Only the super user can reopen it.',
            );
        if (field === 'active' && oldValue === 'false' && !user.isSuper)
            throw new HttpError(
                403,
                'This project is inactive. Only the super user can reactivate it.',
            );
        changed.push({ field, oldValue, newValue });
    }

    if (changed.length) {
        await writeFields(
            client,
            kind,
            id,
            changed.map((c) => [c.field, c.newValue]),
        );
        for (const change of changed) {
            await record(client, {
                projectId: kind === 'project' ? id : row.project_id,
                taskId: kind === 'task' ? id : null,
                actorId: user.id,
                action: 'update',
                ...change,
            });
        }
    }
    return changed;
}

// Reverts one recorded change (super user only), as long as nothing has
// changed that field since. The undo is recorded as its own entry.
async function undo(client, historyId, user) {
    const { rows } = await client.query(
        'SELECT * FROM history WHERE id = $1 FOR UPDATE',
        [historyId],
    );
    const entry = rows[0];
    if (!entry) throw new HttpError(404, 'History entry not found.');
    if (entry.action !== 'update')
        throw new HttpError(400, 'Only changes can be undone.');
    if (entry.undone_at)
        throw new HttpError(409, 'This change was already undone.');

    const kind = entry.task_id ? 'task' : 'project';
    const id = entry.task_id || entry.project_id;
    const row = await lockRow(client, kind, id);
    if (toText(row[entry.field]) !== entry.new_value)
        throw new HttpError(
            409,
            'This was changed again afterwards. Undo the later change first.',
        );

    await writeFields(client, kind, id, [[entry.field, entry.old_value]]);
    await client.query(
        'UPDATE history SET undone_by = $2, undone_at = now() WHERE id = $1',
        [historyId, user.id],
    );
    await record(client, {
        projectId: entry.project_id,
        taskId: entry.task_id,
        actorId: user.id,
        action: 'undo',
        field: entry.field,
        oldValue: entry.new_value,
        newValue: entry.old_value,
        undoOf: entry.id,
    });
    return { kind, id, field: entry.field, value: entry.old_value };
}

// Loads history entries matching a WHERE clause, newest first, with
// people's names filled in.
async function listHistory(where, params, limit = 200) {
    const { rows } = await db.query(
        `SELECT h.*, a.display_name AS actor_name, u.display_name AS undone_by_name,
                t.letter, t.name AS task_name, p.customer_name
         FROM history h
         JOIN projects p ON p.id = h.project_id
         LEFT JOIN tasks t ON t.id = h.task_id
         LEFT JOIN users a ON a.id = h.actor_id
         LEFT JOIN users u ON u.id = h.undone_by
         WHERE ${where}
         ORDER BY h.created_at DESC, h.id DESC
         LIMIT ${Number(limit)}`,
        params,
    );

    const ownerIds = new Set();
    for (const row of rows) {
        if (row.field !== 'owner_id') continue;
        if (row.old_value) ownerIds.add(Number(row.old_value));
        if (row.new_value) ownerIds.add(Number(row.new_value));
    }
    const names = new Map();
    if (ownerIds.size) {
        const { rows: users } = await db.query(
            'SELECT id, display_name FROM users WHERE id = ANY($1)',
            [[...ownerIds]],
        );
        users.forEach((u) => names.set(String(u.id), u.display_name));
    }
    const display = (field, value) =>
        field === 'owner_id' && value ? names.get(value) || 'Unknown' : value;

    return rows.map((row) => ({
        id: row.id,
        action: row.action,
        field: row.field,
        oldValue: display(row.field, row.old_value),
        newValue: display(row.field, row.new_value),
        actor: row.actor_name,
        createdAt: row.created_at,
        projectId: row.project_id,
        customerName: row.customer_name,
        taskId: row.task_id,
        taskCode: row.task_id ? `#${row.project_id}${row.letter}` : null,
        taskName: row.task_name,
        undone: Boolean(row.undone_at),
        undoneBy: row.undone_by_name,
        undoneAt: row.undone_at,
        undoable: row.action === 'update' && !row.undone_at,
    }));
}

module.exports = { applyChanges, undo, record, listHistory, EDITABLE_FIELDS };
