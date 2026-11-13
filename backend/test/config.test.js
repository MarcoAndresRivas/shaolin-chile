const test = require('node:test');
const assert = require('node:assert/strict');
const { loadConfig, DEFAULT_CORS_ORIGINS } = require('../src/config');

const VALID_SECRET = 'a-long-random-secret-used-only-in-tests-0123456789';

test('loadConfig refuses to load when JWT_SECRET is missing', () => {
    assert.throws(() => loadConfig({}), /JWT_SECRET/);
});

test('loadConfig refuses to load when JWT_SECRET is empty', () => {
    assert.throws(() => loadConfig({ JWT_SECRET: '   ' }), /JWT_SECRET/);
});

test('loadConfig refuses the old known default secret', () => {
    assert.throws(() => loadConfig({ JWT_SECRET: 'fallback_secret' }), /JWT_SECRET/);
});

test('loadConfig returns the JWT secret when it is set', () => {
    assert.equal(loadConfig({ JWT_SECRET: VALID_SECRET }).jwtSecret, VALID_SECRET);
});

test('CORS origins default to the published site only', () => {
    const config = loadConfig({ JWT_SECRET: VALID_SECRET });
    assert.deepEqual(config.corsOrigins, DEFAULT_CORS_ORIGINS);
    assert.deepEqual(DEFAULT_CORS_ORIGINS, ['https://marcoandresrivas.github.io']);
});

test('CORS origins are read from CORS_ORIGINS as a trimmed comma-separated list', () => {
    const config = loadConfig({
        JWT_SECRET: VALID_SECRET,
        CORS_ORIGINS: ' https://shaolinchile.cl , http://localhost:5500/ ,,',
    });
    assert.deepEqual(config.corsOrigins, ['https://shaolinchile.cl', 'http://localhost:5500']);
});

test('without a MySQL server configured, the database is a local SQLite file', () => {
    const config = loadConfig({ JWT_SECRET: VALID_SECRET });
    assert.equal(config.dbClient, 'sqlite');
    assert.match(config.sqliteFile, /data[\\/]shaolin\.db$/);
    assert.equal(loadConfig({ JWT_SECRET: VALID_SECRET, SQLITE_FILE: '/tmp/x.db' }).sqliteFile, '/tmp/x.db');
});

test('with DB_SERVER set, the database is MySQL, as in production', () => {
    assert.equal(loadConfig({ JWT_SECRET: VALID_SECRET, DB_SERVER: 'x.aivencloud.com' }).dbClient, 'mysql');
});

test('DB_CLIENT overrides the detection and rejects unknown values', () => {
    assert.equal(loadConfig({ JWT_SECRET: VALID_SECRET, DB_CLIENT: 'mysql' }).dbClient, 'mysql');
    assert.equal(loadConfig({ JWT_SECRET: VALID_SECRET, DB_SERVER: 'h', DB_CLIENT: 'sqlite' }).dbClient, 'sqlite');
    assert.throws(() => loadConfig({ JWT_SECRET: VALID_SECRET, DB_CLIENT: 'postgres' }), /DB_CLIENT/);
});

test('database settings keep the previous defaults and enable SSL for Aiven', () => {
    const local = loadConfig({ JWT_SECRET: VALID_SECRET }).db;
    assert.equal(local.host, 'localhost');
    assert.equal(local.database, 'shaolin_chile');
    assert.equal(local.port, 3306);
    assert.equal(local.ssl, undefined);

    const aiven = loadConfig({ JWT_SECRET: VALID_SECRET, DB_SERVER: 'x.aivencloud.com', DB_PORT: '12345' }).db;
    assert.equal(aiven.port, 12345);
    assert.deepEqual(aiven.ssl, { rejectUnauthorized: false });
});
