// Intranet admin endpoints on a real SQLite file: user listing with roles and
// class deletion.
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
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'shaolin-intranet-'));
    const config = loadConfig({
        JWT_SECRET: 'a-long-random-secret-used-only-in-tests-0123456789',
        SQLITE_FILE: path.join(dir, 'shaolin.db'),
    });
    const knex = knexFactory(buildKnexConfig(config));
    let database;
    try {
        await knex.migrate.latest();
        await upsertUser(knex, { nombre: 'Admin', email: 'admin@x.cl', password: 'admin-pw', roles: ['Administrador'] });
        await upsertUser(knex, { nombre: 'Benja', email: 'benja@x.cl', password: 'benja-pw', roles: ['Alumno', 'Instructor'] });
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

test('the user list returns every role of each user and keeps the legacy rol field', async () => {
    await withApi(async ({ call, login }) => {
        const admin = await login('admin@x.cl', 'admin-pw');
        const { status, body } = await call('GET', '/api/intranet/usuarios', admin);
        assert.equal(status, 200);
        assert.deepEqual(
            body.map(({ nombre, email, rol, roles }) => ({ nombre, email, rol, roles })),
            [
                { nombre: 'Admin', email: 'admin@x.cl', rol: 'Administrador', roles: ['Administrador'] },
                { nombre: 'Benja', email: 'benja@x.cl', rol: 'Alumno', roles: ['Alumno', 'Instructor'] },
            ],
        );
        assert.ok(body.every((u) => u.id && u.fecha_creacion), 'id and fecha_creacion are still returned');
        assert.ok(body.every((u) => !('password_hash' in u)), 'password hashes are never returned');
    });
});

test('the user list is still admin only', async () => {
    await withApi(async ({ call, login }) => {
        const student = await login('benja@x.cl', 'benja-pw');
        assert.equal((await call('GET', '/api/intranet/usuarios', student)).status, 403);
    });
});

test('deleting a class that does not exist answers 404', async () => {
    await withApi(async ({ call, login }) => {
        const admin = await login('admin@x.cl', 'admin-pw');
        const { status, body } = await call('DELETE', '/api/intranet/horarios/999', admin);
        assert.equal(status, 404);
        assert.deepEqual(body, { error: 'Horario no encontrado.' });
    });
});

test('deleting a class with bookings removes the class and its bookings', async () => {
    await withApi(async ({ call, login, knex }) => {
        const admin = await login('admin@x.cl', 'admin-pw');
        const student = await login('benja@x.cl', 'benja-pw');
        const created = await call('POST', '/api/intranet/horarios', admin, {
            titulo: 'Sanda', descripcion: '', dia_semana: 'Martes', hora_inicio: '18:30', hora_fin: '20:00', cupo_maximo: 10,
        });
        assert.equal((await call('POST', '/api/intranet/reservar', student, { horario_id: created.body.id })).status, 201);

        const deleted = await call('DELETE', `/api/intranet/horarios/${created.body.id}`, admin);
        assert.equal(deleted.status, 200);
        assert.deepEqual(deleted.body, { message: 'Horario eliminado con éxito.' });
        assert.equal((await knex('horarios').where({ id: created.body.id })).length, 0);
        assert.deepEqual((await call('GET', '/api/intranet/mis-reservas', student)).body, []);
    });
});
