const {
    hashPassword,
    verifyPassword,
    parseCookies,
    sameOriginOnly,
} = require('../src/auth');

test('hashes and verifies passwords', async () => {
    const hash = await hashPassword('correct horse');
    expect(hash).toMatch(/^scrypt\$/);
    expect(hash).not.toContain('correct horse');
    expect(await verifyPassword('correct horse', hash)).toBe(true);
    expect(await verifyPassword('wrong horse', hash)).toBe(false);
    expect(await verifyPassword('anything', 'garbage')).toBe(false);
});

test('two hashes of the same password differ', async () => {
    expect(await hashPassword('same')).not.toBe(await hashPassword('same'));
});

test('parses cookies', () => {
    expect(parseCookies('a=1; wsid=abc%3D; bad')).toEqual({
        a: '1',
        wsid: 'abc=',
    });
    expect(parseCookies(undefined)).toEqual({});
});

describe('sameOriginOnly', () => {
    const run = (method, headers) => {
        const next = jest.fn();
        let error;
        try {
            sameOriginOnly({ method, headers }, {}, next);
        } catch (err) {
            error = err;
        }
        return { next, error };
    };

    test('allows reads and same-origin writes', () => {
        expect(run('GET', { origin: 'https://evil.example' }).next).toHaveBeenCalled();
        expect(
            run('POST', { origin: 'http://localhost', host: 'localhost' }).next,
        ).toHaveBeenCalled();
        expect(run('POST', { host: 'localhost' }).next).toHaveBeenCalled();
    });

    test('blocks cross-site writes', () => {
        const { next, error } = run('POST', {
            origin: 'https://evil.example',
            host: 'localhost',
        });
        expect(next).not.toHaveBeenCalled();
        expect(error.status).toBe(403);
    });
});
