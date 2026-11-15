const waitPort = require('wait-port');
const fs = require('fs');
const mysql = require('mysql2');

const {
    MYSQL_HOST: HOST,
    MYSQL_HOST_FILE: HOST_FILE,
    MYSQL_USER: USER,
    MYSQL_USER_FILE: USER_FILE,
    MYSQL_PASSWORD: PASSWORD,
    MYSQL_PASSWORD_FILE: PASSWORD_FILE,
    MYSQL_DB: DB,
    MYSQL_DB_FILE: DB_FILE,
} = process.env;

let pool;

async function init() {
    const host = HOST_FILE ? fs.readFileSync(HOST_FILE) : HOST;
    const user = USER_FILE ? fs.readFileSync(USER_FILE) : USER;
    const password = PASSWORD_FILE ? fs.readFileSync(PASSWORD_FILE) : PASSWORD;
    const database = DB_FILE ? fs.readFileSync(DB_FILE) : DB;

    await waitPort({
        host,
        port: 3306,
        timeout: 10000,
        waitForDns: true,
    });

    pool = mysql.createPool({
        connectionLimit: 5,
        host,
        user,
        password,
        database,
        charset: 'utf8mb4',
    });

    await query(
        'CREATE TABLE IF NOT EXISTS todo_items (id varchar(36), name varchar(255), completed boolean) DEFAULT CHARSET utf8mb4',
    );
    await query(
        'CREATE TABLE IF NOT EXISTS todo_attachments (id varchar(36) PRIMARY KEY, item_id varchar(36) NOT NULL, filename varchar(255) NOT NULL, mime_type varchar(100) NOT NULL, size int NOT NULL, data LONGBLOB NOT NULL, created_at timestamp(3) DEFAULT CURRENT_TIMESTAMP(3), INDEX (item_id)) DEFAULT CHARSET utf8mb4',
    );

    console.log(`Connected to mysql db at host ${HOST}`);
}

async function teardown() {
    return new Promise((acc, rej) => {
        pool.end((err) => {
            if (err) rej(err);
            else acc();
        });
    });
}

function query(sql, params = []) {
    return new Promise((acc, rej) => {
        pool.query(sql, params, (err, rows) => {
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
        `SELECT ${ATTACHMENT_COLUMNS} FROM todo_attachments ORDER BY created_at, filename`,
    );
    return withAttachments(items, attachments);
}

async function getItem(id) {
    const items = await query('SELECT * FROM todo_items WHERE id=?', [id]);
    const attachments = await query(
        `SELECT ${ATTACHMENT_COLUMNS} FROM todo_attachments WHERE item_id=? ORDER BY created_at, filename`,
        [id],
    );
    return withAttachments(items, attachments)[0];
}

async function storeItem(item) {
    return new Promise((acc, rej) => {
        pool.query(
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
        pool.query(
            'UPDATE todo_items SET name=?, completed=? WHERE id=?',
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
