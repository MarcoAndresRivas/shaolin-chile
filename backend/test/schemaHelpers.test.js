const test = require('node:test');
const assert = require('node:assert/strict');
const knexFactory = require('knex');
const { isUnsignedKey, foreignId } = require('../src/db/schemaHelpers');

function fakeMysql(columnType) {
    return {
        client: { config: { client: 'mysql2' } },
        raw: async () => [[{ COLUMN_TYPE: columnType }]],
    };
}

test('isUnsignedKey reads the signedness of an existing MySQL key', async () => {
    // Production tables were created by the old scripts with signed INT ids.
    assert.equal(await isUnsignedKey(fakeMysql('int'), 'usuarios'), false);
    // Tables created by knex increments() use INT UNSIGNED.
    assert.equal(await isUnsignedKey(fakeMysql('int unsigned'), 'usuarios'), true);
});

test('isUnsignedKey does not query non-MySQL databases', async () => {
    const sqlite = { client: { config: { client: 'sqlite3' } }, raw: async () => assert.fail('must not query') };
    assert.equal(await isUnsignedKey(sqlite, 'usuarios'), false);
});

test('foreignId emits a column with the same signedness as the referenced key', () => {
    const mysql = knexFactory({ client: 'mysql2' });
    const signed = mysql.schema
        .createTable('usuario_roles', (t) => foreignId(t, 'usuario_id', false).notNullable())
        .toString();
    const unsigned = mysql.schema
        .createTable('usuario_roles', (t) => foreignId(t, 'usuario_id', true).notNullable())
        .toString();
    assert.match(signed, /`usuario_id` int not null/);
    assert.doesNotMatch(signed, /unsigned/);
    assert.match(unsigned, /`usuario_id` int unsigned not null/);
});
