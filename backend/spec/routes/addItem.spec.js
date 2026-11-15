const db = require('../../src/persistence');
const addItem = require('../../src/routes/addItem');
const ITEM = { id: 12345 };
const { v4: uuid } = require('uuid');

jest.mock('uuid', () => ({ v4: jest.fn() }));

beforeEach(() => jest.clearAllMocks());

jest.mock('../../src/persistence', () => ({
    removeItem: jest.fn(),
    storeItem: jest.fn(),
    storeAttachment: jest.fn(),
    getItem: jest.fn(),
}));

test('it stores item correctly', async () => {
    const id = 'something-not-a-uuid';
    const name = 'A sample item';
    const req = { body: { name } };
    const res = { send: jest.fn() };

    uuid.mockReturnValue(id);

    await addItem(req, res);

    const expectedItem = { id, name, completed: false };

    expect(db.storeItem.mock.calls.length).toBe(1);
    expect(db.storeItem.mock.calls[0][0]).toEqual(expectedItem);
    expect(db.storeAttachment).not.toHaveBeenCalled();
    expect(res.send.mock.calls[0].length).toBe(1);
    expect(res.send.mock.calls[0][0]).toEqual({
        ...expectedItem,
        attachments: [],
    });
});

test('it stores uploaded files as attachments', async () => {
    const pdf = Buffer.from('%PDF-1.7\n');
    const req = {
        body: { name: 'With a file' },
        files: [
            {
                originalname: 'receipt.pdf',
                mimetype: 'application/pdf',
                size: pdf.length,
                buffer: pdf,
            },
        ],
    };
    const res = { send: jest.fn() };

    uuid.mockReturnValueOnce('item-id').mockReturnValueOnce('file-id');

    await addItem(req, res);

    const attachment = {
        id: 'file-id',
        filename: 'receipt.pdf',
        mimeType: 'application/pdf',
        size: pdf.length,
    };
    expect(db.storeAttachment).toHaveBeenCalledWith('item-id', {
        ...attachment,
        data: pdf,
    });
    expect(res.send.mock.calls[0][0].attachments).toEqual([attachment]);
});

test('it rejects files whose contents are not really PDF or JPEG', async () => {
    const req = {
        body: { name: 'Sneaky' },
        files: [
            {
                originalname: 'evil.pdf',
                mimetype: 'application/pdf',
                size: 4,
                buffer: Buffer.from('MZ\x90\x00'),
            },
        ],
    };
    const send = jest.fn();
    const res = { status: jest.fn(() => ({ send })) };

    await addItem(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(db.storeItem).not.toHaveBeenCalled();
});
