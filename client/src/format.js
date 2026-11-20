const dateFormat = new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
});
const dateTimeFormat = new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
});
const relative = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });

// Plain dates arrive as 'YYYY-MM-DD'; parse them as local dates so they
// don't shift a day in western time zones.
export function parseDate(value) {
    if (!value) return null;
    const [y, m, d] = value.split('-').map(Number);
    return new Date(y, m - 1, d);
}

export function formatDate(value) {
    const date = parseDate(value);
    return date ? dateFormat.format(date) : '—';
}

export function formatDateTime(value) {
    return dateTimeFormat.format(new Date(value));
}

export function timeAgo(value) {
    const seconds = Math.round((new Date(value) - Date.now()) / 1000);
    const units = [
        ['year', 31536000],
        ['month', 2592000],
        ['week', 604800],
        ['day', 86400],
        ['hour', 3600],
        ['minute', 60],
    ];
    for (const [unit, size] of units) {
        if (Math.abs(seconds) >= size)
            return relative.format(Math.round(seconds / size), unit);
    }
    return 'just now';
}

// Whole days since `createdAt` (0 on the day it was created), counted in
// calendar days on this computer.
export function daysOld(createdAt) {
    const created = new Date(createdAt);
    created.setHours(0, 0, 0, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Math.max(0, Math.round((today - created) / 86400000));
}

export function formatAge(days) {
    return days === 0 ? 'New today' : `${days} day${days === 1 ? '' : 's'} old`;
}

export function formatCreated(createdAt) {
    return dateFormat.format(new Date(createdAt));
}

export function initials(name = '') {
    const parts = name.trim().split(/\s+/);
    return (
        (parts[0]?.[0] || '') + (parts.length > 1 ? parts.at(-1)[0] : '')
    ).toUpperCase();
}

const money = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
});

export function formatMoney(value) {
    return money.format(value);
}

// Stages of an application (a project), as opposed to a single document.
export const PROJECT_STATUS_LABELS = {
    todo: 'To Do',
    in_progress: 'In Progress',
    submitted: 'Submitted',
    done: 'Done (Rebate received)',
};

export const STATE_LABELS = {
    todo: 'To Do',
    in_progress: 'In Progress',
    done: 'Done',
};

const FIELD_LABELS = {
    customer_name: 'customer name',
    customer_first_name: 'first name',
    customer_last_name: 'last name',
    financing: 'financing',
    financing_provider: 'financing provider',
    financing_other: 'financing provider name',
    heats_with_gas: 'natural gas heating',
    integrated_controls: 'integrated controls',
    controls_type: 'controls type',
    controls_other: 'controls name',
    address: 'address',
    due_date: 'due date',
    owner_id: 'owner',
    state: 'state',
    notes: 'notes',
    active: 'status',
};

function displayValue(field, value) {
    if (value === null || value === '') return 'nothing';
    if (field === 'state') return STATE_LABELS[value] || value;
    if (field === 'active') return value === 'true' ? 'Active' : 'Inactive';
    if (value === 'true') return 'Yes';
    if (value === 'false') return 'No';
    if (field === 'due_date') return formatDate(value);
    return value;
}

// Turns a history entry into words. The sentence reads
// "<actor> <verb> [<target>] <suffix> · <detail>", e.g.
// "Pauline marked 1a · Task A as done" or "Chris reassigned 1b · from Carine to Dillan".
// Without a target (e.g. on the task's own page) the wording adapts.
export function describeHistory(entry, withTarget = true) {
    const { action, field, oldValue, newValue } = entry;
    const label = FIELD_LABELS[field] || field;
    const on = (words, preposition) =>
        withTarget ? `${words} ${preposition}` : words;

    if (action === 'created')
        return withTarget
            ? { verb: 'created', detail: newValue }
            : { verb: 'created this project', detail: newValue };
    if (action === 'file') return { verb: on(`uploaded ${newValue}`, 'to') };
    if (action === 'rebate') {
        const r = JSON.parse(newValue || '{}');
        return {
            verb: 'recorded the rebate',
            detail: `#${r.number} · ${formatMoney(r.amount)} · received ${formatDate(r.receivedOn)}`,
        };
    }
    if (action === 'reopen')
        return {
            verb: 'moved the application back',
            detail: `to ${PROJECT_STATUS_LABELS[newValue]}`,
        };
    if (action === 'undo')
        return {
            verb: on(`undid the ${label} change`, 'on'),
            detail: `back to ${displayValue(field, newValue)}`,
        };
    if (field === 'active' && entry.taskId)
        return newValue === 'false'
            ? { verb: 'marked', suffix: 'as not needed' }
            : { verb: 'marked', suffix: 'as needed again' };
    if (field === 'active')
        return newValue === 'false'
            ? { verb: 'marked', suffix: 'as inactive' }
            : { verb: 'reactivated' };
    if (field === 'state' && newValue === 'submitted')
        return { verb: 'marked', suffix: 'as submitted' };
    if (field === 'state')
        return newValue === 'done'
            ? { verb: 'marked', suffix: 'as done' }
            : { verb: 'reopened' };
    if (field === 'owner_id')
        return {
            verb: 'reassigned',
            detail: `from ${oldValue} to ${newValue}`,
        };
    if (field === 'notes') return { verb: on('updated the notes', 'on') };
    return {
        verb: on(`changed the ${label}`, 'of'),
        detail: `from ${displayValue(field, oldValue)} to ${displayValue(field, newValue)}`,
    };
}

// "Manual J Calculation" -> "Manual J Calculation form", but leave names
// that already say what they are ("Completed Customer Form").
// Everyone who can own something, plus its current owner if they've since
// been deactivated (so the dropdown still shows them).
export function ownerChoices(users, owner) {
    return users.some((u) => u.id === owner.id)
        ? users
        : [...users, { id: owner.id, displayName: owner.name }];
}

export function formLabel(name) {
    return /\b(form|document|bill)$/i.test(name) ? name : `${name} form`;
}

// Open applications still collecting documents, most urgent first: the
// oldest and the most incomplete come first, weighed together. Each
// application gets a place in two orders and the smallest total wins:
// - most incomplete: smallest share of documents uploaded; among equals,
//   more documents outstanding (4 missing beats 1);
// - oldest: most days since it was created.
// Ties go to the most incomplete, then the oldest.
export function rankByPriority(projects) {
    const byIncomplete = (a, b) => a.share - b.share || b.missing - a.missing;
    const byAge = (a, b) => b.age - a.age;
    const open = projects
        .filter((p) => p.active && p.state === 'todo' && p.taskTotal > 0)
        .map((p) => ({
            ...p,
            share: p.taskDone / p.taskTotal,
            missing: p.taskTotal - p.taskDone,
            age: daysOld(p.createdAt),
        }));
    // Equal values share a place, so a tie in one order counts for neither.
    const places = (compare) => {
        const order = [...open].sort(compare);
        const place = new Map();
        order.forEach((p, i) =>
            place.set(
                p.id,
                i > 0 && compare(order[i - 1], p) === 0
                    ? place.get(order[i - 1].id)
                    : i,
            ),
        );
        return place;
    };
    const incomplete = places(byIncomplete);
    const oldest = places(byAge);
    const total = (p) => incomplete.get(p.id) + oldest.get(p.id);
    return open.sort(
        (a, b) => total(a) - total(b) || byIncomplete(a, b) || byAge(a, b),
    );
}
