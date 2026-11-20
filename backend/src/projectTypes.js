// The documents each kind of project needs, in order. Each one is a task,
// labeled #<project><letter> (e.g. #1a, #1b). Uploading a task's document
// completes it; the project completes when every needed document is in.
//
// `onlyIf` names a yes/no project field: the task is always listed but is
// only needed (active) while that answer is Yes.
const PROJECT_TYPES = {
    whole_home: {
        label: 'Whole Home',
        description: 'Full system for the entire house',
        forms: [
            { name: 'Manual J Calculation' },
            { name: 'Whole House Rebate Form' },
            { name: 'Electric Bill' },
            { name: 'Natural Gas Bill', onlyIf: 'heats_with_gas' },
        ],
        asks: ['heats_with_gas'],
    },
    partial_home: {
        label: 'Partial Home',
        description: 'Work on part of the house',
        forms: [{ name: 'Manual J Calculation' }],
        asks: ['integrated_controls'],
    },
    basic_rebate: {
        label: 'Basic Rebate',
        description: 'Needs the electric bill only',
        forms: [{ name: 'Electric Bill' }],
        asks: [],
    },
};

const FINANCING_PROVIDERS = ['MassSave', 'Synchrony', 'Other'];
const CONTROLS_TYPES = ['Ecobee', 'Flair', 'Mitsubishi', 'Other'];

// Kept in the { name, form } shape the rest of the app uses.
for (const type of Object.values(PROJECT_TYPES)) {
    type.tasks = type.forms.map((f) => ({ ...f, form: f.name }));
}

module.exports = { PROJECT_TYPES, FINANCING_PROVIDERS, CONTROLS_TYPES };
