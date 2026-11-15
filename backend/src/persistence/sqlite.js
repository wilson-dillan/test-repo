const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const location = process.env.SQLITE_DB_LOCATION || '/etc/todos/todo.db';

let db, dbAll, dbRun;

function init() {
    const dirName = require('path').dirname(location);
    if (!fs.existsSync(dirName)) {
        fs.mkdirSync(dirName, { recursive: true });
    }

    return new Promise((acc, rej) => {
        db = new sqlite3.Database(location, (err) => {
            if (err) return rej(err);

            if (process.env.NODE_ENV !== 'test')
                console.log(`Using sqlite database at ${location}`);

            query(
                'CREATE TABLE IF NOT EXISTS todo_items (id varchar(36), name varchar(255), completed boolean)',
            )
                .then(() =>
                    query(
                        'CREATE TABLE IF NOT EXISTS todo_attachments (id varchar(36) PRIMARY KEY, item_id varchar(36) NOT NULL, filename varchar(255) NOT NULL, mime_type varchar(100) NOT NULL, size integer NOT NULL, data blob NOT NULL, created_at timestamp DEFAULT CURRENT_TIMESTAMP)',
                    ),
                )
                .then(() =>
                    query(
                        'CREATE INDEX IF NOT EXISTS todo_attachments_item_id ON todo_attachments (item_id)',
                    ),
                )
                .then(() => acc(), rej);
        });
    });
}

async function teardown() {
    return new Promise((acc, rej) => {
        db.close((err) => {
            if (err) rej(err);
            else acc();
        });
    });
}

function query(sql, params = []) {
    return new Promise((acc, rej) => {
        db.all(sql, params, (err, rows) => {
            if (err) return rej(err);
            acc(rows);
        });
    });
}

const ATTACHMENT_COLUMNS = 'id, item_id, filename, mime_type AS mimeType, size';

function withAttachments(items, attachments) {
    return items.map((item) =>
        Object.assign({}, item, {
            completed: item.completed === 1,
            attachments: attachments
                .filter((a) => a.item_id === item.id)
                .map(({ item_id, ...a }) => a),
        }),
    );
}

async function getItems() {
    const items = await query('SELECT * FROM todo_items');
    const attachments = await query(
        `SELECT ${ATTACHMENT_COLUMNS} FROM todo_attachments ORDER BY created_at, rowid`,
    );
    return withAttachments(items, attachments);
}

async function getItem(id) {
    const items = await query('SELECT * FROM todo_items WHERE id=?', [id]);
    const attachments = await query(
        `SELECT ${ATTACHMENT_COLUMNS} FROM todo_attachments WHERE item_id=? ORDER BY created_at, rowid`,
        [id],
    );
    return withAttachments(items, attachments)[0];
}

async function storeItem(item) {
    return new Promise((acc, rej) => {
        db.run(
            'INSERT INTO todo_items (id, name, completed) VALUES (?, ?, ?)',
            [item.id, item.name, item.completed ? 1 : 0],
            (err) => {
                if (err) return rej(err);
                acc();
            },
        );
    });
}

async function updateItem(id, item) {
    return new Promise((acc, rej) => {
        db.run(
            'UPDATE todo_items SET name=?, completed=? WHERE id = ?',
            [item.name, item.completed ? 1 : 0, id],
            (err) => {
                if (err) return rej(err);
                acc();
            },
        );
    });
}

async function removeItem(id) {
    await query('DELETE FROM todo_attachments WHERE item_id = ?', [id]);
    await query('DELETE FROM todo_items WHERE id = ?', [id]);
}

async function storeAttachment(itemId, attachment) {
    await query(
        'INSERT INTO todo_attachments (id, item_id, filename, mime_type, size, data) VALUES (?, ?, ?, ?, ?, ?)',
        [
            attachment.id,
            itemId,
            attachment.filename,
            attachment.mimeType,
            attachment.size,
            attachment.data,
        ],
    );
}

async function getAttachment(itemId, attachmentId) {
    const rows = await query(
        'SELECT id, filename, mime_type AS mimeType, size, data FROM todo_attachments WHERE id=? AND item_id=?',
        [attachmentId, itemId],
    );
    return rows[0];
}

module.exports = {
    init,
    teardown,
    getItems,
    getItem,
    storeItem,
    updateItem,
    removeItem,
    storeAttachment,
    getAttachment,
};
