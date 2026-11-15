// Fase 2, T5: family accounts. A guardian (apoderado) manages the students in
// their care: sees their agenda and attendance, books for them and gives the
// consents that a minor cannot give.
const test = require('node:test');
const assert = require('node:assert/strict');
const { withApi } = require('./apiHarness');

const USERS = [
    ['Admin', 'admin@x.cl', ['Administrador']],
    ['Marta', 'marta@x.cl', ['Alumno']],
    ['Luis', 'luis@x.cl', ['Alumno']],
    ['Rosa', 'rosa@x.cl', ['Alumno']],
    ['Pepe', 'pepe@x.cl', ['Alumno']],
    ['Ines', 'ines@x.cl', ['Instructor']],
];
const BASE = '/api/intranet';

const DAY_MS = 24 * 60 * 60 * 1000;
const isoDate = (offsetDays) => new Date(Date.now() + offsetDays * DAY_MS).toISOString().slice(0, 10);
const weekdayOf = (iso) => new Date(`${iso}T00:00:00Z`).getUTCDay() || 7;

async function sesionOn({ call, admin }, fecha) {
    const sede = (await call('GET', `${BASE}/sedes`, admin)).body[0];
    const disciplina = (await call('GET', `${BASE}/disciplinas`, admin)).body[0];
    const clase = (await call('POST', `${BASE}/clases`, admin, {
        sede_id: sede.id, disciplina_id: disciplina.id, dia_semana: weekdayOf(fecha), hora_inicio: '19:00', hora_fin: '20:30',
    })).body;
    await call('POST', `${BASE}/clases/${clase.id}/sesiones`, admin, { desde: fecha, hasta: fecha });
    return (await call('GET', `${BASE}/sesiones?desde=${fecha}&hasta=${fecha}`, admin)).body[0];
}

// Marta (guardian) with Luis in her care; Rosa and Pepe are unrelated.
async function withFamily(fn) {
    await withApi(USERS, async (ctx) => {
        const { call, login, idOf } = ctx;
        const admin = await login('admin@x.cl');
        const familia = (await call('POST', `${BASE}/familias`, admin, { nombre: 'Familia Soto' })).body;
        await call('POST', `${BASE}/familias/${familia.id}/miembros`, admin, { usuario_id: await idOf('marta@x.cl'), rol_en_familia: 'apoderado' });
        await call('POST', `${BASE}/familias/${familia.id}/miembros`, admin, { usuario_id: await idOf('luis@x.cl'), rol_en_familia: 'alumno' });
        await fn({ ...ctx, admin, familia });
    });
}

test('an admin creates a family, adds its members and the guardian receives the Apoderado role', async () => {
    await withFamily(async ({ call, login, admin, familia, knex, idOf }) => {
        const list = (await call('GET', `${BASE}/familias`, admin)).body;
        assert.equal(list.length, 1);
        assert.equal(list[0].nombre, 'Familia Soto');
        assert.deepEqual(list[0].miembros.map((m) => [m.nombre, m.rol_en_familia]), [['Marta', 'apoderado'], ['Luis', 'alumno']]);

        const roles = await knex('usuario_roles').join('roles', 'roles.id', 'usuario_roles.rol_id').where({ usuario_id: await idOf('marta@x.cl') }).pluck('nombre');
        assert.deepEqual(roles.sort(), ['Alumno', 'Apoderado']);
        const token = await login('marta@x.cl');
        const me = await call('GET', `${BASE}/familia/mia`, token);
        assert.equal(me.status, 200);
        assert.equal(familia.id, list[0].id);
    });
});

test('family management validates its input and is limited to administration', async () => {
    await withFamily(async ({ call, login, admin, familia, idOf }) => {
        const url = `${BASE}/familias`;
        assert.equal((await call('POST', url, admin, { nombre: ' ' })).status, 400);
        const members = `${url}/${familia.id}/miembros`;
        assert.equal((await call('POST', members, admin, { usuario_id: 999, rol_en_familia: 'alumno' })).status, 404);
        assert.equal((await call('POST', members, admin, { usuario_id: await idOf('pepe@x.cl'), rol_en_familia: 'tio' })).status, 400);
        assert.equal((await call('POST', `${url}/999/miembros`, admin, { usuario_id: await idOf('pepe@x.cl'), rol_en_familia: 'alumno' })).status, 404);
        assert.equal((await call('POST', members, admin, { usuario_id: await idOf('luis@x.cl'), rol_en_familia: 'alumno' })).status, 409, 'already a member');

        const marta = await login('marta@x.cl');
        for (const [method, path, body] of [
            ['GET', url, undefined],
            ['POST', url, { nombre: 'X' }],
            ['POST', members, { usuario_id: 1, rol_en_familia: 'alumno' }],
            ['DELETE', `${members}/1`, undefined],
            ['DELETE', `${url}/${familia.id}`, undefined],
        ]) {
            assert.equal((await call(method, path, marta, body)).status, 403, `${method} ${path}`);
        }
    });
});

test('removing a member and deleting a family', async () => {
    await withFamily(async ({ call, admin, familia, knex, idOf }) => {
        const members = `${BASE}/familias/${familia.id}/miembros`;
        assert.equal((await call('DELETE', `${members}/${await idOf('luis@x.cl')}`, admin)).status, 200);
        assert.equal((await call('DELETE', `${members}/${await idOf('luis@x.cl')}`, admin)).status, 404);
        assert.equal((await knex('familia_miembros')).length, 1);
        assert.equal((await call('DELETE', `${BASE}/familias/${familia.id}`, admin)).status, 200);
        assert.equal((await knex('familia_miembros')).length, 0);
        assert.equal((await call('DELETE', `${BASE}/familias/${familia.id}`, admin)).status, 404);
    });
});

test('a guardian sees the upcoming bookings and attendance of the students in their care, and nobody else does', async () => {
    await withFamily(async ({ call, login, admin, idOf }) => {
        const marta = await login('marta@x.cl');
        const luis = await login('luis@x.cl');
        const sesion = await sesionOn({ call, admin }, isoDate(3));
        const past = await sesionOn({ call, admin }, isoDate(1));
        await call('POST', `${BASE}/sesiones/${sesion.id}/reservar`, luis);
        await call('POST', `${BASE}/sesiones/${past.id}/reservar`, luis);
        await call('PUT', `${BASE}/sesiones/${past.id}/asistencia`, admin, { asistencias: [{ alumno_id: await idOf('luis@x.cl'), presente: true }] });

        const { status, body } = await call('GET', `${BASE}/familia/mia`, marta);
        assert.equal(status, 200);
        assert.equal(body.length, 1);
        const [child] = body[0].representados;
        assert.equal(child.nombre, 'Luis');
        assert.deepEqual(child.proximas_reservas.map((r) => r.fecha), [isoDate(1), isoDate(3)]);
        assert.deepEqual(child.asistencia, { clases: 1, asistidas: 1 });

        assert.deepEqual((await call('GET', `${BASE}/familia/mia`, luis)).body, [], 'a student in a family does not see the family');
        assert.deepEqual((await call('GET', `${BASE}/familia/mia`, await login('rosa@x.cl'))).body, []);
    });
});

test('a guardian books and cancels for a student in their care, but not for a stranger', async () => {
    await withFamily(async ({ call, login, admin, idOf, knex }) => {
        const marta = await login('marta@x.cl');
        const sesion = await sesionOn({ call, admin }, isoDate(3));
        const url = `${BASE}/sesiones/${sesion.id}/reservar`;
        const luisId = await idOf('luis@x.cl');

        assert.equal((await call('POST', url, marta, { alumno_id: luisId })).status, 201);
        const [reserva] = await knex('reservas');
        assert.equal(reserva.alumno_id, luisId, 'the booking belongs to the student');

        assert.equal((await call('POST', url, marta, { alumno_id: await idOf('pepe@x.cl') })).status, 403);
        assert.equal((await call('DELETE', url, marta, { alumno_id: await idOf('pepe@x.cl') })).status, 403);
        assert.equal((await call('POST', url, await login('rosa@x.cl'), { alumno_id: luisId })).status, 403, 'a student cannot book for another');

        assert.equal((await call('DELETE', url, marta, { alumno_id: luisId })).status, 200);
        assert.equal((await knex('reservas').first()).estado, 'cancelada');
        // Booking for herself still works as before.
        assert.equal((await call('POST', url, marta)).status, 201);
    });
});

test('a guardian gives a consent for a student, recorded as given by the guardian', async () => {
    await withFamily(async ({ call, login, idOf, knex }) => {
        const marta = await login('marta@x.cl');
        const luisId = await idOf('luis@x.cl');
        const marta_id = await idOf('marta@x.cl');
        const created = await call('POST', `${BASE}/consentimientos`, marta, { usuario_id: luisId, tipo: 'uso_imagen', version_texto: 'v1', aceptado: true });
        assert.equal(created.status, 201);
        const [row] = await knex('consentimientos');
        assert.deepEqual({ usuario_id: row.usuario_id, otorgado_por_id: row.otorgado_por_id, tipo: row.tipo }, { usuario_id: luisId, otorgado_por_id: marta_id, tipo: 'uso_imagen' });

        // A person gives their own consent without a guardian.
        const own = await call('POST', `${BASE}/consentimientos`, marta, { tipo: 'comunicaciones', version_texto: 'v1', aceptado: false });
        assert.equal(own.status, 201);
        const ownRow = await knex('consentimientos').where({ tipo: 'comunicaciones' }).first();
        assert.equal(ownRow.otorgado_por_id, null);
        assert.equal(Boolean(ownRow.aceptado), false, 'a refusal is recorded too');
    });
});

test('consents are validated and only the person or their guardian can give and read them', async () => {
    await withFamily(async ({ call, login, idOf }) => {
        const marta = await login('marta@x.cl');
        const rosa = await login('rosa@x.cl');
        const luisId = await idOf('luis@x.cl');
        const valid = { usuario_id: luisId, tipo: 'datos_salud', version_texto: 'v1', aceptado: true };
        assert.equal((await call('POST', `${BASE}/consentimientos`, marta, { ...valid, tipo: 'otro' })).status, 400);
        assert.equal((await call('POST', `${BASE}/consentimientos`, marta, { ...valid, version_texto: '' })).status, 400);
        assert.equal((await call('POST', `${BASE}/consentimientos`, marta, { ...valid, aceptado: 'si' })).status, 400);
        assert.equal((await call('POST', `${BASE}/consentimientos`, rosa, valid)).status, 403, 'a stranger cannot consent for Luis');

        await call('POST', `${BASE}/consentimientos`, marta, valid);
        const read = await call('GET', `${BASE}/consentimientos?usuario_id=${luisId}`, marta);
        assert.deepEqual(read.body.map((c) => [c.tipo, c.aceptado, c.otorgado_por]), [['datos_salud', true, 'Marta']]);
        assert.equal((await call('GET', `${BASE}/consentimientos?usuario_id=${luisId}`, rosa)).status, 403);
        assert.deepEqual((await call('GET', `${BASE}/consentimientos`, rosa)).body, [], 'a person reads their own');
    });
});

test('a consent can be revoked by the person or their guardian, and the record is kept', async () => {
    await withFamily(async ({ call, login, idOf, knex }) => {
        const marta = await login('marta@x.cl');
        const rosa = await login('rosa@x.cl');
        const luisId = await idOf('luis@x.cl');
        const { body: { id } } = await call('POST', `${BASE}/consentimientos`, marta, { usuario_id: luisId, tipo: 'uso_imagen', version_texto: 'v1', aceptado: true });
        assert.equal((await call('PUT', `${BASE}/consentimientos/${id}/revocar`, rosa)).status, 403);
        assert.equal((await call('PUT', `${BASE}/consentimientos/999/revocar`, marta)).status, 404);
        assert.equal((await call('PUT', `${BASE}/consentimientos/${id}/revocar`, marta)).status, 200);
        const row = await knex('consentimientos').where({ id }).first();
        assert.ok(row.revocado_en, 'the revocation date is stored');
        assert.equal(Boolean(row.aceptado), true, 'the original acceptance is kept');
        const read = await call('GET', `${BASE}/consentimientos?usuario_id=${luisId}`, marta);
        assert.equal(read.body[0].revocado, true);
    });
});
