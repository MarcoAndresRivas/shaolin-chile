const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const bcrypt = require('bcrypt');
const knexFactory = require('knex');
const { upsertUser, requireEnv } = require('../src/seedUser');

const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');

function memoryDb() {
    return knexFactory({
        client: 'sqlite3',
        connection: { filename: ':memory:' },
        useNullAsDefault: true,
        migrations: { directory: MIGRATIONS_DIR },
        pool: {
            afterCreate: (conn, done) => conn.run('PRAGMA foreign_keys = ON', done),
        },
    });
}

async function roleNames(knex) {
    return (await knex('roles').select('nombre')).map((r) => r.nombre).sort();
}

test('migrations build the whole schema on an empty database', async () => {
    const knex = memoryDb();
    try {
        await knex.migrate.latest();
        for (const table of [
            'roles', 'usuarios', 'detalles_alumno', 'horarios', 'reservas_alumno', 'representantes',
            'usuario_roles', 'familias', 'familia_miembros', 'consentimientos',
        ]) {
            assert.ok(await knex.schema.hasTable(table), `missing table ${table}`);
        }
        assert.deepEqual(await roleNames(knex), [
            'Administrador', 'Alumno', 'Apoderado', 'Colaborador', 'Desarrollador', 'Director',
            'Encargado de catálogo', 'Encargado de contenido', 'Externo', 'Instructor',
        ]);
    } finally {
        await knex.destroy();
    }
});

test('the baseline keeps existing tables and data, and backfills usuario_roles', async () => {
    const knex = memoryDb();
    try {
        // Simulate the production database created by the old setup scripts.
        await knex.schema.createTable('roles', (t) => {
            t.increments('id');
            t.string('nombre', 50).notNullable().unique();
        });
        await knex('roles').insert([
            { id: 1, nombre: 'Desarrollador' }, { id: 2, nombre: 'Administrador' },
            { id: 3, nombre: 'Colaborador' }, { id: 4, nombre: 'Externo' }, { id: 5, nombre: 'Alumno' },
        ]);
        await knex.schema.createTable('usuarios', (t) => {
            t.increments('id');
            t.string('nombre').notNullable();
            t.string('email').notNullable().unique();
            t.string('password_hash').notNullable();
            t.integer('rol_id').notNullable().references('id').inTable('roles');
            t.datetime('fecha_creacion');
        });
        await knex('usuarios').insert([
            { id: 10, nombre: 'Admin', email: 'admin@x.cl', password_hash: 'h', rol_id: 2 },
            { id: 11, nombre: 'Alumno', email: 'alumno@x.cl', password_hash: 'h', rol_id: 5 },
        ]);

        await knex.migrate.latest();

        assert.equal((await knex('usuarios')).length, 2);
        const links = await knex('usuario_roles').orderBy('usuario_id');
        assert.deepEqual(links.map((l) => [l.usuario_id, l.rol_id]), [[10, 2], [11, 5]]);
        assert.equal((await knex('roles').where({ nombre: 'Instructor' })).length, 1);
    } finally {
        await knex.destroy();
    }
});

test('a user can hold several roles, but not the same role twice', async () => {
    const knex = memoryDb();
    try {
        await knex.migrate.latest();
        const [userId] = await knex('usuarios').insert({ nombre: 'Benja', email: 'b@x.cl', password_hash: 'h', rol_id: 5 });
        const ids = Object.fromEntries((await knex('roles')).map((r) => [r.nombre, r.id]));
        await knex('usuario_roles').insert([
            { usuario_id: userId, rol_id: ids.Alumno },
            { usuario_id: userId, rol_id: ids.Instructor },
        ]);
        assert.equal((await knex('usuario_roles').where({ usuario_id: userId })).length, 2);
        await assert.rejects(knex('usuario_roles').insert({ usuario_id: userId, rol_id: ids.Alumno }));
    } finally {
        await knex.destroy();
    }
});

test('families group a guardian and students, and consents record who accepted what', async () => {
    const knex = memoryDb();
    try {
        await knex.migrate.latest();
        const [guardian] = await knex('usuarios').insert({ nombre: 'Apoderado', email: 'a@x.cl', password_hash: 'h', rol_id: 5 });
        const [child] = await knex('usuarios').insert({ nombre: 'Hijo', email: 'h@x.cl', password_hash: 'h', rol_id: 5 });
        const [familyId] = await knex('familias').insert({ nombre: 'Familia Pérez' });
        await knex('familia_miembros').insert([
            { familia_id: familyId, usuario_id: guardian, rol_en_familia: 'apoderado' },
            { familia_id: familyId, usuario_id: child, rol_en_familia: 'alumno' },
        ]);
        await knex('consentimientos').insert({
            usuario_id: child, otorgado_por_id: guardian, tipo: 'uso_imagen', version_texto: 'v1', aceptado: true,
        });
        const [consent] = await knex('consentimientos').where({ usuario_id: child });
        assert.equal(consent.otorgado_por_id, guardian);
        assert.ok(consent.fecha, 'consent must store when it was given');
        await assert.rejects(
            knex('consentimientos').insert({ usuario_id: child, tipo: 'otra_cosa', version_texto: 'v1', aceptado: true }),
        );
    } finally {
        await knex.destroy();
    }
});

test('rolling back the roles migration removes its tables but keeps users', async () => {
    const knex = memoryDb();
    try {
        await knex.migrate.latest();
        await knex('usuarios').insert({ nombre: 'Admin', email: 'admin@x.cl', password_hash: 'h', rol_id: 2 });
        await knex.migrate.down();
        assert.equal(await knex.schema.hasTable('usuario_roles'), false);
        assert.equal(await knex.schema.hasTable('consentimientos'), false);
        assert.equal((await knex('usuarios')).length, 1);
        assert.equal((await knex('roles').where({ nombre: 'Director' })).length, 0);
    } finally {
        await knex.destroy();
    }
});

test('requireEnv refuses to seed without the password variable', () => {
    assert.throws(() => requireEnv({}, 'SEED_ADMIN_PASSWORD'), /SEED_ADMIN_PASSWORD/);
    assert.throws(() => requireEnv({ SEED_ADMIN_PASSWORD: '  ' }, 'SEED_ADMIN_PASSWORD'), /SEED_ADMIN_PASSWORD/);
    assert.equal(requireEnv({ SEED_ADMIN_PASSWORD: 's3cret' }, 'SEED_ADMIN_PASSWORD'), 's3cret');
});

test('upsertUser creates a user with a hashed password and its roles, and is idempotent', async () => {
    const knex = memoryDb();
    try {
        await knex.migrate.latest();
        const user = { nombre: 'Benja', email: 'benja@x.cl', password: 'first-pass', roles: ['Administrador', 'Instructor'] };
        const id = await upsertUser(knex, user);
        await upsertUser(knex, { ...user, password: 'second-pass' });

        const rows = await knex('usuarios').where({ email: 'benja@x.cl' });
        assert.equal(rows.length, 1);
        assert.equal(rows[0].id, id);
        assert.notEqual(rows[0].password_hash, 'second-pass');
        assert.ok(await bcrypt.compare('second-pass', rows[0].password_hash));
        const administrador = await knex('roles').where({ nombre: 'Administrador' }).first();
        assert.equal(rows[0].rol_id, administrador.id, 'legacy rol_id keeps the first role');

        const roles = await knex('usuario_roles')
            .join('roles', 'roles.id', 'usuario_roles.rol_id')
            .where({ usuario_id: id })
            .pluck('roles.nombre');
        assert.deepEqual(roles.sort(), ['Administrador', 'Instructor']);
    } finally {
        await knex.destroy();
    }
});

test('upsertUser rejects an unknown role', async () => {
    const knex = memoryDb();
    try {
        await knex.migrate.latest();
        await assert.rejects(
            upsertUser(knex, { nombre: 'X', email: 'x@x.cl', password: 'p', roles: ['Rey'] }),
            /Rey/,
        );
    } finally {
        await knex.destroy();
    }
});
