const db = require('../persistence');

module.exports = async (req, res) => {
    const attachment = await db.getAttachment(
        req.params.id,
        req.params.attachmentId,
    );
    if (!attachment) return res.sendStatus(404);

    res.set({
        'Content-Type': attachment.mimeType,
        'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(attachment.filename)}`,
        'X-Content-Type-Options': 'nosniff',
    });
    res.send(attachment.data);
};
