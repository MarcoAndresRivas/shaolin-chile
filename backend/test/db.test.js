// On MySQL, DATE columns must come back as 'YYYY-MM-DD' text, like on SQLite:
// the code compares and slices them as strings (months in grade, exam dates,
// presale closing). DATETIME columns keep their Date objects.
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildKnexConfig, createDatabase } = require('../src/db');

const MYSQL = { dbClient: 'mysql', db: { host: 'db.example', user: 'u', password: 'p', database: 'd' } };

test('knex on MySQL returns DATE columns as text', () => {
    assert.deepEqual(buildKnexConfig(MYSQL).connection.dateStrings, ['DATE']);
});

test('the API pool on MySQL returns DATE columns as text', async () => {
    const modulePath = require.resolve('mysql2/promise');
    const original = require.cache[modulePath];
    let options;
    require.cache[modulePath] = { id: modulePath, filename: modulePath, loaded: true, exports: { createPool: (o) => { options = o; return { end: async () => {} }; } } };
    try {
        await createDatabase(MYSQL);
        assert.deepEqual(options.dateStrings, ['DATE']);
        assert.equal(options.host, 'db.example', 'keeps the connection settings');
    } finally {
        if (original) require.cache[modulePath] = original;
        else delete require.cache[modulePath];
    }
});
