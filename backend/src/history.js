const db = require('./db');
const { HttpError } = require('./errors');
const {
    PROJECT_TYPES,
    FINANCING_PROVIDERS,
    CONTROLS_TYPES,
} = require('./projectTypes');

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

// Projects reach Done only by recording a rebate (see routes/projects.js).
async function projectState(value) {
    if (value !== 'todo' && value !== 'submitted')
        throw new HttpError(400, 'State must be To Do or Submitted.');
    return value;
}

const STAGE_ORDER = { todo: 0, submitted: 1, done: 2 };

// `nullable` is for questions only some project types ask, where "no
// answer" is fine for the others.
function yesNo(label, { nullable = false } = {}) {
    return async (value) => {
        if (nullable && (value === null || value === undefined)) return null;
        if (typeof value !== 'boolean')
            throw new HttpError(400, `Answer Yes or No for ${label}.`);
        return String(value);
    };
}

const active = yesNo('active');

function oneOf(label, options) {
    return async (value) => {
        if (value === null || value === undefined || value === '') return null;
        if (!options.includes(value))
            throw new HttpError(
                400,
                `Choose a ${label}: ${options.join(', ')}.`,
            );
        return value;
    };
}

// The fields users can change on each kind of record, with how to
// validate them. Every change to one of these is recorded in history.
const EDITABLE_FIELDS = {
    project: {
        customer_first_name: text('First name', 100),
        customer_last_name: text('Last name', 100, { required: false }),
        address: text('Address', 300),
        due_date: date,
        owner_id: owner,
        state: projectState,
        active,
        financing: yesNo('financing'),
        financing_provider: oneOf('financing provider', FINANCING_PROVIDERS),
        financing_other: text('Financing provider name', 100, {
            required: false,
        }),
        heats_with_gas: yesNo('natural gas heating', { nullable: true }),
        integrated_controls: yesNo('integrated controls', { nullable: true }),
        controls_type: oneOf('controls type', CONTROLS_TYPES),
        controls_other: text('Controls name', 100, { required: false }),
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
    if (state && kind === 'project')
        sets.push(
            state[1] === 'todo'
                ? 'submitted_at = NULL'
                : 'submitted_at = COALESCE(submitted_at, now())',
        );
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
const INACTIVE_MESSAGE =
    "This application is inactive, so it can't be edited. Only an admin can reactivate it.";

// Throws if the project is inactive (read-only).
async function assertProjectEditable(client, projectId) {
    const { rows } = await client.query(
        'SELECT active FROM projects WHERE id = $1',
        [projectId],
    );
    if (rows[0] && !rows[0].active) throw new HttpError(403, INACTIVE_MESSAGE);
}

// Cross-field rules for a project's questions. `values` holds every field
// as text (the row merged with the requested changes) and is updated in
// place: answers that no longer apply are cleared.
function normalizeProjectAnswers(type, values) {
    const asks = PROJECT_TYPES[type]?.asks || [];

    if (values.financing !== 'true') {
        values.financing_provider = null;
        values.financing_other = '';
    } else if (!values.financing_provider)
        throw new HttpError(400, 'Choose the financing provider.');
    if (values.financing_provider !== 'Other') values.financing_other = '';
    else if (!values.financing_other)
        throw new HttpError(400, "Enter the financing provider's name.");

    if (!asks.includes('heats_with_gas')) values.heats_with_gas = null;
    else if (values.heats_with_gas == null)
        throw new HttpError(
            400,
            'Say whether the home heats with natural gas.',
        );

    if (!asks.includes('integrated_controls')) {
        values.integrated_controls = null;
        values.controls_type = null;
        values.controls_other = '';
    } else {
        if (values.integrated_controls == null)
            throw new HttpError(
                400,
                'Say whether there are integrated controls.',
            );
        if (values.integrated_controls !== 'true') {
            values.controls_type = null;
            values.controls_other = '';
        } else if (!values.controls_type)
            throw new HttpError(400, 'Choose the type of integrated controls.');
        if (values.controls_type !== 'Other') values.controls_other = '';
        else if (!values.controls_other)
            throw new HttpError(400, 'Enter the name of the controls.');
    }
    return values;
}

const ANSWER_FIELDS = [
    'financing',
    'financing_provider',
    'financing_other',
    'heats_with_gas',
    'integrated_controls',
    'controls_type',
    'controls_other',
];

// Validates and applies field changes, recording one history entry per
// changed field. Only the super user may move something from Done back to
// To Do, or reactivate a project. Returns the changed fields.
async function applyChanges(client, kind, id, changes, user) {
    const row = await lockRow(client, kind, id);
    const fields = EDITABLE_FIELDS[kind];

    // An inactive project is read-only; the only change allowed is the
    // super user reactivating it.
    const onlyReactivating =
        kind === 'project' && Object.keys(changes || {}).join() === 'active';
    if (!onlyReactivating)
        await assertProjectEditable(
            client,
            kind === 'project' ? id : row.project_id,
        );

    const pending = {};
    for (const [field, raw] of Object.entries(changes || {})) {
        if (!fields[field])
            throw new HttpError(400, `"${field}" can't be changed.`);
        pending[field] = await fields[field](raw, client);
    }

    // Answering questions can clear other answers that no longer apply.
    if (kind === 'project' && ANSWER_FIELDS.some((f) => f in pending)) {
        const merged = Object.fromEntries(
            ANSWER_FIELDS.map((f) => [
                f,
                f in pending ? pending[f] : toText(row[f]),
            ]),
        );
        Object.assign(pending, normalizeProjectAnswers(row.type, merged));
        if (
            pending.heats_with_gas === 'true' &&
            toText(row.heats_with_gas) !== 'true' &&
            row.state !== 'todo' &&
            !user.isSuper
        )
            throw new HttpError(
                403,
                'This application has already been submitted, and that would add a document to upload. Only an admin can change it.',
            );
    }

    const changed = [];
    for (const [field, newValue] of Object.entries(pending)) {
        const oldValue = toText(row[field]);
        if (newValue === oldValue) continue;
        if (
            field === 'state' &&
            STAGE_ORDER[newValue] < STAGE_ORDER[oldValue] &&
            !user.isSuper
        )
            throw new HttpError(
                403,
                oldValue === 'done'
                    ? 'This is marked done. Only an admin can reopen it.'
                    : 'This has been submitted. Only an admin can move it back.',
            );
        if (field === 'active' && oldValue === 'false' && !user.isSuper)
            throw new HttpError(
                403,
                'This project is inactive. Only an admin can reactivate it.',
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
        if (
            kind === 'project' &&
            changed.some((c) => c.field === 'heats_with_gas')
        )
            await syncTasks(client, id, user);
    }
    return changed;
}

// Switches "only if" tasks (like the Natural Gas Bill) on or off to match
// the project's answers, logging each switch. A switched-off task keeps its
// uploads, ready for if the answer changes back.
async function syncTasks(client, projectId, user) {
    const { rows: projects } = await client.query(
        'SELECT * FROM projects WHERE id = $1',
        [projectId],
    );
    const project = projects[0];
    const forms = PROJECT_TYPES[project.type]?.forms || [];
    for (const form of forms.filter((f) => f.onlyIf)) {
        const needed = project[form.onlyIf] === true;
        const { rows } = await client.query(
            `UPDATE tasks SET active = $3
             WHERE project_id = $1 AND name = $2 AND active <> $3
             RETURNING id`,
            [projectId, form.name, needed],
        );
        for (const task of rows)
            await record(client, {
                projectId,
                taskId: task.id,
                actorId: user.id,
                action: 'update',
                field: 'active',
                oldValue: String(!needed),
                newValue: String(needed),
            });
    }
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
    // e.g. changes to the old single customer-name field
    if (!EDITABLE_FIELDS[entry.task_id ? 'task' : 'project'][entry.field])
        throw new HttpError(400, "This older change can't be undone.");
    if (ANSWER_FIELDS.includes(entry.field))
        throw new HttpError(
            400,
            "Change this answer on the project page instead; it can't be undone on its own.",
        );
    if (entry.undone_at)
        throw new HttpError(409, 'This change was already undone.');

    const kind = entry.task_id ? 'task' : 'project';
    const id = entry.task_id || entry.project_id;
    const row = await lockRow(client, kind, id);
    if (!(kind === 'project' && entry.field === 'active'))
        await assertProjectEditable(client, entry.project_id);
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
    if (kind === 'project' && entry.field === 'heats_with_gas')
        await syncTasks(client, id, user);
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
        field === 'owner_id' && value
            ? names.get(value) || 'Deleted user'
            : value;

    return rows.map((row) => ({
        id: row.id,
        action: row.action,
        field: row.field,
        oldValue: display(row.field, row.old_value),
        newValue: display(row.field, row.new_value),
        actor: row.actor_name || 'Deleted user',
        createdAt: row.created_at,
        projectId: row.project_id,
        customerName: row.customer_name,
        taskId: row.task_id,
        taskCode: row.task_id ? `#${row.project_id}${row.letter}` : null,
        taskName: row.task_name,
        undone: Boolean(row.undone_at),
        undoneBy: row.undone_by_name || (row.undone_at && 'Deleted user'),
        undoneAt: row.undone_at,
        // Answers that clear or depend on others are changed on the project
        // page instead of being undone one by one.
        undoable:
            row.action === 'update' &&
            !row.undone_at &&
            !ANSWER_FIELDS.includes(row.field) &&
            Boolean(
                EDITABLE_FIELDS[row.task_id ? 'task' : 'project'][row.field],
            ),
    }));
}

module.exports = {
    applyChanges,
    undo,
    record,
    listHistory,
    syncTasks,
    normalizeProjectAnswers,
    assertProjectEditable,
    EDITABLE_FIELDS,
};
