// End to end on a real SQLite file: migrations, seed, login, schedules and
// bookings through the HTTP API, the same way the server runs locally.
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

test('the API works end to end on a local SQLite file', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'shaolin-e2e-'));
    const env = {
        JWT_SECRET: 'a-long-random-secret-used-only-in-tests-0123456789',
        SQLITE_FILE: path.join(dir, 'shaolin.db'),
    };
    const config = loadConfig(env);
    let database;
    try {
        const knex = knexFactory(buildKnexConfig(config));
        await knex.migrate.latest();
        await upsertUser(knex, { nombre: 'Admin', email: 'admin@x.cl', password: 'admin-pw', roles: ['Administrador'] });
        await upsertUser(knex, { nombre: 'Benja', email: 'benja@x.cl', password: 'benja-pw', roles: ['Alumno', 'Instructor'] });
        await knex.destroy();

        database = await createDatabase(config);
        await withServer(createApp({ config, db: database.db }), async (baseUrl) => {
            const post = (url, body, token) => fetch(`${baseUrl}${url}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
                body: JSON.stringify(body),
            });
            const get = (url, token) => fetch(`${baseUrl}${url}`, { headers: { Authorization: `Bearer ${token}` } });

            const adminLogin = await (await post('/api/login', { email: 'admin@x.cl', password: 'admin-pw' })).json();
            assert.equal(adminLogin.success, true);
            assert.deepEqual(adminLogin.roles, ['Administrador']);

            for (const [titulo, dia] of [['Sanda', 'Miércoles'], ['Kung Fu', 'Lunes']]) {
                const res = await post('/api/intranet/horarios', {
                    titulo, descripcion: '', dia_semana: dia, hora_inicio: '19:00', hora_fin: '20:30', cupo_maximo: 15,
                }, adminLogin.token);
                assert.equal(res.status, 201);
            }
            const horarios = await (await get('/api/intranet/horarios', adminLogin.token)).json();
            assert.deepEqual(horarios.map((h) => h.dia_semana), ['Lunes', 'Miércoles'], 'ordered by weekday');
            assert.equal(horarios[0].profesor, 'Admin');

            const created = await post('/api/intranet/usuarios', {
                nombre: 'Nuevo', email: 'nuevo@x.cl', password: 'pw', rol_id: 5,
            }, adminLogin.token);
            assert.equal(created.status, 201);
            const duplicate = await post('/api/intranet/usuarios', {
                nombre: 'Nuevo', email: 'nuevo@x.cl', password: 'pw', rol_id: 5,
            }, adminLogin.token);
            assert.equal(duplicate.status, 409);

            const benja = await (await post('/api/login', { email: 'benja@x.cl', password: 'benja-pw' })).json();
            assert.deepEqual(benja.roles, ['Alumno', 'Instructor']);
            const booking = await post('/api/intranet/reservar', { horario_id: horarios[0].id }, benja.token);
            assert.equal(booking.status, 201);
            const again = await post('/api/intranet/reservar', { horario_id: horarios[0].id }, benja.token);
            assert.equal(again.status, 400);
            const mine = await (await get('/api/intranet/mis-reservas', benja.token)).json();
            assert.deepEqual(mine.map((r) => r.titulo), ['Kung Fu']);

            const register = await post('/api/register', { repName: 'Rep', repEmail: 'r@x.cl', repSede: 'Talca' });
            assert.equal(register.status, 201);
        });
    } finally {
        if (database) await database.close();
        fs.rmSync(dir, { recursive: true, force: true });
    }
});
