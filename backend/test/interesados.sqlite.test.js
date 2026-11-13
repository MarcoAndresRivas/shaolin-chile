// Fase 2, T4: people interested in the school. A public form records them (with
// consent); administration follows them up until they enrol.
const test = require('node:test');
const assert = require('node:assert/strict');
const { withApi } = require('./apiHarness');

const USERS = [
    ['Admin', 'admin@x.cl', ['Administrador']],
    ['Ana', 'ana@x.cl', ['Alumno']],
];
const PUBLIC = '/api/interesados';
const ADMIN = '/api/intranet/interesados';

const DAY_MS = 24 * 60 * 60 * 1000;
const isoDate = (offsetDays) => new Date(Date.now() + offsetDays * DAY_MS).toISOString().slice(0, 10);
const weekdayOf = (iso) => new Date(`${iso}T00:00:00Z`).getUTCDay() || 7;

const lead = (overrides = {}) => ({ nombre: 'Juan Pérez', email: 'juan@example.com', consentimiento: true, ...overrides });

test('the catalog of sedes and disciplines is public and lists only active ones', async () => {
    await withApi(USERS, async ({ call, knex }) => {
        await knex('sedes').where({ ciudad: 'Talca' }).update({ activa: false });
        const { status, body } = await call('GET', '/api/catalogo', null);
        assert.equal(status, 200);
        assert.deepEqual(body.sedes.map((s) => s.ciudad), ['Concepción', 'Santiago']);
        assert.deepEqual(body.disciplinas.map((d) => d.nombre), ['Kung Fu Tradicional', 'Sanda (Boxeo Chino)', 'Tai Chi y Qi Gong']);
        assert.ok(body.sedes.every((s) => !('direccion' in s)), 'the public catalog does not expose addresses');
    });
});

test('anyone can register as interested, with consent, and the person is stored as new', async () => {
    await withApi(USERS, async ({ call, knex }) => {
        const catalog = (await call('GET', '/api/catalogo', null)).body;
        const created = await call('POST', PUBLIC, null, lead({
            telefono: '+56 9 8615 7545', sede_id: catalog.sedes[0].id, disciplina_id: catalog.disciplinas[1].id, mensaje: 'Tengo 30 años.',
        }));
        assert.equal(created.status, 201);
        assert.ok(created.body.id);

        const [row] = await knex('interesados');
        assert.deepEqual(
            { nombre: row.nombre, email: row.email, estado: row.estado, origen: row.origen, consentimiento: Boolean(row.consentimiento) },
            { nombre: 'Juan Pérez', email: 'juan@example.com', estado: 'nuevo', origen: 'sitio', consentimiento: true },
        );
        assert.ok(row.consentimiento_fecha, 'the moment of consent is recorded');
        assert.equal(row.sede_id, catalog.sedes[0].id);
        assert.equal(row.mensaje, 'Tengo 30 años.');
    });
});

test('the form is rejected without consent or with invalid data, and nothing is stored', async () => {
    await withApi(USERS, async ({ call, knex }) => {
        const cases = [
            [lead({ consentimiento: false }), 'consentimiento'],
            [lead({ consentimiento: undefined }), 'consentimiento'],
            [lead({ nombre: ' ' }), 'nombre'],
            [lead({ nombre: 'x'.repeat(101) }), 'nombre'],
            [lead({ email: 'juan@' }), 'email'],
            [lead({ telefono: 'abc' }), 'telefono'],
            [lead({ sede_id: 999 }), 'sede_id'],
            [lead({ disciplina_id: 999 }), 'disciplina_id'],
            [lead({ mensaje: 'x'.repeat(1001) }), 'mensaje'],
            [lead({ origen: 'televisión' }), 'origen'],
        ];
        // Each case comes from its own visitor, so the per-IP limit does not interfere.
        let visitor = 0;
        for (const [body, field] of cases) {
            visitor += 1;
            const res = await call('POST', PUBLIC, null, body, { 'X-Forwarded-For': `203.0.113.${visitor}` });
            assert.equal(res.status, 400, field);
            assert.match(res.body.error, new RegExp(field), field);
        }
        assert.equal((await knex('interesados')).length, 0);
    });
});

test('a filled honeypot looks like a success but stores nothing', async () => {
    await withApi(USERS, async ({ call, knex }) => {
        const res = await call('POST', PUBLIC, null, lead({ website: 'http://spam.example' }));
        assert.equal(res.status, 201);
        assert.equal((await knex('interesados')).length, 0);
    });
});

test('registering twice with the same email does not duplicate the person and leaves a note', async () => {
    await withApi(USERS, async ({ call, knex }) => {
        const first = await call('POST', PUBLIC, null, lead());
        const again = await call('POST', PUBLIC, null, lead({ email: ' JUAN@Example.com ', mensaje: 'Sigo interesado' }));
        assert.equal(again.status, 200);
        assert.equal(again.body.id, first.body.id);
        assert.equal(again.body.repetido, true);
        assert.equal((await knex('interesados')).length, 1);
        const notes = await knex('seguimientos');
        assert.equal(notes.length, 1);
        assert.match(notes[0].nota, /Sigo interesado/);
    });
});

test('an email that was discarded or already enrolled can register again as a new person', async () => {
    await withApi(USERS, async ({ call, knex }) => {
        const first = await call('POST', PUBLIC, null, lead());
        await knex('interesados').where({ id: first.body.id }).update({ estado: 'descartado' });
        const again = await call('POST', PUBLIC, null, lead());
        assert.equal(again.status, 201);
        assert.notEqual(again.body.id, first.body.id);
    });
});

test('the form is limited per IP and the limit does not mix different visitors', async () => {
    await withApi(USERS, async ({ call }) => {
        const as = (ip) => ({ 'X-Forwarded-For': ip });
        for (let i = 0; i < 5; i += 1) {
            const res = await call('POST', PUBLIC, null, lead({ email: `p${i}@example.com` }), as('203.0.113.7'));
            assert.equal(res.status, 201, `request ${i + 1}`);
        }
        const blocked = await call('POST', PUBLIC, null, lead({ email: 'p5@example.com' }), as('203.0.113.7'));
        assert.equal(blocked.status, 429);
        const other = await call('POST', PUBLIC, null, lead({ email: 'otro@example.com' }), as('198.51.100.9'));
        assert.equal(other.status, 201, 'another visitor is not affected');
    });
});

test('only administration can list, open and manage interested people', async () => {
    await withApi(USERS, async ({ call, login }) => {
        const created = await call('POST', PUBLIC, null, lead());
        const ana = await login('ana@x.cl');
        assert.equal((await call('GET', ADMIN, null)).status, 403, 'no login');
        for (const [method, url, body] of [
            ['GET', ADMIN, undefined],
            ['GET', `${ADMIN}/${created.body.id}`, undefined],
            ['PUT', `${ADMIN}/${created.body.id}`, { estado: 'contactado' }],
            ['POST', `${ADMIN}/${created.body.id}/seguimientos`, { nota: 'x' }],
            ['POST', `${ADMIN}/${created.body.id}/clase-prueba`, { sesion_id: 1 }],
            ['PUT', '/api/intranet/clases-prueba/1', { estado: 'asistio' }],
        ]) {
            assert.equal((await call(method, url, ana, body)).status, 403, `${method} ${url}`);
        }
    });
});

test('administration lists people newest first, with names of sede and discipline, filtered by estado', async () => {
    await withApi(USERS, async ({ call, login, knex }) => {
        const admin = await login('admin@x.cl');
        const catalog = (await call('GET', '/api/catalogo', null)).body;
        await call('POST', PUBLIC, null, lead({ nombre: 'Primero', email: 'a@example.com', sede_id: catalog.sedes[2].id, disciplina_id: catalog.disciplinas[0].id }));
        const second = await call('POST', PUBLIC, null, lead({ nombre: 'Segundo', email: 'b@example.com' }));
        await knex('interesados').where({ id: second.body.id }).update({ estado: 'contactado' });
        await knex('interesados').where({ email: 'a@example.com' }).update({ fecha_creacion: '2020-01-01 00:00:00' });

        const all = (await call('GET', ADMIN, admin)).body;
        assert.deepEqual(all.map((p) => p.nombre), ['Segundo', 'Primero']);
        const first = all[1];
        assert.deepEqual({ sede: first.sede, disciplina: first.disciplina, estado: first.estado }, { sede: 'Talca', disciplina: 'Kung Fu Tradicional', estado: 'nuevo' });
        assert.ok(all.every((p) => !('consentimiento_fecha' in p) || p.consentimiento === true));

        const onlyContacted = (await call('GET', `${ADMIN}?estado=contactado`, admin)).body;
        assert.deepEqual(onlyContacted.map((p) => p.nombre), ['Segundo']);
        assert.equal((await call('GET', `${ADMIN}?estado=raro`, admin)).status, 400);
    });
});

test('changing the estado validates it and leaves a note of the change', async () => {
    await withApi(USERS, async ({ call, login }) => {
        const admin = await login('admin@x.cl');
        const { body: { id } } = await call('POST', PUBLIC, null, lead());
        assert.equal((await call('PUT', `${ADMIN}/${id}`, admin, { estado: 'volando' })).status, 400);
        assert.equal((await call('PUT', `${ADMIN}/999`, admin, { estado: 'contactado' })).status, 404);

        assert.equal((await call('PUT', `${ADMIN}/${id}`, admin, { estado: 'contactado' })).status, 200);
        const detail = (await call('GET', `${ADMIN}/${id}`, admin)).body;
        assert.equal(detail.estado, 'contactado');
        assert.match(detail.seguimientos[0].nota, /nuevo.*contactado/);
        assert.equal(detail.seguimientos[0].usuario, 'Admin');
    });
});

test('administration adds follow-up notes, listed oldest first in the detail', async () => {
    await withApi(USERS, async ({ call, login }) => {
        const admin = await login('admin@x.cl');
        const { body: { id } } = await call('POST', PUBLIC, null, lead());
        const url = `${ADMIN}/${id}/seguimientos`;
        assert.equal((await call('POST', url, admin, { nota: '  ' })).status, 400);
        assert.equal((await call('POST', url, admin, { nota: 'x'.repeat(1001) })).status, 400);
        assert.equal((await call('POST', `${ADMIN}/999/seguimientos`, admin, { nota: 'hola' })).status, 404);
        assert.equal((await call('POST', url, admin, { nota: 'Llamé, quedó de confirmar' })).status, 201);
        assert.equal((await call('POST', url, admin, { nota: 'Confirmó asistencia' })).status, 201);
        const detail = (await call('GET', `${ADMIN}/${id}`, admin)).body;
        assert.deepEqual(detail.seguimientos.map((n) => n.nota), ['Llamé, quedó de confirmar', 'Confirmó asistencia']);
        assert.equal((await call('GET', `${ADMIN}/999`, admin)).status, 404);
    });
});

async function futureSesion({ call, admin }, offset = 5) {
    const fecha = isoDate(offset);
    const sede = (await call('GET', '/api/intranet/sedes', admin)).body[0];
    const disciplina = (await call('GET', '/api/intranet/disciplinas', admin)).body[0];
    const clase = (await call('POST', '/api/intranet/clases', admin, {
        sede_id: sede.id, disciplina_id: disciplina.id, dia_semana: weekdayOf(fecha), hora_inicio: '19:00', hora_fin: '20:30',
    })).body;
    await call('POST', `/api/intranet/clases/${clase.id}/sesiones`, admin, { desde: fecha, hasta: fecha });
    return (await call('GET', `/api/intranet/sesiones?desde=${fecha}&hasta=${fecha}`, admin)).body[0];
}

test('scheduling a trial class links a future sesion, moves the person forward and does not use a seat', async () => {
    await withApi(USERS, async ({ call, login }) => {
        const admin = await login('admin@x.cl');
        const { body: { id } } = await call('POST', PUBLIC, null, lead());
        const sesion = await futureSesion({ call, admin });

        const scheduled = await call('POST', `${ADMIN}/${id}/clase-prueba`, admin, { sesion_id: sesion.id });
        assert.equal(scheduled.status, 201);

        const detail = (await call('GET', `${ADMIN}/${id}`, admin)).body;
        assert.equal(detail.estado, 'clase_prueba');
        assert.deepEqual(detail.clases_prueba.map((c) => [c.sesion_id, c.fecha, c.estado]), [[sesion.id, sesion.fecha, 'agendada']]);
        assert.match(detail.seguimientos.at(-1).nota, /clase de prueba/i);
        const sesiones = (await call('GET', `/api/intranet/sesiones?desde=${sesion.fecha}&hasta=${sesion.fecha}`, admin)).body;
        assert.equal(sesiones[0].reservas, 0, 'a trial class does not take a booking place');
    });
});

test('a trial class needs an existing, scheduled and future sesion', async () => {
    await withApi(USERS, async ({ call, login }) => {
        const admin = await login('admin@x.cl');
        const { body: { id } } = await call('POST', PUBLIC, null, lead());
        const url = `${ADMIN}/${id}/clase-prueba`;
        assert.equal((await call('POST', url, admin, { sesion_id: 999 })).status, 404);
        assert.equal((await call('POST', `${ADMIN}/999/clase-prueba`, admin, { sesion_id: 1 })).status, 404);
        assert.equal((await call('POST', url, admin, {})).status, 400);

        const past = await futureSesion({ call, admin }, -3);
        const pastTry = await call('POST', url, admin, { sesion_id: past.id });
        assert.equal(pastTry.status, 400);
        assert.match(pastTry.body.error, /pasada/);

        const cancelled = await futureSesion({ call, admin }, 6);
        await call('POST', `/api/intranet/sesiones/${cancelled.id}/cancelar`, admin, {});
        assert.equal((await call('POST', url, admin, { sesion_id: cancelled.id })).status, 400);
    });
});

test('the result of a trial class is recorded with a note', async () => {
    await withApi(USERS, async ({ call, login }) => {
        const admin = await login('admin@x.cl');
        const { body: { id } } = await call('POST', PUBLIC, null, lead());
        const sesion = await futureSesion({ call, admin });
        await call('POST', `${ADMIN}/${id}/clase-prueba`, admin, { sesion_id: sesion.id });
        const [trial] = (await call('GET', `${ADMIN}/${id}`, admin)).body.clases_prueba;

        assert.equal((await call('PUT', `/api/intranet/clases-prueba/${trial.id}`, admin, { estado: 'quizas' })).status, 400);
        assert.equal((await call('PUT', '/api/intranet/clases-prueba/999', admin, { estado: 'asistio' })).status, 404);
        assert.equal((await call('PUT', `/api/intranet/clases-prueba/${trial.id}`, admin, { estado: 'no_asistio' })).status, 200);
        let detail = (await call('GET', `${ADMIN}/${id}`, admin)).body;
        assert.equal(detail.clases_prueba[0].estado, 'no_asistio');
        assert.equal(detail.estado, 'clase_prueba', 'still waiting for a new date');
        assert.match(detail.seguimientos.at(-1).nota, /no asistió/i);

        await call('PUT', `/api/intranet/clases-prueba/${trial.id}`, admin, { estado: 'asistio' });
        detail = (await call('GET', `${ADMIN}/${id}`, admin)).body;
        assert.equal(detail.clases_prueba[0].estado, 'asistio');
    });
});

test('deleting a sesion keeps the trial class record and deleting the person removes their history', async () => {
    await withApi(USERS, async ({ call, login, knex }) => {
        const admin = await login('admin@x.cl');
        const { body: { id } } = await call('POST', PUBLIC, null, lead());
        const sesion = await futureSesion({ call, admin });
        await call('POST', `${ADMIN}/${id}/clase-prueba`, admin, { sesion_id: sesion.id });
        await call('POST', `${ADMIN}/${id}/seguimientos`, admin, { nota: 'Nota' });

        await call('DELETE', `/api/intranet/clases/${sesion.clase_id}`, admin);
        const [trial] = await knex('clases_prueba');
        assert.equal(trial.sesion_id, null, 'the record stays without its sesion');

        await knex('interesados').where({ id }).del();
        assert.equal((await knex('clases_prueba')).length, 0);
        assert.equal((await knex('seguimientos')).length, 0);
    });
});
