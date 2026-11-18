// Read-only access to Housecall Pro customers, used to autofill a new
// project's customer name and address. The API key stays on the server
// (HOUSECALL_PRO_API_KEY); Housecall Pro only offers API keys on its MAX
// plan, created by an admin in the "API Key Management" app.
const { HttpError } = require('./errors');

const TIMEOUT_MS = 10000;

function settings(env = process.env) {
    return {
        key: env.HOUSECALL_PRO_API_KEY?.trim().replace(/^"(.*)"$/, '$1'),
        baseUrl: (env.HOUSECALL_PRO_BASE_URL || 'https://api.housecallpro.com')
            .trim()
            .replace(/\/$/, ''),
        // Where "View in Housecall Pro" links go; {id} is the customer id.
        customerUrl:
            env.HOUSECALL_PRO_CUSTOMER_URL ||
            'https://pro.housecallpro.com/app/customers/{id}',
    };
}

function isConfigured() {
    return Boolean(settings().key);
}

function customerLink(id) {
    return id
        ? settings().customerUrl.replace('{id}', encodeURIComponent(id))
        : null;
}

// Housecall Pro API keys use "Token <key>"; fall back to "Bearer <key>"
// once if that's rejected, and remember whichever works.
let scheme = 'Token';

async function request(path) {
    const { key, baseUrl } = settings();
    if (!key)
        throw new HttpError(
            503,
            'Housecall Pro is not connected. Add HOUSECALL_PRO_API_KEY to the settings.',
        );

    const attempt = (authScheme) =>
        fetch(`${baseUrl}${path}`, {
            headers: {
                Authorization: `${authScheme} ${key}`,
                Accept: 'application/json',
            },
            signal: AbortSignal.timeout(TIMEOUT_MS),
        });

    let res;
    try {
        res = await attempt(scheme);
        if (res.status === 401) {
            const other = scheme === 'Token' ? 'Bearer' : 'Token';
            const retry = await attempt(other);
            if (retry.ok) scheme = other;
            res = retry;
        }
    } catch (err) {
        throw new HttpError(
            502,
            err.name === 'TimeoutError'
                ? 'Housecall Pro took too long to answer. Try again.'
                : `Couldn't reach Housecall Pro (${err.message}).`,
        );
    }

    if (res.status === 401)
        throw new HttpError(
            502,
            'Housecall Pro rejected the API key. Check HOUSECALL_PRO_API_KEY.',
        );
    if (res.status === 403)
        throw new HttpError(
            502,
            "Housecall Pro refused access. The API key may not have permission, or the account's plan may not include the API.",
        );
    if (res.status === 429)
        throw new HttpError(
            502,
            'Housecall Pro is limiting requests right now. Wait a minute and try again.',
        );
    if (!res.ok)
        throw new HttpError(
            502,
            `Housecall Pro returned an error (${res.status}).`,
        );
    return res.json();
}

function formatAddress(a) {
    const street = [a.street, a.street_line_2].filter(Boolean).join(', ');
    const cityLine = [a.city, [a.state, a.zip].filter(Boolean).join(' ')]
        .filter(Boolean)
        .join(', ');
    return [street, cityLine].filter(Boolean).join(', ');
}

function customerName(c) {
    const person = [c.first_name, c.last_name].filter(Boolean).join(' ').trim();
    return person || c.company || 'Unnamed customer';
}

// One entry per customer, with their distinct addresses, ranked:
//   0. first name starts with what was typed
//   1. last name starts with it
//   2. name (first, last or company) contains every word typed
//   3. everything else Housecall Pro matched (emails, notes, contacts...)
// Ties keep Housecall Pro's order.
function toCustomers(customers, query = '') {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    const list = customers.map((c) => {
        const person = Boolean(c.first_name || c.last_name);
        const name = customerName(c);
        const searchable = [c.first_name, c.last_name, c.company]
            .filter(Boolean)
            .join(' ')
            .toLowerCase();
        const firstName = person ? (c.first_name || '').trim() : name;
        const lastName = person ? (c.last_name || '').trim() : '';
        const nameMatch =
            words.length > 0 && words.every((w) => searchable.includes(w));
        const startsWith = (value) =>
            value.toLowerCase().startsWith(words[0] || '\u0000');
        const rank = !nameMatch
            ? 3
            : startsWith(firstName)
              ? 0
              : startsWith(lastName)
                ? 1
                : 2;
        return {
            customerId: String(c.id),
            name,
            // A business with no contact person goes in as the first name.
            firstName,
            lastName,
            rank,
            addresses: [
                ...new Set(
                    (c.addresses || []).map(formatAddress).filter(Boolean),
                ),
            ],
            nameMatch,
        };
    });
    // Stable sort keeps Housecall Pro's order within each rank.
    list.sort((a, b) => a.rank - b.rank);
    list.forEach((customer) => delete customer.rank);
    return list;
}

async function searchCustomers(query) {
    const q = String(query || '').trim();
    if (q.length < 2) return [];
    const data = await request(
        `/customers?q=${encodeURIComponent(q)}&page_size=10`,
    );
    return toCustomers(data.customers || [], q);
}

// For the connection check: confirms the key works without returning data.
async function checkConnection() {
    if (!isConfigured()) return { connected: false, error: null };
    try {
        await request('/customers?page_size=1');
        return { connected: true, error: null };
    } catch (err) {
        return { connected: false, error: err.message };
    }
}

module.exports = {
    isConfigured,
    customerLink,
    searchCustomers,
    checkConnection,
    toCustomers,
    settings,
};
