const db = require('../../src/persistence');
const getAttachment = require('../../src/routes/getAttachment');

jest.mock('../../src/persistence', () => ({
    getAttachment: jest.fn(),
}));

test('it sends the stored file inline', async () => {
    const data = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
    db.getAttachment.mockReturnValue(
        Promise.resolve({
            id: 'file-id',
            filename: 'photo 1.jpg',
            mimeType: 'image/jpeg',
            size: data.length,
            data,
        }),
    );
    const req = { params: { id: 'item-id', attachmentId: 'file-id' } };
    const res = { set: jest.fn(), send: jest.fn() };

    await getAttachment(req, res);

    expect(db.getAttachment).toHaveBeenCalledWith('item-id', 'file-id');
    expect(res.set.mock.calls[0][0]).toMatchObject({
        'Content-Type': 'image/jpeg',
        'Content-Disposition': "inline; filename*=UTF-8''photo%201.jpg",
    });
    expect(res.send).toHaveBeenCalledWith(data);
});

test('it returns 404 for an unknown attachment', async () => {
    db.getAttachment.mockReturnValue(Promise.resolve(undefined));
    const req = { params: { id: 'item-id', attachmentId: 'missing' } };
    const res = { sendStatus: jest.fn() };

    await getAttachment(req, res);

    expect(res.sendStatus).toHaveBeenCalledWith(404);
});
