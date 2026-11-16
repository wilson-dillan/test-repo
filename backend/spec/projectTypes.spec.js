const { PROJECT_TYPES } = require('../src/projectTypes');

test('every project type has a label and named tasks with forms', () => {
    for (const type of Object.values(PROJECT_TYPES)) {
        expect(type.label).toBeTruthy();
        expect(type.tasks.length).toBeGreaterThan(0);
        expect(type.tasks.length).toBeLessThanOrEqual(26);
        for (const task of type.tasks) {
            expect(task.name).toBeTruthy();
            expect(task.form).toBeTruthy();
        }
    }
});
