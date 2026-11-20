const { PROJECT_TYPES } = require('./projectTypes');

const LETTERS = 'abcdefghijklmnopqrstuvwxyz';

// One-time data changes. Each runs once per database, in a transaction,
// and is remembered in schema_migrations.
const MIGRATIONS = {
    // Move every existing project onto the current list of documents for
    // its type: keep tasks whose name still applies (and their uploads),
    // remove the rest, add what's missing.
    async forms_v2(client) {
        const { rows: projects } = await client.query(
            'SELECT * FROM projects ORDER BY id',
        );
        for (const project of projects) {
            const forms = PROJECT_TYPES[project.type]?.forms;
            if (!forms) continue;

            const { rows: tasks } = await client.query(
                'SELECT id, name FROM tasks WHERE project_id = $1 ORDER BY letter',
                [project.id],
            );
            const keep = new Map();
            for (const task of tasks)
                if (
                    forms.some((f) => f.name === task.name) &&
                    !keep.has(task.name)
                )
                    keep.set(task.name, task.id);
            await client.query(
                'DELETE FROM tasks WHERE project_id = $1 AND NOT (id = ANY($2))',
                [project.id, [...keep.values()]],
            );
            // Clear letters first so re-lettering can't collide.
            await client.query(
                "UPDATE tasks SET letter = '~' || id WHERE project_id = $1",
                [project.id],
            );

            for (const [i, form] of forms.entries()) {
                const active = !form.onlyIf || project[form.onlyIf] === true;
                if (keep.has(form.name))
                    await client.query(
                        'UPDATE tasks SET letter = $2, form_name = $3, active = $4 WHERE id = $1',
                        [keep.get(form.name), LETTERS[i], form.name, active],
                    );
                else
                    await client.query(
                        `INSERT INTO tasks (project_id, letter, name, form_name, owner_id, active)
                         VALUES ($1, $2, $3, $3, $4, $5)`,
                        [
                            project.id,
                            LETTERS[i],
                            form.name,
                            project.owner_id,
                            active,
                        ],
                    );
            }

            // New documents to upload means the project isn't done.
            await client.query(
                `UPDATE projects SET state = 'todo', completed_at = NULL
                 WHERE id = $1 AND state = 'done' AND EXISTS (
                     SELECT 1 FROM tasks
                     WHERE project_id = $1 AND active AND state = 'todo'
                 )`,
                [project.id],
            );
        }
    },
};

// Before rebates were tracked, "done" meant every document was in. Those
// projects are now Submitted (waiting on the rebate).
MIGRATIONS.statuses_v2 = async (client) => {
    await client.query(
        `UPDATE projects
         SET state = 'submitted', submitted_at = COALESCE(completed_at, now()),
             completed_at = NULL
         WHERE state = 'done' AND rebate_number IS NULL`,
    );
};

// Undo/Reopen used to move a task back to To Do while its document stayed
// attached. A task with a document is done.
MIGRATIONS.tasks_with_documents_done = async (client) => {
    await client.query(
        `UPDATE tasks t SET state = 'done', completed_at = COALESCE(completed_at,
             (SELECT max(created_at) FROM attachments a WHERE a.task_id = t.id))
         WHERE state = 'todo'
           AND EXISTS (SELECT 1 FROM attachments a WHERE a.task_id = t.id)`,
    );
};

// Uploads used to read file names as Latin-1, so "7.18.13 PM.png" (with
// the special space Macs put in screenshot names) or "ñ" came out garbled.
// Re-read those names as the UTF-8 they really were.
function fixGarbled(name) {
    if (!/[Â-ô][\u0080-¿]/.test(name)) return name;
    if (/[^\u0000-ÿ]/.test(name)) return name;
    const fixed = Buffer.from(name, 'latin1').toString('utf8');
    return fixed.includes('�') ? name : fixed;
}

MIGRATIONS.utf8_file_names = async (client) => {
    const { rows } = await client.query('SELECT id, filename FROM attachments');
    for (const row of rows) {
        const fixed = fixGarbled(row.filename);
        if (fixed !== row.filename)
            await client.query(
                'UPDATE attachments SET filename = $2 WHERE id = $1',
                [row.id, fixed],
            );
    }
    const { rows: entries } = await client.query(
        "SELECT id, new_value FROM history WHERE action = 'file'",
    );
    for (const row of entries) {
        const fixed = fixGarbled(row.new_value || '');
        if (fixed !== row.new_value)
            await client.query(
                'UPDATE history SET new_value = $2 WHERE id = $1',
                [row.id, fixed],
            );
    }
};

async function runMigrations(transaction) {
    for (const [name, migrate] of Object.entries(MIGRATIONS)) {
        await transaction(async (client) => {
            const { rows } = await client.query(
                'INSERT INTO schema_migrations (name) VALUES ($1) ON CONFLICT DO NOTHING RETURNING name',
                [name],
            );
            if (rows.length) {
                await migrate(client);
                console.log(`Ran data migration "${name}"`);
            }
        });
    }
}

module.exports = { runMigrations, MIGRATIONS };
