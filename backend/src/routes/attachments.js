const express = require('express');
const db = require('../db');
const { VIEWABLE } = require('../uploads');

const router = express.Router();

const UUID_PATTERN =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

router.get('/:id', async (req, res) => {
    if (!UUID_PATTERN.test(req.params.id)) return res.sendStatus(404);
    const { rows } = await db.query(
        'SELECT filename, mime_type, data FROM attachments WHERE id = $1',
        [req.params.id],
    );
    const attachment = rows[0];
    if (!attachment) return res.sendStatus(404);

    // PDFs, common images and text open in the browser; other files
    // (e.g. Word, Excel, HEIC) download.
    const disposition =
        req.query.download || !VIEWABLE.has(attachment.mime_type)
            ? 'attachment'
            : 'inline';
    res.set({
        'Content-Type': attachment.mime_type,
        'Content-Disposition': `${disposition}; filename*=UTF-8''${encodeURIComponent(attachment.filename)}`,
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'private, max-age=3600',
    });
    res.send(attachment.data);
});

module.exports = router;
