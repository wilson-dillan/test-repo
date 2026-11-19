// End-to-end API tests against a real Postgres database. They run only when
// TEST_DATABASE_URL points at a throwaway database (its name must contain
// "test", since the schema is wiped first), e.g.:
//
//   docker compose exec postgres createdb -U postgres wilson_test
//   docker compose exec -e TEST_DATABASE_URL=postgres://postgres:secret@postgres:5432/wilson_test backend npm test
const { Client } = require('pg');

const DATABASE_URL = process.env.TEST_DATABASE_URL;
const run =
    DATABASE_URL && /test/.test(DATABASE_URL) ? describe : describe.skip;

run('API', () => {
    let server, base, db;

    beforeAll(async () => {
        const client = new Client({ connectionString: DATABASE_URL });
        await client.connect();
        await client.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
        await client.end();

        process.env.SUPERUSER_USERNAME = 'boss';
        process.env.SUPERUSER_PASSWORD = 'boss-password';
        process.env.SUPERUSER_NAME = 'The Boss';
        db = require('../src/db');
        await db.init(DATABASE_URL);
        await require('../src/auth').ensureSuperuser();

        await new Promise((resolve) => {
            server = require('../src/app').createApp().listen(0, resolve);
        });
        base = `http://localhost:${server.address().port}`;
    });

    afterAll(async () => {
        await new Promise((resolve) => server.close(resolve));
        await db.teardown();
    });

    // A tiny client that keeps its own session cookie.
    function session() {
        let cookie = '';
        const call = async (method, path, body, headers = {}) => {
            const isForm = body instanceof FormData;
            const res = await fetch(base + path, {
                method,
                headers: {
                    cookie,
                    ...(body &&
                        !isForm && { 'content-type': 'application/json' }),
                    ...headers,
                },
                body: body && (isForm ? body : JSON.stringify(body)),
            });
            const setCookie = res.headers.get('set-cookie');
            if (setCookie) cookie = setCookie.split(';')[0];
            const type = res.headers.get('content-type') || '';
            const data = type.includes('json') ? await res.json() : null;
            return { status: res.status, data, res };
        };
        return {
            get: (p) => call('GET', p),
            post: (p, b, h) => call('POST', p, b, h),
            patch: (p, b) => call('PATCH', p, b),
            del: (p, b) => call('DELETE', p, b),
            login: (username, password) =>
                call('POST', '/api/auth/login', { username, password }),
        };
    }

    const boss = session();
    const alice = session();
    const bob = session();
    let aliceId, bobId, project, taskA;

    test('requires login', async () => {
        const { status } = await session().get('/api/projects');
        expect(status).toBe(401);
    });

    test('rejects a wrong password', async () => {
        const { status } = await session().login('boss', 'nope');
        expect(status).toBe(401);
    });

    test('the super user can log in', async () => {
        const { status, data } = await boss.login('boss', 'boss-password');
        expect(status).toBe(200);
        expect(data).toMatchObject({ displayName: 'The Boss', isSuper: true });
        expect((await boss.get('/api/auth/me')).data.username).toBe('boss');
    });

    test('the super user creates accounts', async () => {
        const a = await boss.post('/api/users', {
            username: 'Alice',
            displayName: 'Alice',
            email: 'alice@example.com',
            password: 'alice-password',
        });
        expect(a.status).toBe(201);
        expect(a.data.username).toBe('alice');
        aliceId = a.data.id;

        const b = await boss.post('/api/users', {
            username: 'bob',
            displayName: 'Bob',
            password: 'bob-password',
        });
        bobId = b.data.id;

        const short = await boss.post('/api/users', {
            username: 'carl',
            displayName: 'Carl',
            password: 'short',
        });
        expect(short.status).toBe(400);
    });

    test('regular users cannot create accounts', async () => {
        await alice.login('alice', 'alice-password');
        await bob.login('bob', 'bob-password');
        const { status } = await alice.post('/api/users', {
            username: 'eve',
            displayName: 'Eve',
            password: 'eve-password',
        });
        expect(status).toBe(403);
    });

    async function waitFor(condition) {
        for (let i = 0; i < 100 && !condition(); i++)
            await new Promise((r) => setTimeout(r, 20));
        expect(condition()).toBe(true);
    }

    test('inviting a user emails a 48-hour link to choose a password', async () => {
        const mailer = require('../src/mailer');
        const sent = [];
        const spy = jest
            .spyOn(mailer, 'sendPasswordLink')
            .mockImplementation(async (user, link) => {
                sent.push({ user, link });
            });

        const { status, data } = await boss.post('/api/users', {
            username: 'carl',
            displayName: 'Carl',
            email: 'carl@example.com',
        });
        expect(status).toBe(201);
        expect(data).toMatchObject({
            hasPassword: false,
            invite: { sent: true },
        });
        expect(sent[0].link).toMatchObject({ purpose: 'invite', hours: 48 });
        const token = sent[0].link.token;

        // No password yet, so no way in.
        expect((await session().login('carl', 'anything-at-all')).status).toBe(
            401,
        );

        const info = await session().get(`/api/auth/password-link/${token}`);
        expect(info.data).toEqual({
            username: 'carl',
            displayName: 'Carl',
            purpose: 'invite',
        });

        const carl = session();
        expect(
            (
                await carl.post(`/api/auth/password-link/${token}`, {
                    password: 'short',
                })
            ).status,
        ).toBe(400);
        const set = await carl.post(`/api/auth/password-link/${token}`, {
            password: 'carl-password',
        });
        expect(set.status).toBe(200);
        expect(set.data.hasPassword).toBe(true);
        expect((await carl.get('/api/auth/me')).data.username).toBe('carl');

        // Links work once.
        expect(
            (await session().get(`/api/auth/password-link/${token}`)).status,
        ).toBe(410);
        expect((await session().login('carl', 'carl-password')).status).toBe(
            200,
        );

        // A failed invite email still creates the account and says why.
        spy.mockRejectedValueOnce(
            new Error('The mail server rejected the login.'),
        );
        const failed = await boss.post('/api/users', {
            username: 'dora',
            displayName: 'Dora',
            email: 'dora@example.com',
        });
        expect(failed.status).toBe(201);
        expect(failed.data.invite).toEqual({
            sent: false,
            error: 'The mail server rejected the login.',
        });

        // An invite needs somewhere to go.
        expect(
            (
                await boss.post('/api/users', {
                    username: 'eli',
                    displayName: 'Eli',
                })
            ).status,
        ).toBe(400);
        spy.mockRestore();
    });

    test('forgot password emails a 1-hour link and alerts the super user', async () => {
        const mailer = require('../src/mailer');
        const links = [];
        const alerts = [];
        const linkSpy = jest
            .spyOn(mailer, 'sendPasswordLink')
            .mockImplementation(async (user, link) => {
                links.push({ user, link });
            });
        const alertSpy = jest
            .spyOn(mailer, 'notifyResetRequested')
            .mockImplementation(async (user, outcome) => {
                alerts.push({ user, outcome });
            });

        const anon = session();
        const unknown = await anon.post('/api/auth/forgot', {
            login: 'nobody',
        });
        const known = await anon.post('/api/auth/forgot', {
            login: 'ALICE@example.com',
        });
        // Same answer either way, so accounts can't be discovered.
        expect(known.status).toBe(200);
        expect(unknown.data).toEqual(known.data);

        await waitFor(() => alerts.length === 1);
        expect(links).toHaveLength(1);
        expect(links[0].link).toMatchObject({ purpose: 'reset', hours: 1 });
        expect(alerts[0].user.username).toBe('alice');
        expect(alerts[0].outcome).toEqual({ linkSent: true });

        // Bob has no email: no link, but the super user still hears about it.
        await anon.post('/api/auth/forgot', { login: 'bob' });
        await waitFor(() => alerts.length === 2);
        expect(links).toHaveLength(1);
        expect(alerts[1].outcome).toEqual({ linkSent: false });

        // Using the link signs Alice out everywhere else.
        const reset = await anon.post(
            `/api/auth/password-link/${links[0].link.token}`,
            { password: 'alice-new-password' },
        );
        expect(reset.status).toBe(200);
        expect((await alice.get('/api/auth/me')).status).toBe(401);
        expect((await alice.login('alice', 'alice-new-password')).status).toBe(
            200,
        );

        // A link the super user sends lasts 48 hours, and expired links fail.
        const sent = await boss.post(`/api/users/${aliceId}/password-link`);
        expect(sent.data).toMatchObject({
            sentTo: 'alice@example.com',
            purpose: 'reset',
            hours: 48,
        });
        await db.query(
            "UPDATE password_tokens SET expires_at = now() - interval '1 minute'",
        );
        const expired = await session().get(
            `/api/auth/password-link/${links[1].link.token}`,
        );
        expect(expired.status).toBe(410);
        expect(expired.data.error).toMatch(/expired/);
        expect(
            (await bob.post(`/api/users/${aliceId}/password-link`)).status,
        ).toBe(403);

        linkSpy.mockRestore();
        alertSpy.mockRestore();
    });

    test('creating a project creates its numbered tasks', async () => {
        const { status, data } = await alice.post('/api/projects', {
            type: 'whole_home',
            heatsWithGas: true,
            financing: false,
            customerFirstName: 'Jane',
            customerLastName: 'Smith',
            address: '12 Oak St',
            dueDate: '2026-12-01',
            ownerId: bobId,
            note: 'Gate code 1234',
        });
        expect(status).toBe(201);
        project = data;
        expect(project.id).toBe(1);
        expect(project.typeLabel).toBe('Whole Home');
        expect(project.tasks.map((t) => t.code)).toEqual([
            '#1a',
            '#1b',
            '#1c',
            '#1d',
        ]);
        expect(project.tasks.every((t) => t.owner.id === bobId)).toBe(true);
        expect(project.notes[0]).toMatchObject({
            author: 'Alice',
            body: 'Gate code 1234',
        });
        expect(project.history[0].action).toBe('created');
        taskA = project.tasks[0];
    });

    test('a project can remember its Housecall Pro customer', async () => {
        const { data } = await alice.post('/api/projects', {
            type: 'partial_home',
            integratedControls: false,
            financing: false,
            customerFirstName: 'Margaret',
            customerLastName: 'Thompson',
            address: '418 Willow Creek Rd',
            ownerId: aliceId,
            housecallCustomerId: 'cus_abc123',
        });
        expect(data.housecallCustomerId).toBe('cus_abc123');
        expect(data.housecallUrl).toBe(
            'https://pro.housecallpro.com/app/customers/cus_abc123',
        );
        const bad = await alice.post('/api/projects', {
            type: 'partial_home',
            integratedControls: false,
            financing: false,
            customerFirstName: 'X',
            customerLastName: '',
            address: 'Y',
            ownerId: aliceId,
            housecallCustomerId: '../../evil',
        });
        expect(bad.status).toBe(400);
        await boss.del(`/api/projects/${data.id}`);
    });

    test('customer first and last names are kept separately', async () => {
        const { data } = await alice.post('/api/projects', {
            type: 'partial_home',
            integratedControls: false,
            financing: false,
            customerFirstName: ' Mary ',
            customerLastName: 'Van Buren',
            address: '1 Main St',
            ownerId: aliceId,
        });
        expect(data).toMatchObject({
            customerFirstName: 'Mary',
            customerLastName: 'Van Buren',
            customerName: 'Mary Van Buren',
        });
        const { data: edited } = await alice.patch(`/api/projects/${data.id}`, {
            customerLastName: 'Smith',
        });
        expect(edited.customerName).toBe('Mary Smith');
        expect(edited.history[0]).toMatchObject({
            field: 'customer_last_name',
            oldValue: 'Van Buren',
            newValue: 'Smith',
        });
        // A business can have no last name.
        const { data: biz } = await alice.patch(`/api/projects/${data.id}`, {
            customerFirstName: 'Westbrook Dental',
            customerLastName: '',
        });
        expect(biz.customerName).toBe('Westbrook Dental');
        await boss.del(`/api/projects/${data.id}`);
    });

    test('validates new projects', async () => {
        const { status, data } = await alice.post('/api/projects', {
            type: 'whole_home',
            heatsWithGas: true,
            financing: false,
            customerFirstName: '',
            customerLastName: '',
            address: 'x',
            ownerId: bobId,
        });
        expect(status).toBe(400);
        expect(data.error).toMatch(/First name/);
    });

    test('reassigning a task is logged with names', async () => {
        const { data } = await alice.patch(`/api/tasks/${taskA.id}`, {
            ownerId: aliceId,
        });
        expect(data.owner.name).toBe('Alice');
        expect(data.history[0]).toMatchObject({
            field: 'owner_id',
            oldValue: 'Bob',
            newValue: 'Alice',
            actor: 'Alice',
            undoable: true,
        });
    });

    test('a task is done exactly when its document is uploaded', async () => {
        const { data: other } = await alice.post('/api/projects', {
            type: 'basic_rebate',
            financing: false,
            customerFirstName: 'Done',
            customerLastName: 'Rule',
            address: '1 Rule St',
            ownerId: aliceId,
        });
        const task = other.tasks[0];
        for (const state of ['done', 'todo']) {
            const res = await boss.patch(`/api/tasks/${task.id}`, { state });
            expect(res.status).toBe(400);
        }
        const { data: done } = await alice.post(
            `/api/tasks/${task.id}/attachments`,
            pdfForm(),
        );
        expect(done.state).toBe('done');
        expect(done.completedAt).toBeTruthy();

        // Completing it can't be undone on its own: the document would stay.
        const entry = done.history.find((h) => h.field === 'state');
        expect(entry.undoable).toBe(false);
        expect((await boss.post(`/api/activity/${entry.id}/undo`)).status).toBe(
            400,
        );
        await boss.del(`/api/projects/${other.id}`);
    });

    test('only the super user can undo', async () => {
        await alice.patch(`/api/tasks/${taskA.id}`, { notes: 'Call first' });
        const { data: task } = await alice.get(`/api/tasks/${taskA.id}`);
        const doneEntry = task.history.find((h) => h.field === 'notes');

        expect(
            (await alice.post(`/api/activity/${doneEntry.id}/undo`)).status,
        ).toBe(403);

        const undo = await boss.post(`/api/activity/${doneEntry.id}/undo`);
        expect(undo.status).toBe(200);

        const { data: after } = await alice.get(`/api/tasks/${taskA.id}`);
        expect(after.notes).toBe('');
        expect(after.history[0]).toMatchObject({
            action: 'undo',
            actor: 'The Boss',
            newValue: '',
        });
        expect(after.history.find((h) => h.id === doneEntry.id)).toMatchObject({
            undone: true,
            undoneBy: 'The Boss',
            undoable: false,
        });

        const again = await boss.post(`/api/activity/${doneEntry.id}/undo`);
        expect(again.status).toBe(409);
    });

    test('an undo is refused if the field changed again since', async () => {
        const { data: task } = await alice.get(`/api/tasks/${taskA.id}`);
        const ownerEntry = task.history.find((h) => h.field === 'owner_id');
        await alice.patch(`/api/tasks/${taskA.id}`, { ownerId: bobId });

        const { status, data } = await boss.post(
            `/api/activity/${ownerEntry.id}/undo`,
        );
        expect(status).toBe(409);
        expect(data.error).toMatch(/changed again/);
    });

    test('project fields can be edited and are logged', async () => {
        const { data } = await bob.patch(`/api/projects/${project.id}`, {
            address: '14 Oak St',
            dueDate: '2026-12-15',
        });
        expect(data.address).toBe('14 Oak St');
        expect(data.dueDate).toBe('2026-12-15');
        expect(
            data.history
                .slice(0, 2)
                .map((h) => h.field)
                .sort(),
        ).toEqual(['address', 'due_date']);

        const bad = await bob.patch(`/api/projects/${project.id}`, {
            dueDate: 'tomorrow',
        });
        expect(bad.status).toBe(400);
    });

    test('notes can be added to a project', async () => {
        const { status, data } = await bob.post(
            `/api/projects/${project.id}/notes`,
            { body: 'Customer called' },
        );
        expect(status).toBe(201);
        expect(data.author).toBe('Bob');
        const { data: detail } = await bob.get(`/api/projects/${project.id}`);
        expect(detail.notes.map((n) => n.body)).toEqual([
            'Customer called',
            'Gate code 1234',
        ]);
    });

    test('files upload to a task and download as a zip', async () => {
        const pdf = Buffer.from('%PDF-1.4\n%%EOF\n');
        const form = new FormData();
        form.append(
            'files',
            new Blob([pdf], { type: 'application/pdf' }),
            'permit.pdf',
        );
        const up = await bob.post(`/api/tasks/${taskA.id}/attachments`, form);
        expect(up.status).toBe(201);
        expect(up.data.attachments[0]).toMatchObject({
            filename: 'permit.pdf',
            uploadedBy: 'Bob',
        });
        // Uploading the form completes the task.
        expect(up.data.state).toBe('done');
        expect(up.data.history.find((h) => h.action === 'file')).toMatchObject({
            newValue: 'permit.pdf',
        });

        const file = await bob.get(
            `/api/attachments/${up.data.attachments[0].id}`,
        );
        expect(file.status).toBe(200);
        expect(Buffer.from(await file.res.arrayBuffer())).toEqual(pdf);

        const zip = await bob.get(`/api/projects/${project.id}/documents.zip`);
        expect(zip.status).toBe(200);
        const bytes = Buffer.from(await zip.res.arrayBuffer());
        expect(bytes.subarray(0, 2).toString()).toBe('PK');
    });

    test('lists my projects and tasks', async () => {
        const mine = await bob.get('/api/projects?owner=me');
        expect(mine.data.map((p) => p.id)).toEqual([project.id]);
        expect(mine.data[0]).toMatchObject({ taskTotal: 4, taskDone: 1 });

        const aliceTasks = await alice.get('/api/tasks?owner=me');
        expect(aliceTasks.data).toEqual([]);
    });

    test("a project's stage can't be set directly", async () => {
        const res = await bob.patch(`/api/projects/${project.id}`, {
            state: 'done',
        });
        expect(res.status).toBe(400);
    });

    test('dashboard stats', async () => {
        await bob.post(
            `/api/tasks/${project.tasks[1].id}/attachments`,
            pdfForm(),
        );
        const { data } = await bob.get('/api/stats');
        expect(data.tasks).toEqual({ total: 4, done: 2 });
        expect(data.tasksPerUser.find((u) => u.name === 'Bob')).toMatchObject({
            total: 4,
            done: 2,
        });
        expect(data.projectsCompletedByWeek).toHaveLength(12);
    });

    test('activity feed shows recent changes across projects', async () => {
        const { data } = await alice.get('/api/activity?limit=5');
        expect(data).toHaveLength(5);
        expect(data[0]).toMatchObject({ taskCode: '#1b', field: 'state' });
    });

    test('inactive projects stay listed and anyone can reactivate them', async () => {
        const second = await bob.post('/api/projects', {
            type: 'partial_home',
            integratedControls: false,
            financing: false,
            customerFirstName: 'Old',
            customerLastName: 'Lead',
            address: '1 Elm St',
            ownerId: bobId,
        });
        const off = await bob.patch(`/api/projects/${second.data.id}`, {
            active: false,
        });
        expect(off.data.active).toBe(false);
        expect(off.data.history[0]).toMatchObject({
            field: 'active',
            oldValue: 'true',
            newValue: 'false',
        });

        const list = await bob.get('/api/projects');
        expect(list.data.map((p) => p.id)).toEqual([
            project.id,
            second.data.id,
        ]);
        expect(list.data[1].active).toBe(false);

        const tasks = await bob.get('/api/tasks?owner=me');
        expect(
            tasks.data.find((t) => t.projectId === second.data.id)
                .projectActive,
        ).toBe(false);

        const stats = await bob.get('/api/stats');
        expect(stats.data.projects).toMatchObject({ open: 1, inactive: 1 });

        expect(
            (
                await bob.patch(`/api/projects/${second.data.id}`, {
                    active: 'no',
                })
            ).status,
        ).toBe(400);

        const back = await bob.patch(`/api/projects/${second.data.id}`, {
            active: true,
        });
        expect(back.data.active).toBe(true);
    });

    test('uploading every form makes it ready to submit; done forms are locked', async () => {
        const form = () => {
            const body = new FormData();
            body.append(
                'files',
                new Blob([Buffer.from('%PDF-1.4\n')], {
                    type: 'application/pdf',
                }),
                'form.pdf',
            );
            return body;
        };
        const { data: before } = await bob.get(`/api/projects/${project.id}`);
        const open = before.tasks.filter((t) => t.state === 'todo');
        expect(open.length).toBe(2);
        expect(before.tasks[0].latestDocument).toMatchObject({
            filename: 'permit.pdf',
            uploadedBy: 'Bob',
        });

        for (const task of open)
            expect(
                (await bob.post(`/api/tasks/${task.id}/attachments`, form()))
                    .status,
            ).toBe(201);

        // Nothing finishes on its own: the application waits to be submitted.
        const { data: after } = await bob.get(`/api/projects/${project.id}`);
        expect(after.tasks.every((t) => t.state === 'done')).toBe(true);
        expect(after).toMatchObject({ state: 'todo', status: 'in_progress' });

        const again = await bob.post(
            `/api/tasks/${open[0].id}/attachments`,
            form(),
        );
        expect(again.status).toBe(403);
        const replaced = await boss.post(
            `/api/tasks/${open[0].id}/attachments`,
            form(),
        );
        expect(replaced.status).toBe(201);
    });

    test('only the super user can delete a project, and it is gone for good', async () => {
        const { data: doomed } = await bob.post('/api/projects', {
            type: 'partial_home',
            integratedControls: false,
            financing: false,
            customerFirstName: 'Typo',
            customerLastName: 'Customer',
            address: '0 Nowhere',
            ownerId: bobId,
        });
        const form = new FormData();
        form.append(
            'files',
            new Blob([Buffer.from('%PDF-1.4\n')], { type: 'application/pdf' }),
            'x.pdf',
        );
        const up = await bob.post(
            `/api/tasks/${doomed.tasks[0].id}/attachments`,
            form,
        );
        const fileId = up.data.attachments[0].id;

        expect((await session().del(`/api/projects/${doomed.id}`)).status).toBe(
            401,
        );
        expect((await bob.del(`/api/projects/${doomed.id}`)).status).toBe(403);

        expect((await boss.del(`/api/projects/${doomed.id}`)).status).toBe(204);
        expect((await boss.get(`/api/projects/${doomed.id}`)).status).toBe(404);
        expect(
            (await boss.get(`/api/tasks/${doomed.tasks[0].id}`)).status,
        ).toBe(404);
        expect((await boss.get(`/api/attachments/${fileId}`)).status).toBe(404);
        const { data: feed } = await boss.get('/api/activity?limit=200');
        expect(feed.some((h) => h.projectId === doomed.id)).toBe(false);
        expect((await boss.del(`/api/projects/${doomed.id}`)).status).toBe(404);
    });

    test('the super user can delete a user, handing over their work', async () => {
        const doraId = (await boss.get('/api/users')).data.find(
            (u) => u.username === 'dora',
        ).id;
        const { data: owned } = await boss.post('/api/projects', {
            type: 'partial_home',
            integratedControls: false,
            financing: false,
            customerFirstName: 'Dora',
            customerLastName: 'Customer',
            address: '9 Pine St',
            ownerId: doraId,
            note: 'Left by Dora',
        });
        const { data: users } = await boss.get('/api/users');
        expect(users.find((u) => u.id === doraId)).toMatchObject({
            ownedProjects: 1,
            ownedTasks: 1,
        });

        expect((await bob.del(`/api/users/${doraId}`)).status).toBe(403);
        expect((await boss.del('/api/users/1')).status).toBe(400);
        const noTarget = await boss.del(`/api/users/${doraId}`);
        expect(noTarget.status).toBe(400);
        expect(noTarget.data.error).toMatch(/Choose who takes them over/);

        const done = await boss.del(`/api/users/${doraId}`, {
            reassignTo: bobId,
        });
        expect(done.status).toBe(200);
        expect(done.data).toEqual({
            deleted: 'Dora',
            reassigned: { projects: 1, tasks: 1 },
        });

        const { data: after } = await boss.get(`/api/projects/${owned.id}`);
        expect(after.owner.name).toBe('Bob');
        expect(after.tasks.every((t) => t.owner.name === 'Bob')).toBe(true);
        expect(after.history[0]).toMatchObject({
            field: 'owner_id',
            oldValue: 'Deleted user',
            newValue: 'Bob',
        });
        expect(
            (await boss.get('/api/users')).data.some((u) => u.id === doraId),
        ).toBe(false);

        // Someone with history and notes of their own.
        const carlId = (await boss.get('/api/users')).data.find(
            (u) => u.username === 'carl',
        ).id;
        const carl = session();
        await carl.login('carl', 'carl-password');
        await carl.post(`/api/projects/${owned.id}/notes`, {
            body: 'Carl was here',
        });
        await carl.patch(`/api/projects/${owned.id}`, {
            address: '10 Pine St',
        });
        expect((await boss.del(`/api/users/${carlId}`)).status).toBe(200);
        const { data: kept } = await boss.get(`/api/projects/${owned.id}`);
        expect(kept.notes[0]).toMatchObject({
            author: 'Deleted user',
            body: 'Carl was here',
        });
        expect(kept.history.find((h) => h.field === 'address').actor).toBe(
            'Deleted user',
        );
        expect((await carl.get('/api/auth/me')).status).toBe(401);
    });

    test("super users can't delete, demote or edit each other", async () => {
        const { data: sue } = await boss.post('/api/users', {
            username: 'sue',
            displayName: 'Sue',
            password: 'sue-password',
            isSuper: true,
        });
        expect(sue.isSuper).toBe(true);

        for (const change of [
            { isSuper: false },
            { active: false },
            { password: 'taken-over-1' },
            { email: 'attacker@example.com' },
            { displayName: 'Not Sue' },
        ]) {
            const res = await boss.patch(`/api/users/${sue.id}`, change);
            expect(res.status).toBe(403);
            expect(res.data.error).toMatch(/Only they can change/);
        }
        const del = await boss.del(`/api/users/${sue.id}`);
        expect(del.status).toBe(403);

        // Sue can step down herself while another super user remains...
        const sueSession = session();
        await sueSession.login('sue', 'sue-password');
        expect((await sueSession.del('/api/users/1')).status).toBe(403);
        const stepDown = await sueSession.patch(`/api/users/${sue.id}`, {
            isSuper: false,
        });
        expect(stepDown.data.isSuper).toBe(false);

        // ...after which she's an ordinary user who can be removed.
        expect((await boss.del(`/api/users/${sue.id}`)).status).toBe(200);

        // The last super user can't step down.
        const last = await boss.patch('/api/users/1', { isSuper: false });
        expect(last.status).toBe(400);
        expect(last.data.error).toMatch(/only admin/);
    });

    function pdfForm() {
        const body = new FormData();
        body.append(
            'files',
            new Blob([Buffer.from('%PDF-1.4\n')], { type: 'application/pdf' }),
            'doc.pdf',
        );
        return body;
    }

    test('each project type gets its own documents', async () => {
        const make = (extra) =>
            bob.post('/api/projects', {
                customerFirstName: 'Doc',
                customerLastName: 'Check',
                address: '1 Form St',
                ownerId: bobId,
                financing: false,
                ...extra,
            });
        const names = (p) => p.tasks.map((t) => [t.name, t.active]);

        const whole = await make({ type: 'whole_home', heatsWithGas: false });
        expect(names(whole.data)).toEqual([
            ['Manual J Calculation', true],
            ['Whole House Rebate Form', true],
            ['Electric Bill', true],
            ['Natural Gas Bill', false],
        ]);
        const partial = await make({
            type: 'partial_home',
            integratedControls: false,
        });
        expect(names(partial.data)).toEqual([['Manual J Calculation', true]]);
        const basic = await make({ type: 'basic_rebate' });
        expect(basic.data.typeLabel).toBe('Basic Rebate');
        expect(names(basic.data)).toEqual([['Electric Bill', true]]);

        // Required answers per type.
        expect((await make({ type: 'whole_home' })).data.error).toMatch(
            /natural gas/,
        );
        expect((await make({ type: 'partial_home' })).data.error).toMatch(
            /integrated controls/,
        );
        expect(
            (
                await bob.post('/api/projects', {
                    type: 'basic_rebate',
                    customerFirstName: 'X',
                    address: 'Y',
                    ownerId: bobId,
                })
            ).data.error,
        ).toMatch(/financing/);

        for (const p of [whole, partial, basic])
            await boss.del(`/api/projects/${p.data.id}`);
    });

    test('financing and controls answers are checked and tidied', async () => {
        const base = {
            type: 'partial_home',
            customerFirstName: 'Fin',
            address: '2 Money St',
            ownerId: bobId,
        };
        const noProvider = await bob.post('/api/projects', {
            ...base,
            financing: true,
            integratedControls: false,
        });
        expect(noProvider.data.error).toMatch(/financing provider/);
        const otherNoName = await bob.post('/api/projects', {
            ...base,
            financing: true,
            financingProvider: 'Other',
            integratedControls: false,
        });
        expect(otherNoName.data.error).toMatch(/provider's name/);
        const badControls = await bob.post('/api/projects', {
            ...base,
            financing: false,
            integratedControls: true,
            controlsType: 'Mitsubishi',
        });
        expect(badControls.data.error).toMatch(/Ecobee, Flair, Other/);

        const { data } = await bob.post('/api/projects', {
            ...base,
            financing: true,
            financingProvider: 'Other',
            financingOther: 'Local Credit Union',
            integratedControls: true,
            controlsType: 'Ecobee',
            controlsOther: 'ignored unless Other',
        });
        expect(data).toMatchObject({
            financing: true,
            financingProvider: 'Other',
            financingOther: 'Local Credit Union',
            integratedControls: true,
            controlsType: 'Ecobee',
            controlsOther: '',
            heatsWithGas: null,
        });

        // Saying "no financing" later clears the provider too, all logged.
        const { data: edited } = await bob.patch(`/api/projects/${data.id}`, {
            financing: false,
        });
        expect(edited).toMatchObject({
            financing: false,
            financingProvider: null,
            financingOther: '',
        });
        expect(edited.history.map((h) => h.field).sort()).toEqual(
            expect.arrayContaining([
                'financing',
                'financing_other',
                'financing_provider',
            ]),
        );
        expect(
            edited.history.find((h) => h.field === 'financing').undoable,
        ).toBe(false);
        await boss.del(`/api/projects/${data.id}`);
    });

    test('the natural gas bill follows the heating answer', async () => {
        const { data: p } = await bob.post('/api/projects', {
            type: 'whole_home',
            customerFirstName: 'Gas',
            address: '3 Furnace Rd',
            ownerId: bobId,
            financing: false,
            heatsWithGas: false,
        });
        const gas = p.tasks.find((t) => t.name === 'Natural Gas Bill');
        expect(gas.active).toBe(false);
        expect(
            (await bob.post(`/api/tasks/${gas.id}/attachments`, pdfForm())).data
                .error,
        ).toMatch(/isn't needed/);
        expect(
            (await bob.get('/api/projects')).data.find((x) => x.id === p.id),
        ).toMatchObject({ taskTotal: 3, taskDone: 0, status: 'todo' });

        // Switching to gas adds it back (logged on the task). Questions this
        // type doesn't ask may come along empty.
        const { data: on } = await bob.patch(`/api/projects/${p.id}`, {
            heatsWithGas: true,
            financing: false,
            integratedControls: null,
            controlsType: null,
        });
        expect(on.tasks.find((t) => t.id === gas.id).active).toBe(true);
        const { data: gasTask } = await bob.get(`/api/tasks/${gas.id}`);
        expect(gasTask.history[0]).toMatchObject({
            field: 'active',
            newValue: 'true',
        });

        // Upload the three others: In Progress, not Done (gas is needed).
        const others = on.tasks.filter((t) => t.id !== gas.id);
        await bob.post(`/api/tasks/${others[0].id}/attachments`, pdfForm());
        let { data: now } = await bob.get(`/api/projects/${p.id}`);
        expect(now.status).toBe('in_progress');
        for (const t of others.slice(1))
            await bob.post(`/api/tasks/${t.id}/attachments`, pdfForm());
        ({ data: now } = await bob.get(`/api/projects/${p.id}`));
        expect(now.state).toBe('todo');

        // Still missing the gas bill, so it can't be submitted yet.
        const early = await bob.post(`/api/projects/${p.id}/submit`);
        expect(early.status).toBe(400);
        expect(early.data.error).toMatch(/1 still missing/);

        // Switching away from gas drops it; switching back brings back the
        // same task.
        ({ data: now } = await bob.patch(`/api/projects/${p.id}`, {
            heatsWithGas: false,
        }));
        expect(now.tasks.find((t) => t.id === gas.id).active).toBe(false);
        const { data: back } = await bob.patch(`/api/projects/${p.id}`, {
            heatsWithGas: true,
        });
        expect(back.tasks.find((t) => t.id === gas.id)).toMatchObject({
            active: true,
        });

        // Without gas, everything needed is in.
        await bob.patch(`/api/projects/${p.id}`, { heatsWithGas: false });
        expect((await bob.post(`/api/projects/${p.id}/submit`)).status).toBe(
            200,
        );

        // Once submitted, nobody can change the answers.
        for (const who of [bob, boss]) {
            const blocked = await who.patch(`/api/projects/${p.id}`, {
                heatsWithGas: true,
            });
            expect(blocked.status).toBe(403);
        }
    });

    test('old projects are moved onto the new document lists', async () => {
        const { MIGRATIONS } = require('../src/migrations');
        const { data: p } = await bob.post('/api/projects', {
            type: 'whole_home',
            customerFirstName: 'Old',
            address: '4 Legacy Ln',
            ownerId: bobId,
            financing: false,
            heatsWithGas: true,
        });
        // Make it look like it was created with the old forms.
        await db.query('DELETE FROM tasks WHERE project_id = $1', [p.id]);
        for (const [letter, name] of [
            ['a', 'Manual J Calculation'],
            ['b', 'Load Calc'],
            ['c', 'Completed Customer Form'],
            ['d', 'Home Blue Print Document'],
        ])
            await db.query(
                `INSERT INTO tasks (project_id, letter, name, form_name, owner_id)
                 VALUES ($1, $2, $3, $3, $4)`,
                [p.id, letter, name, bobId],
            );
        const { rows: old } = await db.query(
            "SELECT id FROM tasks WHERE project_id = $1 AND letter = 'a'",
            [p.id],
        );
        await bob.post(`/api/tasks/${old[0].id}/attachments`, pdfForm());

        await db.transaction((client) => MIGRATIONS.forms_v2(client));

        const { data: after } = await bob.get(`/api/projects/${p.id}`);
        expect(after.tasks.map((t) => [t.code, t.name, t.active])).toEqual([
            [`#${p.id}a`, 'Manual J Calculation', true],
            [`#${p.id}b`, 'Whole House Rebate Form', true],
            [`#${p.id}c`, 'Electric Bill', true],
            [`#${p.id}d`, 'Natural Gas Bill', true],
        ]);
        // The Manual J upload survived.
        expect(after.tasks[0]).toMatchObject({ id: old[0].id, state: 'done' });
        expect(after.status).toBe('in_progress');
        await boss.del(`/api/projects/${p.id}`);
    });

    test('submitted, then rebate received, finishes an application', async () => {
        const { data: p } = await bob.post('/api/projects', {
            type: 'basic_rebate',
            customerFirstName: 'Rebate',
            address: '5 Cash St',
            ownerId: bobId,
            financing: false,
        });
        expect(p.status).toBe('todo');
        expect(
            (
                await bob.post(`/api/projects/${p.id}/rebate`, {
                    number: 'R1',
                    amount: 500,
                    receivedOn: '2026-11-01',
                })
            ).data.error,
        ).toMatch(/submitted first/);

        await bob.post(`/api/tasks/${p.tasks[0].id}/attachments`, pdfForm());
        const { data: submitted } = await bob.post(
            `/api/projects/${p.id}/submit`,
        );
        expect(submitted).toMatchObject({
            state: 'submitted',
            status: 'submitted',
        });
        expect(submitted.submittedAt).toBeTruthy();
        expect((await bob.post(`/api/projects/${p.id}/submit`)).status).toBe(
            409,
        );

        // Checks on the rebate details.
        const bad = (body) => bob.post(`/api/projects/${p.id}/rebate`, body);
        expect(
            (await bad({ amount: 5, receivedOn: '2026-11-01' })).data.error,
        ).toMatch(/rebate number/);
        expect(
            (await bad({ number: 'R1', amount: -5, receivedOn: '2026-11-01' }))
                .data.error,
        ).toMatch(/amount/);
        expect(
            (await bad({ number: 'R1', amount: 5, receivedOn: '2999-01-01' }))
                .data.error,
        ).toMatch(/future/);

        const { data: done } = await bob.post(`/api/projects/${p.id}/rebate`, {
            number: 'MS-12345',
            amount: 1250.5,
            receivedOn: '2026-11-10',
        });
        expect(done).toMatchObject({
            state: 'done',
            status: 'done',
            rebateNumber: 'MS-12345',
            rebateAmount: 1250.5,
            rebateReceivedOn: '2026-11-10',
        });
        expect(done.history[0]).toMatchObject({
            action: 'rebate',
            undoable: false,
        });

        // Done is final for regular users; the super user steps it back.
        expect((await bob.post(`/api/projects/${p.id}/reopen`)).status).toBe(
            403,
        );
        const { data: reopened } = await boss.post(
            `/api/projects/${p.id}/reopen`,
        );
        expect(reopened).toMatchObject({
            state: 'submitted',
            rebateNumber: null,
        });

        // A rebate number already used elsewhere needs a second look.
        const { data: other } = await bob.post('/api/projects', {
            type: 'basic_rebate',
            customerFirstName: 'Other',
            address: '6 Cash St',
            ownerId: bobId,
            financing: false,
        });
        await bob.post(
            `/api/tasks/${other.tasks[0].id}/attachments`,
            pdfForm(),
        );
        await bob.post(`/api/projects/${other.id}/submit`);
        await bob.post(`/api/projects/${other.id}/rebate`, {
            number: 'MS-777',
            amount: 300,
            receivedOn: '2026-11-11',
        });
        const dup = await bob.post(`/api/projects/${p.id}/rebate`, {
            number: 'ms-777',
            amount: 300,
            receivedOn: '2026-11-11',
        });
        expect(dup.status).toBe(409);
        expect(dup.data).toMatchObject({ duplicateProjectId: other.id });
        const forced = await bob.post(`/api/projects/${p.id}/rebate`, {
            number: 'ms-777',
            amount: 300,
            receivedOn: '2026-11-11',
            allowDuplicate: true,
        });
        expect(forced.data.state).toBe('done');

        const { data: stats } = await bob.get('/api/stats');
        expect(stats.projects.done).toBeGreaterThanOrEqual(2);
        for (const id of [p.id, other.id])
            await boss.del(`/api/projects/${id}`);
    });

    test('older "done" projects become Submitted', async () => {
        const { MIGRATIONS } = require('../src/migrations');
        const { data: p } = await bob.post('/api/projects', {
            type: 'basic_rebate',
            customerFirstName: 'Legacy',
            address: '7 Old Rd',
            ownerId: bobId,
            financing: false,
        });
        await db.query(
            "UPDATE projects SET state = 'done', completed_at = now() WHERE id = $1",
            [p.id],
        );
        await db.transaction((client) => MIGRATIONS.statuses_v2(client));
        const { data: after } = await bob.get(`/api/projects/${p.id}`);
        expect(after).toMatchObject({ state: 'submitted', completedAt: null });
        expect(after.submittedAt).toBeTruthy();
        await boss.del(`/api/projects/${p.id}`);
    });

    test('inactive applications are read-only', async () => {
        const { data: p } = await bob.post('/api/projects', {
            type: 'basic_rebate',
            customerFirstName: 'Frozen',
            address: '8 Ice St',
            ownerId: bobId,
            financing: false,
        });
        await bob.patch(`/api/projects/${p.id}`, { active: false });
        const attempts = [
            bob.patch(`/api/projects/${p.id}`, { address: 'Elsewhere' }),
            bob.post(`/api/projects/${p.id}/notes`, { body: 'hello' }),
            bob.patch(`/api/tasks/${p.tasks[0].id}`, { notes: 'x' }),
            bob.post(`/api/tasks/${p.tasks[0].id}/attachments`, pdfForm()),
            bob.post(`/api/projects/${p.id}/submit`),
            boss.patch(`/api/projects/${p.id}`, { address: 'Elsewhere' }),
        ];
        for (const res of await Promise.all(attempts)) {
            expect(res.status).toBe(403);
            expect(res.data.error).toMatch(/inactive/);
        }
        // Reactivating (super user) makes it editable again.
        await boss.patch(`/api/projects/${p.id}`, { active: true });
        expect(
            (await bob.patch(`/api/projects/${p.id}`, { address: 'Elsewhere' }))
                .status,
        ).toBe(200);
        await boss.del(`/api/projects/${p.id}`);
    });

    test('reassigning says whether the new owner gets an email', async () => {
        const { data: created } = await bob.post('/api/projects', {
            type: 'basic_rebate',
            financing: false,
            customerFirstName: 'Notice',
            customerLastName: 'Test',
            address: '1 Notice St',
            ownerId: bobId,
        });
        const task = created.tasks[0];
        const toSelf = await bob.patch(`/api/tasks/${task.id}`, {
            ownerId: aliceId,
        });
        expect(toSelf.data.assignmentEmail.name).toBe('Alice');
        const back = await bob.patch(`/api/tasks/${task.id}`, {
            ownerId: bobId,
        });
        expect(back.data.assignmentEmail).toEqual({
            name: 'Bob',
            reason: 'you assigned it to yourself',
        });
        const notes = await bob.patch(`/api/tasks/${task.id}`, {
            notes: 'no reassignment',
        });
        expect(notes.data.assignmentEmail).toBeUndefined();
        await boss.del(`/api/projects/${created.id}`);
    });

    test('anyone can report a problem; only the super user sees them', async () => {
        const empty = await bob.post('/api/reports', { description: '  ' });
        expect(empty.status).toBe(400);
        const { status, data } = await bob.post('/api/reports', {
            description: 'The upload button did nothing',
            page: '/projects/1',
        });
        expect(status).toBe(201);
        expect(data).toMatchObject({ reportedBy: 'Bob', page: '/projects/1' });
        expect((await bob.get('/api/reports')).status).toBe(403);
        const list = await boss.get('/api/reports');
        expect(list.data[0].description).toBe('The upload button did nothing');
        const resolved = await boss.patch(`/api/reports/${data.id}`, {
            resolved: true,
        });
        expect(resolved.data.resolvedAt).toBeTruthy();
        expect(
            (await bob.patch(`/api/reports/${data.id}`, { resolved: false }))
                .status,
        ).toBe(403);

        // With a screenshot: only real images, viewable by the admin only.
        const png = Buffer.from(
            'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
            'base64',
        );
        const form = new FormData();
        form.append('description', 'With a picture');
        form.append('screenshot', new Blob([png]), 'shot.png');
        const withShot = await bob.post('/api/reports', form);
        expect(withShot.status).toBe(201);
        expect(withShot.data.hasScreenshot).toBe(true);
        const image = await boss.get(
            `/api/reports/${withShot.data.id}/screenshot`,
        );
        expect(image.status).toBe(200);
        expect(
            (await bob.get(`/api/reports/${withShot.data.id}/screenshot`))
                .status,
        ).toBe(403);
        const fake = new FormData();
        fake.append('description', 'Fake picture');
        fake.append('screenshot', new Blob(['not an image']), 'shot.png');
        expect((await bob.post('/api/reports', fake)).status).toBe(400);
        const pdf = new FormData();
        pdf.append('description', 'Wrong type');
        pdf.append('screenshot', new Blob(['%PDF-1.4']), 'shot.pdf');
        expect((await bob.post('/api/reports', pdf)).status).toBe(400);
    });

    test('submitted applications are locked; only an admin can delete them', async () => {
        const { data: created } = await bob.post('/api/projects', {
            type: 'basic_rebate',
            financing: false,
            customerFirstName: 'Locked',
            customerLastName: 'App',
            address: '1 Lock St',
            ownerId: bobId,
        });
        const task = created.tasks[0];
        const form = new FormData();
        form.append(
            'files',
            new Blob([Buffer.from('%PDF-1.4\n')], { type: 'application/pdf' }),
            'bill.pdf',
        );
        await bob.post(`/api/tasks/${task.id}/attachments`, form);
        // Reassigning before submitting is recorded and undoable.
        await bob.patch(`/api/tasks/${task.id}`, { ownerId: aliceId });
        await bob.patch(`/api/tasks/${task.id}`, { ownerId: bobId });
        expect(
            (await bob.post(`/api/projects/${created.id}/submit`)).status,
        ).toBe(200);

        const id = created.id;
        for (const who of [bob, boss]) {
            const tries = [
                who.patch(`/api/projects/${id}`, { address: 'New St' }),
                who.patch(`/api/projects/${id}`, { customerFirstName: 'X' }),
                who.patch(`/api/projects/${id}`, { dueDate: '2030-01-01' }),
                who.patch(`/api/tasks/${task.id}`, { ownerId: aliceId }),
                who.patch(`/api/tasks/${task.id}`, { notes: 'changed' }),
                who.patch(`/api/projects/${id}`, { active: false }),
            ];
            for (const r of await Promise.all(tries))
                expect(r.status).toBe(403);
        }
        // Only an admin can delete it, as a special privilege.
        expect((await bob.del(`/api/projects/${id}`)).status).toBe(403);

        // Nothing on it shows as undoable, and undoing is refused.
        const { data: detail } = await boss.get(`/api/projects/${id}`);
        expect(detail.history.some((h) => h.undoable)).toBe(false);
        const owner = detail.history.find((h) => h.field === 'owner_id');
        expect((await boss.post(`/api/activity/${owner.id}/undo`)).status).toBe(
            403,
        );

        // Notes and the rebate still work.
        expect(
            (await bob.post(`/api/projects/${id}/notes`, { body: 'Sent' }))
                .status,
        ).toBe(201);
        const done = await bob.post(`/api/projects/${id}/rebate`, {
            number: 'LOCK-1',
            amount: 100,
            receivedOn: '2026-11-18',
        });
        expect(done.data.status).toBe('done');
        expect(
            (await bob.patch(`/api/projects/${id}`, { address: 'Again' }))
                .status,
        ).toBe(403);
        expect((await boss.del(`/api/projects/${id}`)).status).toBe(204);
        expect((await boss.get(`/api/projects/${id}`)).status).toBe(404);
    });

    test('deactivated users are signed out', async () => {
        await boss.patch(`/api/users/${aliceId}`, { active: false });
        expect((await alice.get('/api/auth/me')).status).toBe(401);
        expect((await alice.login('alice', 'alice-password')).status).toBe(401);
        const self = await boss.patch(`/api/users/1`, { active: false });
        expect(self.status).toBe(400);
    });

    test('blocks cross-site requests', async () => {
        const { status } = await bob.post(
            `/api/projects/${project.id}/notes`,
            { body: 'x' },
            { origin: 'https://evil.example' },
        );
        expect(status).toBe(403);
    });
});
