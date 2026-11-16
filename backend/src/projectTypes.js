// The forms each kind of project needs, in order. Each form is one task,
// identified as a, b, c... (e.g. 1a, 1b, 1c). Uploading a task's form
// completes it, and the project completes when every form is uploaded.
// Changes only affect projects created afterwards.
const COMMON_FORMS = [
    'Manual J Calculation',
    'Load Calc',
    'Completed Customer Form',
];

const PROJECT_TYPES = {
    whole_home: {
        label: 'Whole Home',
        description: 'Full system for the entire house',
        forms: [...COMMON_FORMS, 'Home Blue Print Document'],
    },
    partial_home: {
        label: 'Partial Home',
        description: 'Work on part of the house',
        forms: COMMON_FORMS,
    },
};

// Kept in the { name, form } shape the rest of the app uses.
for (const type of Object.values(PROJECT_TYPES)) {
    type.tasks = type.forms.map((name) => ({ name, form: name }));
}

module.exports = { PROJECT_TYPES };
