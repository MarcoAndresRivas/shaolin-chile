// Chooses the database from the configuration: a local SQLite file for
// development, or MySQL (Aiven) when DB_SERVER is set.

const fs = require('node:fs');
const path = require('node:path');
const { createSqliteDb } = require('./sqliteAdapter');

const MIGRATIONS_DIR = path.join(__dirname, '..', '..', 'migrations');

// Knex configuration for migrations and seeds.
function buildKnexConfig(config) {
    const migrations = { directory: MIGRATIONS_DIR, tableName: 'knex_migrations' };
    if (config.dbClient === 'sqlite') {
        return {
            client: 'sqlite3',
            connection: { filename: ensureParentDir(config.sqliteFile) },
            useNullAsDefault: true,
            migrations,
            pool: { afterCreate: (conn, done) => conn.run('PRAGMA foreign_keys = ON', done) },
        };
    }
    return {
        client: 'mysql2',
        connection: { ...config.db, charset: 'utf8mb4' },
        migrations,
    };
}

// The database the API uses: { db, ping, close }, where db has the mysql2
// pool interface the controllers expect.
async function createDatabase(config) {
    if (config.dbClient === 'sqlite') {
        const db = await createSqliteDb(ensureParentDir(config.sqliteFile));
        return {
            db,
            ping: () => db.execute('SELECT 1'),
            close: () => db.close(),
        };
    }
    const mysql = require('mysql2/promise');
    const pool = mysql.createPool({ ...config.db, waitForConnections: true, connectionLimit: 10, queueLimit: 0 });
    return {
        db: pool,
        ping: async () => (await pool.getConnection()).release(),
        close: () => pool.end(),
    };
}

function ensureParentDir(file) {
    if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
    return file;
}

module.exports = { buildKnexConfig, createDatabase };
