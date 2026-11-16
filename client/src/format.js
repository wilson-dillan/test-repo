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

export const STATE_LABELS = { todo: 'To Do', done: 'Done' };

const FIELD_LABELS = {
    customer_name: 'customer name',
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
    if (action === 'undo')
        return {
            verb: on(`undid the ${label} change`, 'on'),
            detail: `back to ${displayValue(field, newValue)}`,
        };
    if (field === 'active')
        return newValue === 'false'
            ? { verb: 'marked', suffix: 'as inactive' }
            : { verb: 'reactivated' };
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
export function formLabel(name) {
    return /\b(form|document)$/i.test(name) ? name : `${name} form`;
}
