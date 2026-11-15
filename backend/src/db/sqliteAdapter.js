// A small SQLite database that answers like a mysql2 pool, so the controllers
// run unchanged on a local file:
//   execute(sql, params) -> [rows] for queries, [{ insertId, affectedRows }] otherwise
//   getConnection() -> { execute, beginTransaction, commit, rollback, release }
// Errors carry the mysql2 codes the controllers check (ER_DUP_ENTRY, ER_NO_SUCH_TABLE).
//
// SQLite has one connection here, so a transaction holds a lock until it is
// released; other queries wait instead of seeing uncommitted rows.

const sqlite3 = require('sqlite3');

const READS = /^\s*(SELECT|PRAGMA|WITH)\b/i;

function mapError(error) {
    const message = String(error && error.message);
    if (error && error.code === 'SQLITE_CONSTRAINT' && /UNIQUE|PRIMARY KEY/i.test(message)) {
        return Object.assign(new Error(message), { code: 'ER_DUP_ENTRY', cause: error });
    }
    if (/no such table/i.test(message)) {
        return Object.assign(new Error(message), { code: 'ER_NO_SUCH_TABLE', cause: error });
    }
    return error;
}

function run(database, sql, params = []) {
    return new Promise((resolve, reject) => {
        if (READS.test(sql)) {
            database.all(sql, params, (error, rows) => (error ? reject(mapError(error)) : resolve([rows])));
        } else {
            database.run(sql, params, function onRun(error) {
                if (error) return reject(mapError(error));
                return resolve([{ insertId: this.lastID, affectedRows: this.changes }]);
            });
        }
    });
}

function createLock() {
    let tail = Promise.resolve();
    return function acquire() {
        let release;
        const next = new Promise((resolve) => { release = resolve; });
        const ready = tail.then(() => release);
        tail = tail.then(() => next);
        return ready;
    };
}

function open(file) {
    return new Promise((resolve, reject) => {
        const database = new sqlite3.Database(file, (error) => (error ? reject(error) : resolve(database)));
    });
}

async function createSqliteDb(file) {
    const database = await open(file);
    await run(database, 'PRAGMA foreign_keys = ON');
    const acquire = createLock();

    return {
        async execute(sql, params) {
            const release = await acquire();
            try {
                return await run(database, sql, params);
            } finally {
                release();
            }
        },
        async getConnection() {
            const release = await acquire();
            let released = false;
            return {
                execute: (sql, params) => run(database, sql, params),
                beginTransaction: () => run(database, 'BEGIN'),
                commit: () => run(database, 'COMMIT'),
                rollback: () => run(database, 'ROLLBACK'),
                release: () => {
                    if (!released) {
                        released = true;
                        release();
                    }
                },
            };
        },
        close() {
            return new Promise((resolve, reject) => database.close((error) => (error ? reject(error) : resolve())));
        },
    };
}

module.exports = { createSqliteDb };
