const express = require('express');
const { upload, uploadErrorHandler } = require('../src/uploads');

let server, url;

beforeAll((done) => {
    const app = express();
    app.post('/upload', upload, (req, res) =>
        res.send(req.files.map((f) => f.originalname)),
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
    for (const [name, type, contents] of files) {
        form.append('files', new Blob([contents], { type }), name);
    }
    return fetch(url, { method: 'POST', body: form });
}

test('it accepts PDF and JPEG files', async () => {
    const res = await post(
        ['a.pdf', 'application/pdf', '%PDF-1.7'],
        ['b.jpeg', 'image/jpeg', '\xff\xd8\xff'],
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(['a.pdf', 'b.jpeg']);
});

test('it rejects other file types', async () => {
    const res = await post(['notes.png', 'image/png', 'x']);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Only PDF and JPEG/);
});

test('it rejects a PDF type with the wrong extension', async () => {
    const res = await post(['script.exe', 'application/pdf', '%PDF-']);
    expect(res.status).toBe(400);
});

test('it rejects files over 10 MB', async () => {
    const big = new Uint8Array(10 * 1024 * 1024 + 1);
    const res = await post(['big.pdf', 'application/pdf', big]);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/10 MB/);
});
