const express = require('express');
const housecall = require('../src/housecall');

// A stand-in for api.housecallpro.com.
let server;
let seenAuth = [];
let acceptScheme = 'Token';

beforeAll((done) => {
    const app = express();
    app.get('/customers', (req, res) => {
        seenAuth.push(req.headers.authorization);
        if (req.headers.authorization !== `${acceptScheme} good-key`)
            return res.status(401).send({ error: 'unauthorized' });
        const all = [
            {
                id: 'cus_1',
                first_name: 'Margaret',
                last_name: 'Thompson',
                company: null,
                addresses: [
                    {
                        street: '418 Willow Creek Rd',
                        street_line_2: null,
                        city: 'Easthampton',
                        state: 'MA',
                        zip: '01027',
                    },
                    {
                        street: '12 Lake St',
                        city: 'Amherst',
                        state: 'MA',
                        zip: '01002',
                    },
                ],
            },
            {
                id: 'cus_2',
                first_name: '',
                last_name: '',
                company: 'Westbrook Dental',
                addresses: [],
            },
        ];
        const q = (req.query.q || '').toLowerCase();
        res.send({
            customers: all.filter((c) =>
                JSON.stringify(c).toLowerCase().includes(q),
            ),
        });
    });
    server = app.listen(0, () => {
        process.env.HOUSECALL_PRO_BASE_URL = `http://localhost:${server.address().port}`;
        done();
    });
});

afterAll((done) => {
    delete process.env.HOUSECALL_PRO_API_KEY;
    delete process.env.HOUSECALL_PRO_BASE_URL;
    server.close(done);
});

beforeEach(() => {
    seenAuth = [];
    acceptScheme = 'Token';
    process.env.HOUSECALL_PRO_API_KEY = 'good-key';
});

test('is off without a key', async () => {
    delete process.env.HOUSECALL_PRO_API_KEY;
    expect(housecall.isConfigured()).toBe(false);
    expect(await housecall.checkConnection()).toEqual({
        connected: false,
        error: null,
    });
});

test('returns one entry per customer with their distinct addresses', async () => {
    const results = await housecall.searchCustomers('thomp');
    expect(results).toEqual([
        {
            customerId: 'cus_1',
            name: 'Margaret Thompson',
            firstName: 'Margaret',
            lastName: 'Thompson',
            addresses: [
                '418 Willow Creek Rd, Easthampton, MA 01027',
                '12 Lake St, Amherst, MA 01002',
            ],
            nameMatch: true,
        },
    ]);
    expect(seenAuth).toEqual(['Token good-key']);
});

test('uses the company name when there is no person, even with no address', async () => {
    expect(await housecall.searchCustomers('westbrook')).toEqual([
        {
            customerId: 'cus_2',
            name: 'Westbrook Dental',
            firstName: 'Westbrook Dental',
            lastName: '',
            addresses: [],
            nameMatch: true,
        },
    ]);
});

test('puts name matches first and removes duplicate addresses', () => {
    const results = housecall.toCustomers(
        [
            {
                id: 'a',
                first_name: 'Denise',
                last_name: 'Orenstein',
                addresses: [
                    { street: '1 A St', city: 'X' },
                    { street: '1 A St', city: 'X' },
                    { street: '2 B St', city: 'X' },
                ],
            },
            { id: 'b', first_name: 'Zoe', last_name: 'Smith', addresses: [] },
        ],
        'zoe',
    );
    expect(results.map((r) => [r.name, r.nameMatch])).toEqual([
        ['Zoe Smith', true],
        ['Denise Orenstein', false],
    ]);
    expect(results[1].addresses).toEqual(['1 A St, X', '2 B St, X']);
    expect(
        housecall.toCustomers(
            [{ id: 'c', first_name: 'Zoe', last_name: 'Smith' }],
            'smith zoe',
        )[0].nameMatch,
    ).toBe(true);
});

test('ranks first-name matches, then last-name, then other name matches', () => {
    const order = housecall
        .toCustomers(
            [
                { id: 1, first_name: 'Pat', last_name: 'Lee', notes: 'zo' },
                { id: 2, first_name: 'Lorenzo', last_name: 'Brown' },
                { id: 3, first_name: 'Ann', last_name: 'Zoller' },
                { id: 4, first_name: 'Zoe', last_name: 'Sample' },
                { id: 5, company: 'Zone Heating' },
            ],
            'zo',
        )
        .map((c) => c.name);
    expect(order).toEqual([
        'Zoe Sample', // first name starts with "zo"
        'Zone Heating', // business name counts as first name
        'Ann Zoller', // last name starts with "zo"
        'Lorenzo Brown', // "zo" inside the name
        'Pat Lee', // matched on other details
    ]);
});

test('ignores searches shorter than 2 characters', async () => {
    expect(await housecall.searchCustomers('m')).toEqual([]);
    expect(seenAuth).toEqual([]);
});

test('falls back to a Bearer header if Token is rejected', async () => {
    acceptScheme = 'Bearer';
    expect((await housecall.searchCustomers('thomp')).length).toBe(1);
    expect(seenAuth).toEqual(['Token good-key', 'Bearer good-key']);
});

test('explains a rejected key', async () => {
    process.env.HOUSECALL_PRO_API_KEY = 'bad-key';
    await expect(housecall.searchCustomers('thomp')).rejects.toThrow(
        /rejected the API key/,
    );
    expect(await housecall.checkConnection()).toMatchObject({
        connected: false,
        error: expect.stringMatching(/rejected the API key/),
    });
});

test('builds a link to the customer in Housecall Pro', () => {
    expect(housecall.customerLink('cus_1')).toBe(
        'https://pro.housecallpro.com/app/customers/cus_1',
    );
    expect(housecall.customerLink(null)).toBeNull();
});
