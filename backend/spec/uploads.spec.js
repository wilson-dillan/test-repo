const express = require('express');
const { upload, uploadErrorHandler, checkContents } = require('../src/uploads');

let server, url;

beforeAll((done) => {
    const app = express();
    app.post('/upload', upload, (req, res) =>
        res.send(req.files.map((f) => [f.originalname, checkContents(f)])),
    );
    app.use(uploadErrorHandler);
    server = app.listen(0, () => {
        url = `http://localhost:${server.address().port}/upload`;
        done();
    });
});

afterAll((done) => {
    server.close(done);
});

function post(...files) {
    const form = new FormData();
    for (const [name, contents, type = 'application/octet-stream'] of files)
        form.append('files', new Blob([contents], { type }), name);
    return fetch(url, { method: 'POST', body: form });
}

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1]);
const ZIP = Buffer.from([0x50, 0x4b, 0x03, 0x04, 1, 2]);
const OLE = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
const HEIC = Buffer.concat([
    Buffer.from([0, 0, 0, 0x18]),
    Buffer.from('ftypheic'),
]);

test('accepts common documents and photos, whatever type the browser sends', async () => {
    const res = await post(
        ['a.pdf', '%PDF-1.7'],
        ['b.JPG', Buffer.from([0xff, 0xd8, 0xff, 0xe0])],
        ['c.png', PNG],
        ['d.heic', HEIC],
        ['e.docx', ZIP],
        ['f.xls', OLE],
        ['g.csv', 'name,amount\nJane,500\n', 'application/vnd.ms-excel'],
        ['h.txt', 'gate code 1234'],
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([
        ['a.pdf', 'application/pdf'],
        ['b.JPG', 'image/jpeg'],
        ['c.png', 'image/png'],
        ['d.heic', 'image/heic'],
        [
            'e.docx',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        ],
        ['f.xls', 'application/vnd.ms-excel'],
        ['g.csv', 'text/csv'],
        ['h.txt', 'text/plain'],
    ]);
});

test('rejects types that can run code', async () => {
    for (const name of ['page.html', 'logo.svg', 'setup.exe', 'script.js']) {
        const res = await post([name, 'x']);
        expect(res.status).toBe(400);
        expect((await res.json()).error).toMatch(/can't be uploaded/);
    }
});

test('flags files whose contents do not match their extension', async () => {
    const res = await post(
        ['fake.png', 'not really a png'],
        ['bin.txt', Buffer.from([1, 0, 2])],
    );
    expect(await res.json()).toEqual([
        ['fake.png', null],
        ['bin.txt', null],
    ]);
});

test('rejects files over 20 MB', async () => {
    const big = new Uint8Array(20 * 1024 * 1024 + 1);
    const res = await post(['big.pdf', big]);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/20 MB/);
});
