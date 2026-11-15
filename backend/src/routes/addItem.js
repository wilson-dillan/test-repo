const db = require('../persistence');
const { v4: uuid } = require('uuid');
const { hasValidContents } = require('../uploads');

module.exports = async (req, res) => {
    const files = req.files || [];

    const invalid = files.find((file) => !hasValidContents(file));
    if (invalid) {
        return res.status(400).send({
            error: `"${invalid.originalname}" doesn't look like a real PDF or JPEG file.`,
        });
    }

    const item = {
        id: uuid(),
        name: req.body.name,
        completed: false,
    };

    await db.storeItem(item);

    const attachments = [];
    for (const file of files) {
        const attachment = {
            id: uuid(),
            filename: file.originalname,
            mimeType: file.mimetype,
            size: file.size,
        };
        await db.storeAttachment(item.id, { ...attachment, data: file.buffer });
        attachments.push(attachment);
    }

    res.send({ ...item, attachments });
};
