const express = require('express');
const archiver = require('archiver');
const db = require('../db');
const { HttpError } = require('../errors');
const { requireSuper } = require('../auth');
const { PROJECT_TYPES } = require('../projectTypes');
const {
    applyChanges,
    record,
    listHistory,
    EDITABLE_FIELDS,
} = require('../history');
const { sendAssignmentEmail } = require('../mailer');
const { toProject, toTask } = require('../serializers');

const router = express.Router();

const LETTERS = 'abcdefghijklmnopqrstuvwxyz';
const MAX_NOTE_LENGTH = 2000;

// API field names -> database columns for project edits.
const PATCHABLE = {
    customerName: 'customer_name',
    address: 'address',
    dueDate: 'due_date',
    ownerId: 'owner_id',
    state: 'state',
    active: 'active',
};

function projectId(req) {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) throw new HttpError(404, 'Project not found.');
    return id;
}

async function loadProject(id) {
    const { rows } = await db.query(
        `SELECT p.*, u.display_name AS owner_name
         FROM projects p JOIN users u ON u.id = p.owner_id
         WHERE p.id = $1`,
        [id],
    );
    if (!rows[0]) throw new HttpError(404, 'Project not found.');
    return toProject(rows[0]);
}

async function loadProjectDetail(id) {
    const project = await loadProject(id);
    const [{ rows: tasks }, { rows: notes }, history] = await Promise.all([
        db.query(
            `SELECT t.*, u.display_name AS owner_name,
                    (SELECT count(*) FROM attachments a WHERE a.task_id = t.id) AS attachment_count,
                    doc.id AS doc_id, doc.filename AS doc_filename,
                    doc.created_at AS doc_created_at, du.display_name AS doc_uploaded_by
             FROM tasks t
             JOIN users u ON u.id = t.owner_id
             LEFT JOIN LATERAL (
                 SELECT a.id, a.filename, a.created_at, a.uploaded_by
                 FROM attachments a WHERE a.task_id = t.id
                 ORDER BY a.created_at DESC LIMIT 1
             ) doc ON true
             LEFT JOIN users du ON du.id = doc.uploaded_by
             WHERE t.project_id = $1 ORDER BY t.letter`,
            [id],
        ),
        db.query(
            `SELECT n.*, u.display_name AS author_name
             FROM project_notes n JOIN users u ON u.id = n.author_id
             WHERE n.project_id = $1 ORDER BY n.created_at DESC, n.id DESC`,
            [id],
        ),
        listHistory('h.project_id = $1', [id]),
    ]);
    return {
        ...project,
        tasks: tasks.map(toTask),
        notes: notes.map((n) => ({
            id: n.id,
            author: n.author_name,
            body: n.body,
            createdAt: n.created_at,
        })),
        history,
    };
}

router.get('/types', (req, res) => {
    res.send(
        Object.entries(PROJECT_TYPES).map(([id, type]) => ({
            id,
            label: type.label,
            description: type.description,
            tasks: type.tasks,
        })),
    );
});

router.get('/', async (req, res) => {
    const ownerId = req.query.owner === 'me' ? req.user.id : null;
    const { rows } = await db.query(
        `SELECT p.*, u.display_name AS owner_name,
                count(t.id) AS task_total,
                count(t.id) FILTER (WHERE t.state = 'done') AS task_done
         FROM projects p
         JOIN users u ON u.id = p.owner_id
         LEFT JOIN tasks t ON t.project_id = p.id
         WHERE ($1::integer IS NULL OR p.owner_id = $1)
         GROUP BY p.id, u.display_name
         ORDER BY NOT p.active, p.state = 'done', p.due_date NULLS LAST, p.id DESC`,
        [ownerId],
    );
    res.send(rows.map(toProject));
});

router.post('/', async (req, res) => {
    const body = req.body || {};
    const type = PROJECT_TYPES[body.type];
    if (!type) throw new HttpError(400, 'Choose Whole Home or Partial Home.');

    const note = String(body.note || '').trim();
    if (note.length > MAX_NOTE_LENGTH)
        throw new HttpError(400, 'Notes must be 2000 characters or fewer.');

    const { id, tasks } = await db.transaction(async (client) => {
        const fields = EDITABLE_FIELDS.project;
        const values = {
            customer_name: await fields.customer_name(body.customerName),
            address: await fields.address(body.address),
            due_date: await fields.due_date(body.dueDate),
            owner_id: await fields.owner_id(body.ownerId, client),
        };

        const { rows } = await client.query(
            `INSERT INTO projects (type, customer_name, address, due_date, owner_id, created_by)
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
            [
                body.type,
                values.customer_name,
                values.address,
                values.due_date,
                values.owner_id,
                req.user.id,
            ],
        );
        const id = rows[0].id;

        const tasks = [];
        for (const [i, task] of type.tasks.entries()) {
            const { rows: created } = await client.query(
                `INSERT INTO tasks (project_id, letter, name, form_name, owner_id)
                 VALUES ($1, $2, $3, $4, $5) RETURNING id`,
                [id, LETTERS[i], task.name, task.form, values.owner_id],
            );
            tasks.push({
                id: created[0].id,
                code: `#${id}${LETTERS[i]}`,
                name: task.name,
                customerName: values.customer_name,
            });
        }

        await record(client, {
            projectId: id,
            actorId: req.user.id,
            action: 'created',
            newValue: type.label,
        });
        if (note) {
            await client.query(
                'INSERT INTO project_notes (project_id, author_id, body) VALUES ($1, $2, $3)',
                [id, req.user.id, note],
            );
        }
        return { id, tasks };
    });

    const project = await loadProjectDetail(id);
    res.status(201).send(project);

    sendAssignmentEmail(project.owner.id, tasks, req.user);
});

router.get('/:id', async (req, res) => {
    res.send(await loadProjectDetail(projectId(req)));
});

// Permanently deletes a project with its tasks, documents, notes and
// history (all cascade). Super user only; regular users can only set a
// project inactive.
router.delete('/:id', requireSuper, async (req, res) => {
    const { rowCount } = await db.query('DELETE FROM projects WHERE id = $1', [
        projectId(req),
    ]);
    if (!rowCount) throw new HttpError(404, 'Project not found.');
    res.sendStatus(204);
});

router.patch('/:id', async (req, res) => {
    const id = projectId(req);
    const changes = {};
    for (const [key, value] of Object.entries(req.body || {})) {
        if (!PATCHABLE[key])
            throw new HttpError(400, `"${key}" can't be changed.`);
        changes[PATCHABLE[key]] = value;
    }
    await db.transaction((client) =>
        applyChanges(client, 'project', id, changes, req.user),
    );
    res.send(await loadProjectDetail(id));
});

router.post('/:id/notes', async (req, res) => {
    const id = projectId(req);
    const body = String(req.body?.body || '').trim();
    if (!body) throw new HttpError(400, 'Write a note first.');
    if (body.length > MAX_NOTE_LENGTH)
        throw new HttpError(400, 'Notes must be 2000 characters or fewer.');

    await loadProject(id);
    const { rows } = await db.query(
        `INSERT INTO project_notes (project_id, author_id, body)
         VALUES ($1, $2, $3) RETURNING *`,
        [id, req.user.id, body],
    );
    res.status(201).send({
        id: rows[0].id,
        author: req.user.displayName,
        body: rows[0].body,
        createdAt: rows[0].created_at,
    });
});

router.get('/:id/documents.zip', async (req, res) => {
    const project = await loadProject(projectId(req));
    const { rows } = await db.query(
        `SELECT a.filename, a.data, t.letter, t.name
         FROM attachments a JOIN tasks t ON t.id = a.task_id
         WHERE t.project_id = $1 ORDER BY t.letter, a.created_at`,
        [project.id],
    );
    if (!rows.length)
        throw new HttpError(404, 'This project has no documents yet.');

    const safe = (name) => name.replace(/[\\/:*?"<>|]+/g, '-');
    const zipName = safe(`Project ${project.id} - ${project.customerName}`);
    res.set({
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(zipName)}.zip`,
    });

    const archive = archiver('zip');
    archive.on('error', (err) => res.destroy(err));
    archive.pipe(res);

    const used = new Set();
    for (const row of rows) {
        const folder = safe(`${project.id}${row.letter} - ${row.name}`);
        let path = `${folder}/${safe(row.filename)}`;
        for (let n = 2; used.has(path); n++) {
            const dot = row.filename.lastIndexOf('.');
            path = `${folder}/${safe(row.filename.slice(0, dot))} (${n})${row.filename.slice(dot)}`;
        }
        used.add(path);
        archive.append(row.data, { name: path });
    }
    await archive.finalize();
});

module.exports = router;
