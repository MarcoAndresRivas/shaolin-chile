const test = require('node:test');
const assert = require('node:assert/strict');
const { createSqliteDb } = require('../src/db/sqliteAdapter');

async function withDb(fn) {
    const db = await createSqliteDb(':memory:');
    try {
        await db.execute('CREATE TABLE t (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT NOT NULL UNIQUE)');
        await fn(db);
    } finally {
        await db.close();
    }
}

test('execute returns [rows] for queries and [{ insertId }] for inserts, like mysql2', async () => {
    await withDb(async (db) => {
        const [result] = await db.execute('INSERT INTO t (email) VALUES (?)', ['a@x.cl']);
        assert.equal(result.insertId, 1);
        assert.equal(result.affectedRows, 1);
        const [rows] = await db.execute('SELECT id, email FROM t WHERE email = ?', ['a@x.cl']);
        assert.deepEqual(rows, [{ id: 1, email: 'a@x.cl' }]);
    });
});

test('a duplicate key raises ER_DUP_ENTRY, like mysql2', async () => {
    await withDb(async (db) => {
        await db.execute('INSERT INTO t (email) VALUES (?)', ['a@x.cl']);
        await assert.rejects(db.execute('INSERT INTO t (email) VALUES (?)', ['a@x.cl']), { code: 'ER_DUP_ENTRY' });
    });
});

test('a missing table raises ER_NO_SUCH_TABLE, like mysql2', async () => {
    await withDb(async (db) => {
        await assert.rejects(db.execute('SELECT * FROM nope'), { code: 'ER_NO_SUCH_TABLE' });
    });
});

test('a rolled back transaction leaves no rows; a committed one keeps them', async () => {
    await withDb(async (db) => {
        const a = await db.getConnection();
        await a.beginTransaction();
        await a.execute('INSERT INTO t (email) VALUES (?)', ['rolled@x.cl']);
        await a.rollback();
        a.release();

        const b = await db.getConnection();
        await b.beginTransaction();
        await b.execute('INSERT INTO t (email) VALUES (?)', ['kept@x.cl']);
        await b.commit();
        b.release();

        const [rows] = await db.execute('SELECT email FROM t');
        assert.deepEqual(rows.map((r) => r.email), ['kept@x.cl']);
    });
});

test('queries outside a transaction wait until it is released', async () => {
    await withDb(async (db) => {
        const conn = await db.getConnection();
        await conn.beginTransaction();
        await conn.execute('INSERT INTO t (email) VALUES (?)', ['tx@x.cl']);
        const outside = db.execute('SELECT COUNT(*) AS n FROM t');
        await conn.rollback();
        conn.release();
        const [[{ n }]] = await outside;
        assert.equal(n, 0, 'the outside query must not see uncommitted rows');
    });
});
