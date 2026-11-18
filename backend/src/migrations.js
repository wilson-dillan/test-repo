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
