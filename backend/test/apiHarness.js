// Shared by the API tests: a real SQLite file, migrated and seeded, with the
// Express app listening on a random port.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const knexFactory = require('knex');
const { loadConfig } = require('../src/config');
const { buildKnexConfig, createDatabase } = require('../src/db');
const { upsertUser } = require('../src/seedUser');
const { createApp } = require('../src/app');
const { withServer } = require('./helpers');

// users: [[nombre, email, roles]]. Each password is `${nombre}-pw`.
async function withApi(users, fn, { env = {} } = {}) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'shaolin-api-'));
    const config = loadConfig({
        JWT_SECRET: 'a-long-random-secret-used-only-in-tests-0123456789',
        SQLITE_FILE: path.join(dir, 'shaolin.db'),
        ...env,
    });
    const knex = knexFactory(buildKnexConfig(config));
    let database;
    try {
        await knex.migrate.latest();
        for (const [nombre, email, roles] of users) {
            await upsertUser(knex, { nombre, email, password: `${nombre}-pw`, roles });
        }
        database = await createDatabase(config);
        await withServer(createApp({ config, db: database.db }), async (baseUrl) => {
            const call = async (method, url, token, body, headers = {}) => {
                const res = await fetch(`${baseUrl}${url}`, {
                    method,
                    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
                    body: body === undefined ? undefined : JSON.stringify(body),
                });
                return { status: res.status, body: await res.json() };
            };
            const login = async (email) => {
                const nombre = users.find((u) => u[1] === email)[0];
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

module.exports = { withApi };
