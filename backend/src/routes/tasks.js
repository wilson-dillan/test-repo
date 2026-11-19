const express = require('express');
const { v4: uuid } = require('uuid');
const db = require('../db');
const { HttpError } = require('../errors');
const {
    applyChanges,
    record,
    listHistory,
    assertProjectEditable,
} = require('../history');
const { sendAssignmentEmail, assignmentNotice } = require('../mailer');
const { upload, checkContents } = require('../uploads');
const { toTask, toAttachment } = require('../serializers');

const router = express.Router();

const PATCHABLE = { ownerId: 'owner_id', state: 'state', notes: 'notes' };

function taskId(req) {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) throw new HttpError(404, 'Task not found.');
    return id;
}

const TASK_QUERY = `
    SELECT t.*, u.display_name AS owner_name, p.customer_name, p.due_date, p.address,
           p.active AS project_active, p.state AS project_state,
           (SELECT count(*) FROM attachments a WHERE a.task_id = t.id) AS attachment_count
    FROM tasks t
    JOIN users u ON u.id = t.owner_id
    JOIN projects p ON p.id = t.project_id`;

async function loadTaskDetail(id) {
    const { rows } = await db.query(`${TASK_QUERY} WHERE t.id = $1`, [id]);
    if (!rows[0]) throw new HttpError(404, 'Task not found.');

    const [{ rows: attachments }, history] = await Promise.all([
        db.query(
            `SELECT a.id, a.filename, a.mime_type, a.size, a.created_at,
                    u.display_name AS uploaded_by_name
             FROM attachments a LEFT JOIN users u ON u.id = a.uploaded_by
             WHERE a.task_id = $1 ORDER BY a.created_at, a.filename`,
            [id],
        ),
        listHistory('h.task_id = $1', [id]),
    ]);
    return {
        ...toTask(rows[0]),
        address: rows[0].address,
        attachments: attachments.map(toAttachment),
        history,
    };
}

router.get('/', async (req, res) => {
    const ownerId = req.query.owner === 'me' ? req.user.id : null;
    const { rows } = await db.query(
        `${TASK_QUERY}
         WHERE t.active AND ($1::integer IS NULL OR t.owner_id = $1)
         ORDER BY t.state = 'done', NOT p.active, p.due_date NULLS LAST, t.project_id, t.letter`,
        [ownerId],
    );
    res.send(rows.map(toTask));
});

router.get('/:id', async (req, res) => {
    res.send(await loadTaskDetail(taskId(req)));
});

router.patch('/:id', async (req, res) => {
    const id = taskId(req);
    const changes = {};
    for (const [key, value] of Object.entries(req.body || {})) {
        if (!PATCHABLE[key])
            throw new HttpError(400, `"${key}" can't be changed.`);
        changes[PATCHABLE[key]] = value;
    }
    const changed = await db.transaction((client) =>
        applyChanges(client, 'task', id, changes, req.user),
    );
    const task = await loadTaskDetail(id);
    const reassigned = changed.some((c) => c.field === 'owner_id');
    res.send({
        ...task,
        ...(reassigned && {
            assignmentEmail: await assignmentNotice(task.owner.id, req.user),
        }),
    });

    if (reassigned) sendAssignmentEmail(task.owner.id, [task], req.user);
});

router.post('/:id/attachments', upload, async (req, res) => {
    const id = taskId(req);
    const files = req.files || [];
    if (!files.length) throw new HttpError(400, 'Choose at least one file.');

    // Store each file as the type its extension and contents agree on.
    for (const file of files) {
        const mime = checkContents(file);
        if (!mime)
            throw new HttpError(
                400,
                `"${file.originalname}" doesn't match its file type. It may be damaged or renamed.`,
            );
        file.mimetype = mime;
    }

    // Uploading a task's form completes the task, and the last form
    // completes the project. Once done, only the super user can upload a
    // replacement.
    await db.transaction(async (client) => {
        const { rows } = await client.query(
            'SELECT project_id, state, active FROM tasks WHERE id = $1 FOR UPDATE',
            [id],
        );
        if (!rows[0]) throw new HttpError(404, 'Task not found.');
        if (!rows[0].active)
            throw new HttpError(
                400,
                "This document isn't needed for this project.",
            );
        await assertProjectEditable(client, rows[0].project_id);
        if (rows[0].state === 'done' && !req.user.isSuper)
            throw new HttpError(
                403,
                'This form is already uploaded. Only an admin can replace it.',
            );

        for (const file of files) {
            await client.query(
                `INSERT INTO attachments (id, task_id, filename, mime_type, size, data, uploaded_by)
                 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                [
                    uuid(),
                    id,
                    file.originalname,
                    file.mimetype,
                    file.size,
                    file.buffer,
                    req.user.id,
                ],
            );
            await record(client, {
                projectId: rows[0].project_id,
                taskId: id,
                actorId: req.user.id,
                action: 'file',
                newValue: file.originalname,
            });
        }

        if (rows[0].state === 'todo')
            await applyChanges(client, 'task', id, { state: 'done' }, req.user);
    });

    res.status(201).send(await loadTaskDetail(id));
});

module.exports = router;
