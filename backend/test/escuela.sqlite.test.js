// Fase 2, T1: sedes, disciplinas, clases (weekly template) and sesiones
// (concrete dates) through the HTTP API on a real SQLite file.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const knexFactory = require('knex');
const { loadConfig } = require('../src/config');
const { buildKnexConfig, createDatabase } = require('../src/db');
const { upsertUser } = require('../src/seedUser');
const { createApp } = require('../src/app');
const { withServer } = require('./helpers');

async function withApi(fn) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'shaolin-escuela-'));
    const config = loadConfig({
        JWT_SECRET: 'a-long-random-secret-used-only-in-tests-0123456789',
        SQLITE_FILE: path.join(dir, 'shaolin.db'),
    });
    const knex = knexFactory(buildKnexConfig(config));
    let database;
    try {
        await knex.migrate.latest();
        await upsertUser(knex, { nombre: 'Admin', email: 'admin@x.cl', password: 'admin-pw', roles: ['Administrador'] });
        await upsertUser(knex, { nombre: 'Ana', email: 'ana@x.cl', password: 'ana-pw', roles: ['Alumno'] });
        await upsertUser(knex, { nombre: 'Ines', email: 'ines@x.cl', password: 'ines-pw', roles: ['Instructor'] });
        database = await createDatabase(config);
        await withServer(createApp({ config, db: database.db }), async (baseUrl) => {
            const call = async (method, url, token, body) => {
                const res = await fetch(`${baseUrl}${url}`, {
                    method,
                    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
                    body: body === undefined ? undefined : JSON.stringify(body),
                });
                return { status: res.status, body: await res.json() };
            };
            const login = async (email, password) => (await call('POST', '/api/login', null, { email, password })).body.token;
            await fn({ call, login, knex });
        });
    } finally {
        if (database) await database.close();
        await knex.destroy();
        fs.rmSync(dir, { recursive: true, force: true });
    }
}

const BASE = '/api/intranet';

test('the migration seeds the three sedes and three disciplines of the school', async () => {
    await withApi(async ({ call, login }) => {
        const admin = await login('admin@x.cl', 'admin-pw');
        const sedes = (await call('GET', `${BASE}/sedes`, admin)).body;
        assert.deepEqual(sedes.map((s) => s.ciudad), ['Concepción', 'Santiago', 'Talca']);
        assert.ok(sedes.every((s) => s.direccion === null && s.activa === true));
        const disciplinas = (await call('GET', `${BASE}/disciplinas`, admin)).body;
        assert.deepEqual(disciplinas.map((d) => d.nombre), ['Kung Fu Tradicional', 'Sanda (Boxeo Chino)', 'Tai Chi y Qi Gong']);
    });
});

test('reading needs a login and writing needs an administration role', async () => {
    await withApi(async ({ call, login }) => {
        assert.equal((await call('GET', `${BASE}/sedes`, null)).status, 403);
        const student = await login('ana@x.cl', 'ana-pw');
        assert.equal((await call('GET', `${BASE}/sedes`, student)).status, 200);
        assert.equal((await call('POST', `${BASE}/sedes`, student, { nombre: 'X', ciudad: 'Y' })).status, 403);
        assert.equal((await call('POST', `${BASE}/clases`, student, {})).status, 403);
        assert.equal((await call('DELETE', `${BASE}/clases/1`, student)).status, 403);
    });
});

test('an admin creates and updates a sede and rejects an incomplete one', async () => {
    await withApi(async ({ call, login }) => {
        const admin = await login('admin@x.cl', 'admin-pw');
        const created = await call('POST', `${BASE}/sedes`, admin, { nombre: 'Sede Valdivia', ciudad: 'Valdivia', direccion: 'Calle 1' });
        assert.equal(created.status, 201);
        const updated = await call('PUT', `${BASE}/sedes/${created.body.id}`, admin, { direccion: 'Calle 2', activa: false });
        assert.equal(updated.status, 200);
        const list = (await call('GET', `${BASE}/sedes`, admin)).body;
        const sede = list.find((s) => s.id === created.body.id);
        assert.equal(sede.direccion, 'Calle 2');
        assert.equal(sede.activa, false);
        assert.equal((await call('POST', `${BASE}/sedes`, admin, { nombre: 'Sin ciudad' })).status, 400);
        assert.equal((await call('PUT', `${BASE}/sedes/999`, admin, { direccion: 'x' })).status, 404);
    });
});

async function firstIds({ call, admin }) {
    const sede = (await call('GET', `${BASE}/sedes`, admin)).body[0];
    const disciplina = (await call('GET', `${BASE}/disciplinas`, admin)).body[0];
    return { sede_id: sede.id, disciplina_id: disciplina.id };
}

test('creating a clase validates its fields', async () => {
    await withApi(async ({ call, login }) => {
        const admin = await login('admin@x.cl', 'admin-pw');
        const ids = await firstIds({ call, admin });
        const ok = { ...ids, dia_semana: 1, hora_inicio: '19:00', hora_fin: '20:30', cupo: 15 };
        const created = await call('POST', `${BASE}/clases`, admin, ok);
        assert.equal(created.status, 201);

        const cases = [
            [{ ...ok, dia_semana: 8 }, 'dia_semana'],
            [{ ...ok, hora_inicio: '7pm' }, 'hora_inicio'],
            [{ ...ok, hora_fin: '18:00' }, 'hora_fin'],
            [{ ...ok, cupo: 0 }, 'cupo'],
            [{ ...ok, sede_id: 999 }, 'sede_id'],
            [{ ...ok, disciplina_id: 999 }, 'disciplina_id'],
            [{ ...ok, instructor_id: 999 }, 'instructor_id'],
        ];
        for (const [body, field] of cases) {
            const res = await call('POST', `${BASE}/clases`, admin, body);
            assert.equal(res.status, 400, field);
            assert.match(res.body.error, new RegExp(field), field);
        }
    });
});

test('clases list with sede, disciplina and instructor names, filtered by sede', async () => {
    await withApi(async ({ call, login, knex }) => {
        const admin = await login('admin@x.cl', 'admin-pw');
        const sedes = (await call('GET', `${BASE}/sedes`, admin)).body;
        const disciplina = (await call('GET', `${BASE}/disciplinas`, admin)).body[1];
        const ines = await knex('usuarios').where({ email: 'ines@x.cl' }).first();
        await call('POST', `${BASE}/clases`, admin, {
            sede_id: sedes[0].id, disciplina_id: disciplina.id, instructor_id: ines.id,
            dia_semana: 2, hora_inicio: '18:30', hora_fin: '20:00', cupo: 10,
        });
        await call('POST', `${BASE}/clases`, admin, {
            sede_id: sedes[1].id, disciplina_id: disciplina.id, dia_semana: 6, hora_inicio: '10:00', hora_fin: '11:30',
        });

        const all = (await call('GET', `${BASE}/clases`, admin)).body;
        assert.equal(all.length, 2);
        assert.deepEqual(
            { ciudad: all[0].sede, disciplina: all[0].disciplina, instructor: all[0].instructor, cupo: all[0].cupo },
            { ciudad: 'Concepción', disciplina: 'Sanda (Boxeo Chino)', instructor: 'Ines', cupo: 10 },
        );
        assert.equal(all[1].cupo, 20, 'default cupo');
        assert.equal(all[1].instructor, null);

        const onlySantiago = (await call('GET', `${BASE}/clases?sede_id=${sedes[1].id}`, admin)).body;
        assert.deepEqual(onlySantiago.map((c) => c.dia_semana), [6]);
    });
});

test('generating sesiones creates one per matching weekday and can be repeated', async () => {
    await withApi(async ({ call, login }) => {
        const admin = await login('admin@x.cl', 'admin-pw');
        const ids = await firstIds({ call, admin });
        // 2026-12-07 is a Monday.
        const clase = (await call('POST', `${BASE}/clases`, admin, { ...ids, dia_semana: 1, hora_inicio: '19:00', hora_fin: '20:30' })).body;

        const first = await call('POST', `${BASE}/clases/${clase.id}/sesiones`, admin, { desde: '2026-12-01', hasta: '2026-12-31' });
        assert.equal(first.status, 201);
        assert.deepEqual(first.body, { creadas: 4 });

        const sesiones = (await call('GET', `${BASE}/sesiones?desde=2026-12-01&hasta=2026-12-31`, admin)).body;
        assert.deepEqual(sesiones.map((s) => s.fecha), ['2026-12-07', '2026-12-14', '2026-12-21', '2026-12-28']);
        assert.ok(sesiones.every((s) => s.estado === 'programada' && s.hora_inicio === '19:00' && s.disciplina));

        const again = await call('POST', `${BASE}/clases/${clase.id}/sesiones`, admin, { desde: '2026-12-01', hasta: '2027-01-12' });
        assert.deepEqual(again.body, { creadas: 2 }, 'only the new dates are created');
    });
});

test('generating sesiones validates the range', async () => {
    await withApi(async ({ call, login }) => {
        const admin = await login('admin@x.cl', 'admin-pw');
        const ids = await firstIds({ call, admin });
        const clase = (await call('POST', `${BASE}/clases`, admin, { ...ids, dia_semana: 1, hora_inicio: '19:00', hora_fin: '20:30' })).body;
        const url = `${BASE}/clases/${clase.id}/sesiones`;
        assert.equal((await call('POST', url, admin, { desde: '2026-12-31', hasta: '2026-12-01' })).status, 400);
        assert.equal((await call('POST', url, admin, { desde: 'hoy', hasta: '2026-12-01' })).status, 400);
        assert.equal((await call('POST', url, admin, { desde: '2026-02-30', hasta: '2026-03-30' })).status, 400, 'impossible date');
        assert.equal((await call('POST', url, admin, { desde: '2026-01-01', hasta: '2027-06-01' })).status, 400, 'range over 92 days');
        assert.equal((await call('POST', `${BASE}/clases/999/sesiones`, admin, { desde: '2026-12-01', hasta: '2026-12-31' })).status, 404);
    });
});

test('cancelling a sesion keeps it listed as cancelled and regenerating does not revive it', async () => {
    await withApi(async ({ call, login }) => {
        const admin = await login('admin@x.cl', 'admin-pw');
        const ids = await firstIds({ call, admin });
        const clase = (await call('POST', `${BASE}/clases`, admin, { ...ids, dia_semana: 1, hora_inicio: '19:00', hora_fin: '20:30' })).body;
        await call('POST', `${BASE}/clases/${clase.id}/sesiones`, admin, { desde: '2026-12-01', hasta: '2026-12-10' });
        const [sesion] = (await call('GET', `${BASE}/sesiones?desde=2026-12-01&hasta=2026-12-10`, admin)).body;

        const cancelled = await call('POST', `${BASE}/sesiones/${sesion.id}/cancelar`, admin, { motivo: 'Feriado' });
        assert.equal(cancelled.status, 200);
        const after = (await call('GET', `${BASE}/sesiones?desde=2026-12-01&hasta=2026-12-10`, admin)).body;
        assert.deepEqual({ estado: after[0].estado, motivo: after[0].motivo }, { estado: 'cancelada', motivo: 'Feriado' });

        const regenerated = await call('POST', `${BASE}/clases/${clase.id}/sesiones`, admin, { desde: '2026-12-01', hasta: '2026-12-10' });
        assert.deepEqual(regenerated.body, { creadas: 0 });
        assert.equal((await call('POST', `${BASE}/sesiones/999/cancelar`, admin, {})).status, 404);
    });
});

test('deleting a clase removes its sesiones and answers 404 for a missing one', async () => {
    await withApi(async ({ call, login, knex }) => {
        const admin = await login('admin@x.cl', 'admin-pw');
        const ids = await firstIds({ call, admin });
        const clase = (await call('POST', `${BASE}/clases`, admin, { ...ids, dia_semana: 1, hora_inicio: '19:00', hora_fin: '20:30' })).body;
        await call('POST', `${BASE}/clases/${clase.id}/sesiones`, admin, { desde: '2026-12-01', hasta: '2026-12-31' });

        const deleted = await call('DELETE', `${BASE}/clases/${clase.id}`, admin);
        assert.equal(deleted.status, 200);
        assert.equal((await knex('sesiones')).length, 0);
        assert.equal((await call('DELETE', `${BASE}/clases/${clase.id}`, admin)).status, 404);
    });
});

test('the legacy horarios and bookings keep working next to the new tables', async () => {
    await withApi(async ({ call, login }) => {
        const admin = await login('admin@x.cl', 'admin-pw');
        const student = await login('ana@x.cl', 'ana-pw');
        const horario = await call('POST', `${BASE}/horarios`, admin, {
            titulo: 'Sanda', descripcion: '', dia_semana: 'Martes', hora_inicio: '18:30', hora_fin: '20:00', cupo_maximo: 10,
        });
        assert.equal(horario.status, 201);
        assert.equal((await call('POST', `${BASE}/reservar`, student, { horario_id: horario.body.id })).status, 201);
    });
});
