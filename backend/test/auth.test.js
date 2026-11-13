const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { createApp } = require('../src/app');
const { withServer } = require('./helpers');

const SECRET = 'a-long-random-secret-used-only-in-tests-0123456789';
const config = { jwtSecret: SECRET, corsOrigins: ['https://marcoandresrivas.github.io'] };

// Minimal stand-in for the mysql2 pool: answers by SQL text and records writes.
function fakeDb({ user, roles = [] } = {}) {
    const writes = [];
    const execute = async (sql, params = []) => {
        if (/FROM usuarios WHERE email/i.test(sql)) return [user ? [user] : []];
        if (/FROM usuario_roles/i.test(sql)) return [roles.map((nombre) => ({ nombre }))];
        if (/^\s*INSERT/i.test(sql)) {
            writes.push({ sql, params });
            return [{ insertId: 42 }];
        }
        return [[]];
    };
    const connection = {
        execute,
        beginTransaction: async () => writes.push({ sql: 'BEGIN' }),
        commit: async () => writes.push({ sql: 'COMMIT' }),
        rollback: async () => writes.push({ sql: 'ROLLBACK' }),
        release: () => {},
    };
    return { execute, getConnection: async () => connection, writes };
}

function token(payload, secret = SECRET) {
    return `Bearer ${jwt.sign(payload, secret, { expiresIn: '1h' })}`;
}

async function call(db, method, path, { auth, body } = {}) {
    return withServer(createApp({ config, db }), async (baseUrl) => {
        const res = await fetch(`${baseUrl}${path}`, {
            method,
            headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: auth } : {}) },
            body: body ? JSON.stringify(body) : undefined,
        });
        return { status: res.status, body: await res.json() };
    });
}

test('login returns the same fields as before plus the user roles, signed with JWT_SECRET', async () => {
    const user = { id: 7, nombre: 'Benja', rol_id: 2, password_hash: await bcrypt.hash('pw', 4) };
    const db = fakeDb({ user, roles: ['Administrador', 'Instructor'] });

    const res = await call(db, 'POST', '/api/login', { body: { email: 'b@x.cl', password: 'pw' } });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.rol_id, 2);
    assert.equal(res.body.nombre, 'Benja');
    assert.deepEqual(res.body.roles, ['Administrador', 'Instructor']);
    const decoded = jwt.verify(res.body.token, SECRET);
    assert.equal(decoded.id, 7);
    assert.deepEqual(decoded.roles, ['Administrador', 'Instructor']);
});

test('login works before the migrations run, using the legacy role', async () => {
    const user = { id: 7, nombre: 'Admin', rol_id: 2, password_hash: await bcrypt.hash('pw', 4) };
    const db = fakeDb({ user });
    const execute = db.execute;
    db.execute = async (sql, params) => {
        if (/FROM usuario_roles/i.test(sql)) throw Object.assign(new Error('missing'), { code: 'ER_NO_SUCH_TABLE' });
        return execute(sql, params);
    };
    const res = await call(db, 'POST', '/api/login', { body: { email: 'a@x.cl', password: 'pw' } });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.roles, ['Administrador']);
});

test('login still rejects a wrong password', async () => {
    const user = { id: 7, nombre: 'Benja', rol_id: 2, password_hash: await bcrypt.hash('pw', 4) };
    const res = await call(fakeDb({ user }), 'POST', '/api/login', { body: { email: 'b@x.cl', password: 'nope' } });
    assert.equal(res.status, 401);
    assert.equal(res.body.error, 'Credenciales inválidas.');
});

test('a token signed with the old public fallback secret is rejected', async () => {
    const res = await call(fakeDb(), 'GET', '/api/intranet/horarios', {
        auth: token({ id: 1, rol_id: 2, roles: ['Administrador'] }, 'fallback_secret'),
    });
    assert.equal(res.status, 401);
});

test('admin routes accept Director and Administrador roles', async () => {
    for (const role of ['Director', 'Administrador']) {
        const res = await call(fakeDb(), 'GET', '/api/intranet/usuarios', { auth: token({ id: 1, rol_id: 5, roles: [role] }) });
        assert.equal(res.status, 200, role);
    }
});

test('admin routes reject users without an admin role', async () => {
    const res = await call(fakeDb(), 'GET', '/api/intranet/usuarios', {
        auth: token({ id: 1, rol_id: 5, roles: ['Instructor', 'Alumno'] }),
    });
    assert.equal(res.status, 403);
});

test('tokens issued before roles existed keep their previous permissions', async () => {
    const admin = await call(fakeDb(), 'GET', '/api/intranet/usuarios', { auth: token({ id: 1, rol_id: 1 }) });
    assert.equal(admin.status, 200);
    const student = await call(fakeDb(), 'GET', '/api/intranet/usuarios', { auth: token({ id: 1, rol_id: 5 }) });
    assert.equal(student.status, 403);
    const booking = await call(fakeDb(), 'POST', '/api/intranet/reservar', {
        auth: token({ id: 3, rol_id: 5 }), body: { horario_id: 9 },
    });
    assert.equal(booking.status, 201);
});

test('a user who is both student and instructor can book a class', async () => {
    const db = fakeDb();
    const res = await call(db, 'POST', '/api/intranet/reservar', {
        auth: token({ id: 3, rol_id: 5, roles: ['Alumno', 'Instructor'] }), body: { horario_id: 9 },
    });
    assert.equal(res.status, 201);
    assert.deepEqual(db.writes[0].params, [3, 9]);
});

test('only students can book a class', async () => {
    const res = await call(fakeDb(), 'POST', '/api/intranet/reservar', {
        auth: token({ id: 3, rol_id: 2, roles: ['Instructor'] }), body: { horario_id: 9 },
    });
    assert.equal(res.status, 403);
    assert.equal(res.body.error, 'Solo los alumnos pueden reservar horarios.');
});

test('creating a user also grants its role in usuario_roles, in one transaction', async () => {
    const db = fakeDb();
    const res = await call(db, 'POST', '/api/intranet/usuarios', {
        auth: token({ id: 1, rol_id: 2, roles: ['Administrador'] }),
        body: { nombre: 'Nuevo', email: 'n@x.cl', password: 'pw', rol_id: 5 },
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.id, 42);
    const sqls = db.writes.map((w) => w.sql);
    assert.equal(sqls[0], 'BEGIN');
    assert.match(sqls[1], /INSERT INTO usuarios/);
    assert.match(sqls[2], /INSERT INTO usuario_roles/);
    assert.deepEqual(db.writes[2].params, [42, 5]);
    assert.equal(sqls[3], 'COMMIT');
});
