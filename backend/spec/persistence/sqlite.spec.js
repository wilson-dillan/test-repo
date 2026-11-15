const db = require('../../src/persistence/sqlite');
const fs = require('fs');
const location = process.env.SQLITE_DB_LOCATION || '/etc/todos/todo.db';

const ITEM = {
    id: '7aef3d7c-d301-4846-8358-2a91ec9d6be3',
    name: 'Test',
    completed: false,
};

beforeEach(() => {
    if (fs.existsSync(location)) {
        fs.unlinkSync(location);
    }
});

test('it initializes correctly', async () => {
    await db.init();
});

test('it can store and retrieve items', async () => {
    await db.init();

    await db.storeItem(ITEM);

    const items = await db.getItems();
    expect(items.length).toBe(1);
    expect(items[0]).toEqual({ ...ITEM, attachments: [] });
});

test('it can update an existing item', async () => {
    await db.init();

    const initialItems = await db.getItems();
    expect(initialItems.length).toBe(0);

    await db.storeItem(ITEM);

    await db.updateItem(
        ITEM.id,
        Object.assign({}, ITEM, { completed: !ITEM.completed }),
    );

    const items = await db.getItems();
    expect(items.length).toBe(1);
    expect(items[0].completed).toBe(!ITEM.completed);
});

test('it can remove an existing item', async () => {
    await db.init();
    await db.storeItem(ITEM);

    await db.removeItem(ITEM.id);

    const items = await db.getItems();
    expect(items.length).toBe(0);
});

test('it can get a single item', async () => {
    await db.init();
    await db.storeItem(ITEM);

    const item = await db.getItem(ITEM.id);
    expect(item).toEqual({ ...ITEM, attachments: [] });
});

const ATTACHMENT = {
    id: '0b6f5c1e-4f3a-4c55-9a3e-2f1d8e6b7a90',
    filename: 'receipt.pdf',
    mimeType: 'application/pdf',
    size: 9,
};
const ATTACHMENT_DATA = Buffer.from('%PDF-1.7\n');

test('it can store attachments and list them with the item', async () => {
    await db.init();
    await db.storeItem(ITEM);
    await db.storeAttachment(ITEM.id, { ...ATTACHMENT, data: ATTACHMENT_DATA });

    const items = await db.getItems();
    expect(items[0].attachments).toEqual([ATTACHMENT]);

    const item = await db.getItem(ITEM.id);
    expect(item.attachments).toEqual([ATTACHMENT]);
});

test('it can retrieve an attachment with its data', async () => {
    await db.init();
    await db.storeItem(ITEM);
    await db.storeAttachment(ITEM.id, { ...ATTACHMENT, data: ATTACHMENT_DATA });

    const attachment = await db.getAttachment(ITEM.id, ATTACHMENT.id);
    expect(attachment).toEqual({ ...ATTACHMENT, data: ATTACHMENT_DATA });

    expect(await db.getAttachment('other-item', ATTACHMENT.id)).toBeUndefined();
});

test('removing an item removes its attachments', async () => {
    await db.init();
    await db.storeItem(ITEM);
    await db.storeAttachment(ITEM.id, { ...ATTACHMENT, data: ATTACHMENT_DATA });

    await db.removeItem(ITEM.id);

    expect(await db.getAttachment(ITEM.id, ATTACHMENT.id)).toBeUndefined();
});
