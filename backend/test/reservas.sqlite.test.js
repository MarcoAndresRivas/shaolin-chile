// Fase 2, T2: students book sesiones (with a cupo that cannot be oversold) and
// instructors take attendance. Real SQLite file, HTTP API.
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

const DAY_MS = 24 * 60 * 60 * 1000;
const isoDate = (offsetDays) => new Date(Date.now() + offsetDays * DAY_MS).toISOString().slice(0, 10);
// ISO weekday (1 = Monday ... 7 = Sunday) of a YYYY-MM-DD date.
const weekdayOf = (iso) => new Date(`${iso}T00:00:00Z`).getUTCDay() || 7;

const USERS = [
    ['Admin', 'admin@x.cl', ['Administrador']],
    ['Ana', 'ana@x.cl', ['Alumno']],
    ['Beto', 'beto@x.cl', ['Alumno']],
    ['Caro', 'caro@x.cl', ['Alumno']],
    ['Ines', 'ines@x.cl', ['Instructor']],
    ['Otra', 'otra@x.cl', ['Instructor']],
];

async function withApi(fn) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'shaolin-reservas-'));
    const config = loadConfig({
        JWT_SECRET: 'a-long-random-secret-used-only-in-tests-0123456789',
        SQLITE_FILE: path.join(dir, 'shaolin.db'),
    });
    const knex = knexFactory(buildKnexConfig(config));
    let database;
    try {
        await knex.migrate.latest();
        for (const [nombre, email, roles] of USERS) {
            await upsertUser(knex, { nombre, email, password: `${nombre}-pw`, roles });
        }
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
            const login = async (email) => {
                const nombre = USERS.find((u) => u[1] === email)[0];
                return (await call('POST', '/api/login', null, { email, password: `${nombre}-pw` })).body.token;
            };
            const idOf = async (email) => (await knex('usuarios').where({ email }).first()).id;
            await fn({ call, login, knex, idOf });
        });
    } finally {
        if (database) await database.close();
        await knex.destroy();
        fs.rmSync(dir, { recursive: true, force: true });
    }
}

const BASE = '/api/intranet';

// Creates a clase on the weekday of `fecha`, generates its sesion for that date and returns the sesion.
async function sesionOn({ call, admin }, fecha, { cupo = 20, instructor_id } = {}) {
    const sede = (await call('GET', `${BASE}/sedes`, admin)).body[0];
    const disciplina = (await call('GET', `${BASE}/disciplinas`, admin)).body[0];
    const clase = (await call('POST', `${BASE}/clases`, admin, {
        sede_id: sede.id, disciplina_id: disciplina.id, instructor_id, dia_semana: weekdayOf(fecha),
        hora_inicio: '19:00', hora_fin: '20:30', cupo,
    })).body;
    await call('POST', `${BASE}/clases/${clase.id}/sesiones`, admin, { desde: fecha, hasta: fecha });
    return (await call('GET', `${BASE}/sesiones?desde=${fecha}&hasta=${fecha}`, admin)).body[0];
}

test('a student books a future sesion and sees it in their bookings and in the sesion list', async () => {
    await withApi(async (ctx) => {
        const { call, login } = ctx;
        const admin = await login('admin@x.cl');
        const ana = await login('ana@x.cl');
        const sesion = await sesionOn({ call, admin }, isoDate(3), { cupo: 5 });

        const booked = await call('POST', `${BASE}/sesiones/${sesion.id}/reservar`, ana);
        assert.equal(booked.status, 201);

        const mine = (await call('GET', `${BASE}/reservas/mias`, ana)).body;
        assert.deepEqual(mine.map((r) => [r.sesion_id, r.fecha, r.estado]), [[sesion.id, isoDate(3), 'activa']]);

        const listed = (await call('GET', `${BASE}/sesiones?desde=${isoDate(3)}&hasta=${isoDate(3)}`, ana)).body[0];
        assert.equal(listed.reservas, 1);
        assert.equal(listed.reservada, true);
        const asBeto = (await call('GET', `${BASE}/sesiones?desde=${isoDate(3)}&hasta=${isoDate(3)}`, await login('beto@x.cl'))).body[0];
        assert.equal(asBeto.reservada, false);
    });
});

test('booking is limited to students, to existing and scheduled sesiones, and to the future', async () => {
    await withApi(async (ctx) => {
        const { call, login } = ctx;
        const admin = await login('admin@x.cl');
        const ana = await login('ana@x.cl');
        const future = await sesionOn({ call, admin }, isoDate(4));
        const past = await sesionOn({ call, admin }, isoDate(-3));

        assert.equal((await call('POST', `${BASE}/sesiones/${future.id}/reservar`, admin)).status, 403, 'not a student');
        assert.equal((await call('POST', `${BASE}/sesiones/999/reservar`, ana)).status, 404);
        const pastTry = await call('POST', `${BASE}/sesiones/${past.id}/reservar`, ana);
        assert.equal(pastTry.status, 400);
        assert.match(pastTry.body.error, /pasada/);

        await call('POST', `${BASE}/sesiones/${future.id}/cancelar`, admin, { motivo: 'Feriado' });
        const cancelled = await call('POST', `${BASE}/sesiones/${future.id}/reservar`, ana);
        assert.equal(cancelled.status, 400);
        assert.match(cancelled.body.error, /cancelada/);
    });
});

test('a student cannot book the same sesion twice', async () => {
    await withApi(async (ctx) => {
        const { call, login } = ctx;
        const admin = await login('admin@x.cl');
        const ana = await login('ana@x.cl');
        const sesion = await sesionOn({ call, admin }, isoDate(3));
        assert.equal((await call('POST', `${BASE}/sesiones/${sesion.id}/reservar`, ana)).status, 201);
        const again = await call('POST', `${BASE}/sesiones/${sesion.id}/reservar`, ana);
        assert.equal(again.status, 409);
        assert.equal((await call('GET', `${BASE}/sesiones?desde=${isoDate(3)}&hasta=${isoDate(3)}`, admin)).body[0].reservas, 1);
    });
});

test('the cupo cannot be oversold, even with simultaneous bookings', async () => {
    await withApi(async (ctx) => {
        const { call, login } = ctx;
        const admin = await login('admin@x.cl');
        const tokens = await Promise.all(['ana@x.cl', 'beto@x.cl', 'caro@x.cl'].map(login));
        const sesion = await sesionOn({ call, admin }, isoDate(3), { cupo: 2 });

        const results = await Promise.all(tokens.map((t) => call('POST', `${BASE}/sesiones/${sesion.id}/reservar`, t)));
        assert.deepEqual(results.map((r) => r.status).sort(), [201, 201, 409]);
        const full = results.find((r) => r.status === 409);
        assert.match(full.body.error, /llena/);
        assert.equal((await call('GET', `${BASE}/sesiones?desde=${isoDate(3)}&hasta=${isoDate(3)}`, admin)).body[0].reservas, 2);
    });
});

test('cancelling a booking frees the place and allows booking again', async () => {
    await withApi(async (ctx) => {
        const { call, login } = ctx;
        const admin = await login('admin@x.cl');
        const ana = await login('ana@x.cl');
        const beto = await login('beto@x.cl');
        const sesion = await sesionOn({ call, admin }, isoDate(3), { cupo: 1 });

        await call('POST', `${BASE}/sesiones/${sesion.id}/reservar`, ana);
        assert.equal((await call('POST', `${BASE}/sesiones/${sesion.id}/reservar`, beto)).status, 409, 'full');

        assert.equal((await call('DELETE', `${BASE}/sesiones/${sesion.id}/reservar`, ana)).status, 200);
        assert.equal((await call('DELETE', `${BASE}/sesiones/${sesion.id}/reservar`, ana)).status, 404, 'nothing left to cancel');
        assert.equal((await call('POST', `${BASE}/sesiones/${sesion.id}/reservar`, beto)).status, 201, 'the place was freed');
        assert.equal((await call('POST', `${BASE}/sesiones/${sesion.id}/reservar`, ana)).status, 409, 'full again');

        await call('DELETE', `${BASE}/sesiones/${sesion.id}/reservar`, beto);
        assert.equal((await call('POST', `${BASE}/sesiones/${sesion.id}/reservar`, ana)).status, 201, 'a cancelled booking can be reactivated');
        const mine = (await call('GET', `${BASE}/reservas/mias`, ana)).body;
        assert.equal(mine.length, 1);
        assert.equal(mine[0].estado, 'activa');
    });
});

test('only the clase instructor or an admin can see and take attendance', async () => {
    await withApi(async (ctx) => {
        const { call, login, idOf } = ctx;
        const admin = await login('admin@x.cl');
        const ana = await login('ana@x.cl');
        const ines = await login('ines@x.cl');
        const otra = await login('otra@x.cl');
        const sesion = await sesionOn({ call, admin }, isoDate(1), { instructor_id: await idOf('ines@x.cl') });
        await call('POST', `${BASE}/sesiones/${sesion.id}/reservar`, ana);

        const url = `${BASE}/sesiones/${sesion.id}/asistencia`;
        assert.equal((await call('GET', url, ines)).status, 200);
        assert.equal((await call('GET', url, admin)).status, 200);
        assert.equal((await call('GET', url, otra)).status, 403, 'another instructor');
        assert.equal((await call('GET', url, ana)).status, 403, 'a student');
        assert.equal((await call('PUT', url, otra, { asistencias: [] })).status, 403);
    });
});

test('attendance lists the booked students and records present and absent', async () => {
    await withApi(async (ctx) => {
        const { call, login, idOf } = ctx;
        const admin = await login('admin@x.cl');
        const ana = await login('ana@x.cl');
        const beto = await login('beto@x.cl');
        const ines = await login('ines@x.cl');
        const sesion = await sesionOn({ call, admin }, isoDate(1), { instructor_id: await idOf('ines@x.cl') });
        await call('POST', `${BASE}/sesiones/${sesion.id}/reservar`, ana);
        await call('POST', `${BASE}/sesiones/${sesion.id}/reservar`, beto);
        const anaId = await idOf('ana@x.cl');
        const betoId = await idOf('beto@x.cl');
        const url = `${BASE}/sesiones/${sesion.id}/asistencia`;

        const before = (await call('GET', url, ines)).body;
        assert.deepEqual(before.map((r) => [r.nombre, r.presente]), [['Ana', null], ['Beto', null]]);

        const saved = await call('PUT', url, ines, { asistencias: [{ alumno_id: anaId, presente: true }, { alumno_id: betoId, presente: false }] });
        assert.equal(saved.status, 200);
        assert.deepEqual((await call('GET', url, ines)).body.map((r) => [r.nombre, r.presente]), [['Ana', true], ['Beto', false]]);

        // Correcting a mark updates it instead of duplicating it.
        await call('PUT', url, ines, { asistencias: [{ alumno_id: betoId, presente: true }] });
        assert.deepEqual((await call('GET', url, ines)).body.map((r) => [r.nombre, r.presente]), [['Ana', true], ['Beto', true]]);
    });
});

test('attendance rejects students without a booking and malformed entries', async () => {
    await withApi(async (ctx) => {
        const { call, login, idOf } = ctx;
        const admin = await login('admin@x.cl');
        const ana = await login('ana@x.cl');
        const sesion = await sesionOn({ call, admin }, isoDate(1));
        await call('POST', `${BASE}/sesiones/${sesion.id}/reservar`, ana);
        const url = `${BASE}/sesiones/${sesion.id}/asistencia`;
        const caroId = await idOf('caro@x.cl');
        const anaId = await idOf('ana@x.cl');

        const notBooked = await call('PUT', url, admin, { asistencias: [{ alumno_id: caroId, presente: true }] });
        assert.equal(notBooked.status, 400);
        assert.match(notBooked.body.error, /reserva/);
        assert.equal((await call('PUT', url, admin, { asistencias: 'x' })).status, 400);
        assert.equal((await call('PUT', url, admin, { asistencias: [{ alumno_id: anaId, presente: 'si' }] })).status, 400);
        assert.equal((await call('PUT', `${BASE}/sesiones/999/asistencia`, admin, { asistencias: [] })).status, 404);

        // A rejected batch records nothing, not even its valid entries.
        await call('PUT', url, admin, { asistencias: [{ alumno_id: anaId, presente: true }, { alumno_id: caroId, presente: true }] });
        assert.equal((await call('GET', url, admin)).body[0].presente, null);
    });
});

test('a student sees their own attendance record', async () => {
    await withApi(async (ctx) => {
        const { call, login, idOf } = ctx;
        const admin = await login('admin@x.cl');
        const ana = await login('ana@x.cl');
        const sesion = await sesionOn({ call, admin }, isoDate(1));
        await call('POST', `${BASE}/sesiones/${sesion.id}/reservar`, ana);
        await call('PUT', `${BASE}/sesiones/${sesion.id}/asistencia`, admin, { asistencias: [{ alumno_id: await idOf('ana@x.cl'), presente: true }] });

        const record = await call('GET', `${BASE}/asistencia/mia`, ana);
        assert.equal(record.status, 200);
        assert.deepEqual(record.body.resumen, { clases: 1, asistidas: 1 });
        assert.deepEqual(record.body.detalle.map((d) => [d.fecha, d.presente]), [[isoDate(1), true]]);
    });
});

test('deleting a clase removes its bookings and attendance', async () => {
    await withApi(async (ctx) => {
        const { call, login, knex, idOf } = ctx;
        const admin = await login('admin@x.cl');
        const ana = await login('ana@x.cl');
        const sesion = await sesionOn({ call, admin }, isoDate(1));
        await call('POST', `${BASE}/sesiones/${sesion.id}/reservar`, ana);
        await call('PUT', `${BASE}/sesiones/${sesion.id}/asistencia`, admin, { asistencias: [{ alumno_id: await idOf('ana@x.cl'), presente: true }] });
        await call('DELETE', `${BASE}/clases/${sesion.clase_id}`, admin);
        assert.equal((await knex('reservas')).length, 0);
        assert.equal((await knex('asistencias')).length, 0);
    });
});
