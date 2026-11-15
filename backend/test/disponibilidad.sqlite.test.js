// Fase 2, T3: weekly availability of instructors.
const test = require('node:test');
const assert = require('node:assert/strict');
const { withApi } = require('./apiHarness');

const USERS = [
    ['Admin', 'admin@x.cl', ['Administrador']],
    ['Ana', 'ana@x.cl', ['Alumno']],
    ['Ines', 'ines@x.cl', ['Instructor']],
    ['Otra', 'otra@x.cl', ['Instructor']],
];
const URL = '/api/intranet/disponibilidad';
const block = (dia_semana, hora_inicio, hora_fin) => ({ dia_semana, hora_inicio, hora_fin });

test('an instructor saves their weekly availability and reads it back ordered', async () => {
    await withApi(USERS, async ({ call, login }) => {
        const ines = await login('ines@x.cl');
        const saved = await call('PUT', URL, ines, { bloques: [block(3, '18:00', '20:00'), block(1, '09:00', '12:00'), block(1, '15:00', '17:00')] });
        assert.equal(saved.status, 200);
        assert.equal(saved.body.guardados, 3);

        const mine = (await call('GET', URL, ines)).body;
        assert.deepEqual(mine.map((b) => [b.dia_semana, b.hora_inicio, b.hora_fin]), [[1, '09:00', '12:00'], [1, '15:00', '17:00'], [3, '18:00', '20:00']]);
    });
});

test('saving replaces the previous availability and an empty list clears it', async () => {
    await withApi(USERS, async ({ call, login }) => {
        const ines = await login('ines@x.cl');
        await call('PUT', URL, ines, { bloques: [block(1, '09:00', '12:00')] });
        await call('PUT', URL, ines, { bloques: [block(2, '10:00', '11:00')] });
        assert.deepEqual((await call('GET', URL, ines)).body.map((b) => b.dia_semana), [2]);
        await call('PUT', URL, ines, { bloques: [] });
        assert.deepEqual((await call('GET', URL, ines)).body, []);
    });
});

test('invalid blocks are rejected and leave the saved availability untouched', async () => {
    await withApi(USERS, async ({ call, login }) => {
        const ines = await login('ines@x.cl');
        await call('PUT', URL, ines, { bloques: [block(1, '09:00', '12:00')] });
        const bad = [
            [{ bloques: 'x' }, 'bloques'],
            [{ bloques: [block(8, '09:00', '12:00')] }, 'dia_semana'],
            [{ bloques: [block(1, '9am', '12:00')] }, 'hora_inicio'],
            [{ bloques: [block(1, '09:00', '08:00')] }, 'hora_fin'],
            [{ bloques: [block(1, '09:00', '12:00'), block(1, '11:00', '13:00')] }, 'se superponen'],
            [{ bloques: [block(1, '09:00', '12:00'), block(2, '09:00', '12:00'), block(1, '12:00', '13:00'), block(1, '09:30', '10:00')] }, 'se superponen'],
        ];
        for (const [body, text] of bad) {
            const res = await call('PUT', URL, ines, body);
            assert.equal(res.status, 400, text);
            assert.match(res.body.error, new RegExp(text), text);
        }
        assert.deepEqual((await call('GET', URL, ines)).body.map((b) => b.dia_semana), [1], 'nothing changed');
        // Touching blocks (one ends at 12:00, the next starts at 12:00) do not overlap.
        assert.equal((await call('PUT', URL, ines, { bloques: [block(1, '09:00', '12:00'), block(1, '12:00', '13:00')] })).status, 200);
    });
});

test('each instructor only sees and edits their own availability; admins can pick one', async () => {
    await withApi(USERS, async ({ call, login, idOf }) => {
        const admin = await login('admin@x.cl');
        const ines = await login('ines@x.cl');
        const otra = await login('otra@x.cl');
        await call('PUT', URL, ines, { bloques: [block(1, '09:00', '12:00')] });
        await call('PUT', URL, otra, { bloques: [block(5, '16:00', '18:00')] });

        assert.deepEqual((await call('GET', URL, ines)).body.map((b) => b.dia_semana), [1]);
        assert.deepEqual((await call('GET', URL, otra)).body.map((b) => b.dia_semana), [5]);

        const inesId = await idOf('ines@x.cl');
        const asAdmin = (await call('GET', `${URL}?instructor_id=${inesId}`, admin)).body;
        assert.deepEqual(asAdmin.map((b) => [b.instructor_id, b.dia_semana]), [[inesId, 1]]);
        const everyone = (await call('GET', URL, admin)).body;
        assert.deepEqual(everyone.map((b) => b.instructor).sort(), ['Ines', 'Otra']);

        // An instructor cannot ask for somebody else's.
        assert.deepEqual((await call('GET', `${URL}?instructor_id=${inesId}`, otra)).body.map((b) => b.dia_semana), [5]);
        // An admin edits on behalf of an instructor.
        assert.equal((await call('PUT', URL, admin, { instructor_id: inesId, bloques: [block(4, '10:00', '11:00')] })).status, 200);
        assert.deepEqual((await call('GET', URL, ines)).body.map((b) => b.dia_semana), [4]);
        assert.equal((await call('PUT', URL, admin, { instructor_id: 999, bloques: [] })).status, 404);
        assert.equal((await call('PUT', URL, admin, { bloques: [] })).status, 400, 'an admin must say whose availability');
    });
});

test('students cannot read or write availability, and it needs a login', async () => {
    await withApi(USERS, async ({ call, login }) => {
        const ana = await login('ana@x.cl');
        assert.equal((await call('GET', URL, ana)).status, 403);
        assert.equal((await call('PUT', URL, ana, { bloques: [] })).status, 403);
        assert.equal((await call('GET', URL, null)).status, 403);
    });
});

test('deleting an instructor removes their availability', async () => {
    await withApi(USERS, async ({ call, login, knex, idOf }) => {
        const ines = await login('ines@x.cl');
        await call('PUT', URL, ines, { bloques: [block(1, '09:00', '12:00')] });
        await knex('usuarios').where({ id: await idOf('ines@x.cl') }).del();
        assert.equal((await knex('disponibilidad_instructor')).length, 0);
    });
});
