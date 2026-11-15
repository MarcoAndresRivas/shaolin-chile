// Helpers shared by the migrations.
//
// MySQL rejects a foreign key whose integer column differs in signedness from
// the column it references. The production tables were created by the old
// setup scripts with signed INT ids, while knex increments() creates
// INT UNSIGNED. So every foreign key reads the real type of the key it points
// to instead of assuming one.

function isMysql(knex) {
    const client = knex.client.config.client;
    return client === 'mysql' || client === 'mysql2';
}

async function isUnsignedKey(knex, table, column = 'id') {
    if (!isMysql(knex)) return false; // SQLite has no unsigned integers.
    const [rows] = await knex.raw(
        `SELECT COLUMN_TYPE FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
        [table, column],
    );
    if (!rows.length) throw new Error(`Column ${table}.${column} not found.`);
    return /unsigned/i.test(rows[0].COLUMN_TYPE);
}

// Adds an integer column for a foreign key, signed or unsigned to match the key.
function foreignId(t, name, unsigned) {
    const column = t.integer(name);
    return unsigned ? column.unsigned() : column;
}

async function createTableIfMissing(knex, name, build) {
    if (!(await knex.schema.hasTable(name))) {
        await knex.schema.createTable(name, build);
    }
}

module.exports = { isUnsignedKey, foreignId, createTableIfMissing };
