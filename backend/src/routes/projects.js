const express = require('express');
const archiver = require('archiver');
const db = require('../db');
const { HttpError, routeId } = require('../errors');
const { requireSuper } = require('../auth');
const {
    PROJECT_TYPES,
    FINANCING_PROVIDERS,
    CONTROLS_TYPES,
} = require('../projectTypes');
const {
    applyChanges,
    record,
    listHistory,
    normalizeProjectAnswers,
    assertProjectEditable,
    EDITABLE_FIELDS,
} = require('../history');
const { sendAssignmentEmail } = require('../mailer');
const { toProject, toTask, projectStatus } = require('../serializers');
const { customerLink } = require('../housecall');

const router = express.Router();

const LETTERS = 'abcdefghijklmnopqrstuvwxyz';
const MAX_NOTE_LENGTH = 2000;

// API field names -> database columns for project edits.
const PATCHABLE = {
    customerFirstName: 'customer_first_name',
    customerLastName: 'customer_last_name',
    address: 'address',
    dueDate: 'due_date',
    ownerId: 'owner_id',
    active: 'active',
    financing: 'financing',
    financingProvider: 'financing_provider',
    financingOther: 'financing_other',
    heatsWithGas: 'heats_with_gas',
    integratedControls: 'integrated_controls',
    controlsType: 'controls_type',
    controlsOther: 'controls_other',
};

const projectId = (req) => routeId(req, 'Project');

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
                    doc.created_at AS doc_created_at,
                    COALESCE(du.display_name, 'Deleted user') AS doc_uploaded_by
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
             FROM project_notes n LEFT JOIN users u ON u.id = n.author_id
             WHERE n.project_id = $1 ORDER BY n.created_at DESC, n.id DESC`,
            [id],
        ),
        listHistory('h.project_id = $1', [id]),
    ]);
    return {
        ...project,
        housecallUrl: customerLink(project.housecallCustomerId),
        status: projectStatus(
            project.state,
            tasks.filter((t) => t.active && t.state === 'done').length,
        ),
        tasks: tasks.map(toTask),
        notes: notes.map((n) => ({
            id: n.id,
            author: n.author_name || 'Deleted user',
            body: n.body,
            createdAt: n.created_at,
        })),
        history,
    };
}

router.get('/options', (req, res) => {
    res.send({
        financingProviders: FINANCING_PROVIDERS,
        controlsTypes: CONTROLS_TYPES,
    });
});

router.get('/types', (req, res) => {
    res.send(
        Object.entries(PROJECT_TYPES).map(([id, type]) => ({
            id,
            label: type.label,
            description: type.description,
            tasks: type.tasks,
            asks: type.asks,
        })),
    );
});

router.get('/', async (req, res) => {
    const ownerId = req.query.owner === 'me' ? req.user.id : null;
    const { rows } = await db.query(
        `SELECT p.*, u.display_name AS owner_name,
                count(t.id) FILTER (WHERE t.active) AS task_total,
                count(t.id) FILTER (WHERE t.active AND t.state = 'done') AS task_done
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
    if (!type)
        throw new HttpError(
            400,
            'Choose Whole Home, Partial Home or Basic Rebate.',
        );

    const note = String(body.note || '').trim();
    if (note.length > MAX_NOTE_LENGTH)
        throw new HttpError(400, 'Notes must be 2000 characters or fewer.');

    const housecallCustomerId = body.housecallCustomerId
        ? String(body.housecallCustomerId).trim()
        : null;
    if (housecallCustomerId && !/^[\w-]{1,100}$/.test(housecallCustomerId))
        throw new HttpError(400, 'That Housecall Pro customer id looks wrong.');

    const { id, tasks } = await db.transaction(async (client) => {
        const fields = EDITABLE_FIELDS.project;
        const values = {
            customer_first_name: await fields.customer_first_name(
                body.customerFirstName,
            ),
            customer_last_name: await fields.customer_last_name(
                body.customerLastName,
            ),
            address: await fields.address(body.address),
            due_date: await fields.due_date(body.dueDate),
            owner_id: await fields.owner_id(body.ownerId, client),
        };
        const answers = { financing: null };
        for (const [key, column] of [
            ['financing', 'financing'],
            ['financingProvider', 'financing_provider'],
            ['financingOther', 'financing_other'],
            ['heatsWithGas', 'heats_with_gas'],
            ['integratedControls', 'integrated_controls'],
            ['controlsType', 'controls_type'],
            ['controlsOther', 'controls_other'],
        ])
            if (body[key] !== undefined && body[key] !== null)
                answers[column] = await fields[column](body[key]);
        if (answers.financing === null)
            throw new HttpError(400, 'Say whether the customer is financing.');
        normalizeProjectAnswers(body.type, answers);

        const { rows } = await client.query(
            `INSERT INTO projects (type, customer_first_name, customer_last_name, address, due_date, owner_id, created_by, housecall_customer_id,
                                   financing, financing_provider, financing_other, heats_with_gas, integrated_controls, controls_type, controls_other)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
             RETURNING id, customer_name`,
            [
                body.type,
                values.customer_first_name,
                values.customer_last_name,
                values.address,
                values.due_date,
                values.owner_id,
                req.user.id,
                housecallCustomerId,
                answers.financing === 'true',
                answers.financing_provider || null,
                answers.financing_other || '',
                answers.heats_with_gas == null
                    ? null
                    : answers.heats_with_gas === 'true',
                answers.integrated_controls == null
                    ? null
                    : answers.integrated_controls === 'true',
                answers.controls_type || null,
                answers.controls_other || '',
            ],
        );
        const id = rows[0].id;

        const tasks = [];
        for (const [i, task] of type.tasks.entries()) {
            const active = !task.onlyIf || answers[task.onlyIf] === 'true';
            const { rows: created } = await client.query(
                `INSERT INTO tasks (project_id, letter, name, form_name, owner_id, active)
                 VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
                [id, LETTERS[i], task.name, task.form, values.owner_id, active],
            );
            // Only documents that are needed go in the assignment email.
            if (active)
                tasks.push({
                    id: created[0].id,
                    code: `#${id}${LETTERS[i]}`,
                    name: task.name,
                    customerName: rows[0].customer_name,
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
// history (all cascade), even after it's submitted. A special super user
// privilege; regular users can only set a project inactive.
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

// Stage 3: every needed document is in and the application has been sent.
router.post('/:id/submit', async (req, res) => {
    const id = projectId(req);
    await db.transaction(async (client) => {
        const { rows } = await client.query(
            'SELECT state FROM projects WHERE id = $1 FOR UPDATE',
            [id],
        );
        if (!rows[0]) throw new HttpError(404, 'Project not found.');
        await assertProjectEditable(client, id);
        if (rows[0].state !== 'todo')
            throw new HttpError(409, 'This application was already submitted.');
        const { rows: counts } = await client.query(
            `SELECT count(*) FILTER (WHERE state = 'todo') AS missing
             FROM tasks WHERE project_id = $1 AND active`,
            [id],
        );
        const missing = Number(counts[0].missing);
        if (missing)
            throw new HttpError(
                400,
                `Upload all documents first (${missing} still missing).`,
            );
        await applyChanges(
            client,
            'project',
            id,
            { state: 'submitted' },
            req.user,
        );
    });
    res.send(await loadProjectDetail(id));
});

const REBATE_NUMBER_MAX = 50;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// Stage 4: the rebate arrived, which finishes the application. Warns
// (409) if the rebate number is already on another project, unless
// `allowDuplicate` says to go ahead.
router.post('/:id/rebate', async (req, res) => {
    const id = projectId(req);
    const body = req.body || {};
    const number = String(body.number || '').trim();
    if (!number) throw new HttpError(400, 'Enter the rebate number.');
    if (number.length > REBATE_NUMBER_MAX)
        throw new HttpError(400, 'That rebate number is too long.');
    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount <= 0 || amount > 10000000)
        throw new HttpError(400, 'Enter the rebate amount in dollars.');
    const receivedOn = String(body.receivedOn || '');
    if (!DATE_PATTERN.test(receivedOn) || isNaN(Date.parse(receivedOn)))
        throw new HttpError(400, 'Enter the date the rebate was received.');
    if (receivedOn > new Date().toISOString().slice(0, 10))
        throw new HttpError(400, "The received date can't be in the future.");

    await db.transaction(async (client) => {
        const { rows } = await client.query(
            'SELECT state FROM projects WHERE id = $1 FOR UPDATE',
            [id],
        );
        if (!rows[0]) throw new HttpError(404, 'Project not found.');
        await assertProjectEditable(client, id);
        if (rows[0].state !== 'submitted')
            throw new HttpError(
                409,
                rows[0].state === 'done'
                    ? 'The rebate for this application was already recorded.'
                    : 'Mark the application as submitted first.',
            );

        if (!body.allowDuplicate) {
            const { rows: same } = await client.query(
                `SELECT id, customer_name FROM projects
                 WHERE lower(rebate_number) = lower($1) AND id <> $2 LIMIT 1`,
                [number, id],
            );
            if (same[0])
                throw new HttpError(
                    409,
                    `Rebate number ${number} is already recorded on project #${same[0].id} (${same[0].customer_name}). Check it's correct.`,
                    { duplicateProjectId: same[0].id },
                );
        }

        await client.query(
            `UPDATE projects
             SET state = 'done', completed_at = now(), rebate_number = $2,
                 rebate_amount = $3, rebate_received_on = $4
             WHERE id = $1`,
            [id, number, Math.round(amount * 100) / 100, receivedOn],
        );
        await record(client, {
            projectId: id,
            actorId: req.user.id,
            action: 'rebate',
            newValue: JSON.stringify({ number, amount, receivedOn }),
        });
    });
    res.send(await loadProjectDetail(id));
});

// Super user only: steps a Done application back to Submitted, clearing
// the rebate.
router.post('/:id/reopen', requireSuper, async (req, res) => {
    const id = projectId(req);
    await db.transaction(async (client) => {
        const { rows } = await client.query(
            'SELECT state FROM projects WHERE id = $1 FOR UPDATE',
            [id],
        );
        if (!rows[0]) throw new HttpError(404, 'Project not found.');
        await assertProjectEditable(client, id);
        if (rows[0].state !== 'done')
            throw new HttpError(409, "This application isn't marked Done.");
        await client.query(
            `UPDATE projects SET state = 'submitted', completed_at = NULL,
                 rebate_number = NULL, rebate_amount = NULL, rebate_received_on = NULL
             WHERE id = $1`,
            [id],
        );
        await record(client, {
            projectId: id,
            actorId: req.user.id,
            action: 'reopen',
            field: 'state',
            oldValue: 'done',
            newValue: 'submitted',
        });
    });
    res.send(await loadProjectDetail(id));
});

router.post('/:id/notes', async (req, res) => {
    const id = projectId(req);
    const body = String(req.body?.body || '').trim();
    if (!body) throw new HttpError(400, 'Write a note first.');
    if (body.length > MAX_NOTE_LENGTH)
        throw new HttpError(400, 'Notes must be 2000 characters or fewer.');

    await loadProject(id);
    await assertProjectEditable(db, id);
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
