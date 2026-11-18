const express = require('express');
const db = require('../db');
const { HttpError } = require('../errors');
const { requireSuper } = require('../auth');
const { notifyBugReport } = require('../mailer');
const { uploadScreenshot, checkContents } = require('../uploads');

const router = express.Router();

const MAX_DESCRIPTION = 4000;

// Every column except the screenshot itself.
const COLUMNS = `r.id, r.page, r.description, r.browser, r.created_at,
    r.resolved_at, r.screenshot IS NOT NULL AS has_screenshot,
    u.display_name AS reporter_name`;

function toReport(row) {
    return {
        id: row.id,
        page: row.page,
        description: row.description,
        browser: row.browser,
        reportedBy: row.reporter_name ?? 'Deleted user',
        hasScreenshot: row.has_screenshot,
        createdAt: row.created_at,
        resolvedAt: row.resolved_at,
    };
}

async function loadReport(id) {
    const { rows } = await db.query(
        `SELECT ${COLUMNS} FROM bug_reports r
         LEFT JOIN users u ON u.id = r.user_id WHERE r.id = $1`,
        [id],
    );
    if (!rows[0]) throw new HttpError(404, 'Report not found.');
    return toReport(rows[0]);
}

function reportId(req) {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) throw new HttpError(404, 'Report not found.');
    return id;
}

// Anyone signed in can report a problem, with an optional screenshot
// (multipart field "screenshot"); the admins are emailed.
router.post('/', uploadScreenshot, async (req, res) => {
    const description = String(req.body?.description ?? '').trim();
    if (!description) throw new HttpError(400, 'Describe what went wrong.');
    if (description.length > MAX_DESCRIPTION)
        throw new HttpError(
            400,
            `Keep it under ${MAX_DESCRIPTION} characters.`,
        );
    const screenshotType = req.file && checkContents(req.file);
    if (req.file && !screenshotType)
        throw new HttpError(
            400,
            "The screenshot doesn't look like an image. It may be damaged or renamed.",
        );
    const page = String(req.body?.page ?? '/').slice(0, 500);
    const browser = String(req.get('user-agent') ?? '').slice(0, 500);
    const { rows } = await db.query(
        `INSERT INTO bug_reports
            (user_id, page, description, browser, screenshot, screenshot_type)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [
            req.user.id,
            page,
            description,
            browser,
            req.file?.buffer ?? null,
            screenshotType || null,
        ],
    );
    const report = await loadReport(rows[0].id);
    res.status(201).send(report);
    notifyBugReport(report, req.user);
});

router.get('/', requireSuper, async (req, res) => {
    const { rows } = await db.query(
        `SELECT ${COLUMNS} FROM bug_reports r
         LEFT JOIN users u ON u.id = r.user_id
         ORDER BY r.resolved_at IS NOT NULL, r.created_at DESC`,
    );
    res.send(rows.map(toReport));
});

router.get('/:id/screenshot', requireSuper, async (req, res) => {
    const { rows } = await db.query(
        'SELECT screenshot, screenshot_type FROM bug_reports WHERE id = $1',
        [reportId(req)],
    );
    if (!rows[0]?.screenshot) return res.sendStatus(404);
    res.set({
        'Content-Type': rows[0].screenshot_type,
        'Content-Disposition': 'inline',
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'private, max-age=3600',
    });
    res.send(rows[0].screenshot);
});

// { resolved: true | false }
router.patch('/:id', requireSuper, async (req, res) => {
    const id = reportId(req);
    const { rowCount } = await db.query(
        `UPDATE bug_reports
         SET resolved_at = CASE WHEN $2 THEN now() ELSE NULL END
         WHERE id = $1`,
        [id, Boolean(req.body?.resolved)],
    );
    if (!rowCount) throw new HttpError(404, 'Report not found.');
    res.send(await loadReport(id));
});

module.exports = router;
