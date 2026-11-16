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
            customerName: 'Jane Smith',
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

    test('validates new projects', async () => {
        const { status, data } = await alice.post('/api/projects', {
            type: 'whole_home',
            customerName: '',
            address: 'x',
            ownerId: bobId,
        });
        expect(status).toBe(400);
        expect(data.error).toMatch(/Customer name/);
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

    test('Done is final for regular users', async () => {
        const done = await alice.patch(`/api/tasks/${taskA.id}`, {
            state: 'done',
        });
        expect(done.data.state).toBe('done');
        expect(done.data.completedAt).toBeTruthy();

        const reopen = await alice.patch(`/api/tasks/${taskA.id}`, {
            state: 'todo',
        });
        expect(reopen.status).toBe(403);
    });

    test('only the super user can undo', async () => {
        const { data: task } = await alice.get(`/api/tasks/${taskA.id}`);
        const doneEntry = task.history.find((h) => h.field === 'state');

        expect(
            (await alice.post(`/api/activity/${doneEntry.id}/undo`)).status,
        ).toBe(403);

        const undo = await boss.post(`/api/activity/${doneEntry.id}/undo`);
        expect(undo.status).toBe(200);

        const { data: after } = await alice.get(`/api/tasks/${taskA.id}`);
        expect(after.state).toBe('todo');
        expect(after.completedAt).toBeNull();
        expect(after.history[0]).toMatchObject({
            action: 'undo',
            actor: 'The Boss',
            newValue: 'todo',
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

    test('marking a project done is final for regular users', async () => {
        await bob.patch(`/api/projects/${project.id}`, { state: 'done' });
        const reopen = await bob.patch(`/api/projects/${project.id}`, {
            state: 'todo',
        });
        expect(reopen.status).toBe(403);
        const superReopen = await boss.patch(`/api/projects/${project.id}`, {
            state: 'todo',
        });
        expect(superReopen.data.state).toBe('todo');
    });

    test('dashboard stats', async () => {
        await bob.patch(`/api/tasks/${project.tasks[1].id}`, { state: 'done' });
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

    test('inactive projects stay listed and only the super user reactivates', async () => {
        const second = await bob.post('/api/projects', {
            type: 'partial_home',
            customerName: 'Old Lead',
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

        const back = await bob.patch(`/api/projects/${second.data.id}`, {
            active: true,
        });
        expect(back.status).toBe(403);
        expect(
            (
                await bob.patch(`/api/projects/${second.data.id}`, {
                    active: 'no',
                })
            ).status,
        ).toBe(400);

        const superBack = await boss.patch(`/api/projects/${second.data.id}`, {
            active: true,
        });
        expect(superBack.data.active).toBe(true);
    });

    test('uploading every form completes the project; done forms are locked', async () => {
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

        const { data: after } = await bob.get(`/api/projects/${project.id}`);
        expect(after.state).toBe('done');
        expect(after.tasks.every((t) => t.state === 'done')).toBe(true);
        expect(after.history[0]).toMatchObject({
            taskId: null,
            field: 'state',
            newValue: 'done',
            actor: 'Bob',
        });

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
            customerName: 'Typo Customer',
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
            customerName: 'Dora Customer',
            address: '9 Pine St',
            ownerId: doraId,
            note: 'Left by Dora',
        });
        const { data: users } = await boss.get('/api/users');
        expect(users.find((u) => u.id === doraId)).toMatchObject({
            ownedProjects: 1,
            ownedTasks: 3,
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
            reassigned: { projects: 1, tasks: 3 },
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
        expect(last.data.error).toMatch(/only super user/);
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
