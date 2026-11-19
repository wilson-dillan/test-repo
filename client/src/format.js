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

// Due dates arrive as 'YYYY-MM-DD'; parse them as local dates so they
// don't shift a day in western time zones.
export function parseDate(value) {
    if (!value) return null;
    const [y, m, d] = value.split('-').map(Number);
    return new Date(y, m - 1, d);
}

export function formatDate(value) {
    const date = parseDate(value);
    return date ? dateFormat.format(date) : 'No due date';
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

// 'overdue' | 'soon' (within 3 days) | null
export function dueStatus(dueDate, state) {
    const date = parseDate(dueDate);
    if (!date || state === 'done') return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const days = (date - today) / 86400000;
    if (days < 0) return 'overdue';
    if (days <= 3) return 'soon';
    return null;
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
