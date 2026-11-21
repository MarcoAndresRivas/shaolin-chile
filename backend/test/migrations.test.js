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

test('the roles migration can be re-run after a partial failure', async () => {
    const knex = memoryDb();
    try {
        await knex.migrate.up(); // baseline only
        await knex('usuarios').insert({ id: 10, nombre: 'Admin', email: 'admin@x.cl', password_hash: 'h', rol_id: 2 });
        // MySQL commits DDL immediately, so a failed run can leave a table and
        // some rows behind without recording the migration.
        await knex.schema.createTable('usuario_roles', (t) => {
            t.integer('usuario_id').notNullable();
            t.integer('rol_id').notNullable();
            t.primary(['usuario_id', 'rol_id']);
        });
        await knex('usuario_roles').insert({ usuario_id: 10, rol_id: 2 });
        await knex('roles').insert({ nombre: 'Director' });

        await knex.migrate.latest();

        assert.deepEqual(
            (await knex('usuario_roles')).map((l) => [l.usuario_id, l.rol_id]),
            [[10, 2]],
        );
        assert.equal((await knex('roles').where({ nombre: 'Director' })).length, 1);
        assert.ok(await knex.schema.hasTable('consentimientos'));
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

// knex.migrate.down() undoes only the latest migration: repeat until `name` is undone.
async function rollBackThrough(knex, name) {
    for (;;) {
        const [, undone] = await knex.migrate.down();
        if (!undone.length) throw new Error(`${name} was never rolled back`);
        if (undone.some((file) => file.endsWith(name))) return;
    }
}

test('rolling back the roles migration removes its tables but keeps users', async () => {
    const knex = memoryDb();
    try {
        await knex.migrate.latest();
        await knex('usuarios').insert({ nombre: 'Admin', email: 'admin@x.cl', password_hash: 'h', rol_id: 2 });
        await rollBackThrough(knex, '20261113000002_roles_familias_consentimientos.js');
        assert.equal(await knex.schema.hasTable('usuario_roles'), false);
        assert.equal(await knex.schema.hasTable('consentimientos'), false);
        assert.equal((await knex('usuarios')).length, 1);
        assert.equal((await knex('roles').where({ nombre: 'Director' })).length, 0);
    } finally {
        await knex.destroy();
    }
});

test('deleting a guardian never rewrites a consent they gave', async () => {
    const knex = memoryDb();
    try {
        await knex.migrate.latest();
        const [guardian] = await knex('usuarios').insert({ nombre: 'Apoderado', email: 'a@x.cl', password_hash: 'h', rol_id: 5 });
        const [child] = await knex('usuarios').insert({ nombre: 'Hijo', email: 'h@x.cl', password_hash: 'h', rol_id: 5 });
        await knex('consentimientos').insert({
            usuario_id: child, otorgado_por_id: guardian, tipo: 'datos_salud', version_texto: 'v1', aceptado: true,
        });
        await assert.rejects(knex('usuarios').where({ id: guardian }).del());
        const [consent] = await knex('consentimientos').where({ usuario_id: child });
        assert.equal(consent.otorgado_por_id, guardian);
    } finally {
        await knex.destroy();
    }
});

test('rolling back the roles migration refuses when consents or families exist', async () => {
    const knex = memoryDb();
    try {
        await knex.migrate.latest();
        const [userId] = await knex('usuarios').insert({ nombre: 'A', email: 'a@x.cl', password_hash: 'h', rol_id: 5 });
        await knex('consentimientos').insert({ usuario_id: userId, tipo: 'comunicaciones', version_texto: 'v1', aceptado: true });
        await rollBackThrough(knex, '20261113000003_escuela_clases.js');
        await assert.rejects(knex.migrate.down(), /consentimientos/);
        assert.ok(await knex.schema.hasTable('consentimientos'));
        assert.equal((await knex('consentimientos')).length, 1);
    } finally {
        await knex.destroy();
    }
});

test('the baseline adds a missing legacy role even when its old id is taken', async () => {
    const knex = memoryDb();
    try {
        await knex.schema.createTable('roles', (t) => {
            t.increments('id');
            t.string('nombre', 50).notNullable().unique();
        });
        await knex('roles').insert([{ id: 1, nombre: 'Otro' }, { id: 2, nombre: 'Administrador' }]);
        await knex.migrate.latest();
        const names = await roleNames(knex);
        for (const name of ['Desarrollador', 'Administrador', 'Colaborador', 'Externo', 'Alumno', 'Otro']) {
            assert.ok(names.includes(name), `missing role ${name}`);
        }
    } finally {
        await knex.destroy();
    }
});

test('upsertUser ignores a role named twice', async () => {
    const knex = memoryDb();
    try {
        await knex.migrate.latest();
        const id = await upsertUser(knex, { nombre: 'X', email: 'x@x.cl', password: 'p', roles: ['Alumno', 'Alumno'] });
        assert.equal((await knex('usuario_roles').where({ usuario_id: id })).length, 1);
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

test('rolling back the school migration removes its tables', async () => {
    const knex = memoryDb();
    try {
        await knex.migrate.latest();
        await rollBackThrough(knex, '20261113000003_escuela_clases.js');
        for (const table of ['sedes', 'disciplinas', 'clases', 'sesiones']) {
            assert.equal(await knex.schema.hasTable(table), false, table);
        }
        assert.ok(await knex.schema.hasTable('usuario_roles'), 'the roles migration stays');
    } finally {
        await knex.destroy();
    }
});

test('rolling back the school migration refuses when clases exist', async () => {
    const knex = memoryDb();
    try {
        await knex.migrate.latest();
        const [sedeId] = await knex('sedes').pluck('id');
        const [disciplinaId] = await knex('disciplinas').pluck('id');
        await knex('clases').insert({ sede_id: sedeId, disciplina_id: disciplinaId, dia_semana: 1, hora_inicio: '19:00', hora_fin: '20:30' });
        await rollBackThrough(knex, '20261113000004_reservas_asistencias.js');
        await assert.rejects(knex.migrate.down(), /clases/);
        assert.ok(await knex.schema.hasTable('clases'));
    } finally {
        await knex.destroy();
    }
});

test('running the school migration again does not duplicate sedes or disciplinas', async () => {
    const knex = memoryDb();
    try {
        await knex.migrate.latest();
        await rollBackThrough(knex, '20261113000003_escuela_clases.js');
        await knex.migrate.latest();
        assert.equal((await knex('sedes')).length, 3);
        assert.equal((await knex('disciplinas')).length, 3);
    } finally {
        await knex.destroy();
    }
});

test('rolling back the bookings migration removes its tables and the counter column', async () => {
    const knex = memoryDb();
    try {
        await knex.migrate.latest();
        await rollBackThrough(knex, '20261113000004_reservas_asistencias.js');
        assert.equal(await knex.schema.hasTable('reservas'), false);
        assert.equal(await knex.schema.hasTable('asistencias'), false);
        assert.equal(await knex.schema.hasColumn('sesiones', 'reservas_activas'), false);
        assert.ok(await knex.schema.hasTable('sesiones'), 'the school migration stays');
    } finally {
        await knex.destroy();
    }
});

test('rolling back the bookings migration refuses when bookings exist', async () => {
    const knex = memoryDb();
    try {
        await knex.migrate.latest();
        const [alumno] = await knex('usuarios').insert({ nombre: 'A', email: 'a@x.cl', password_hash: 'h', rol_id: 5 });
        const [sedeId] = await knex('sedes').pluck('id');
        const [disciplinaId] = await knex('disciplinas').pluck('id');
        const [claseId] = await knex('clases').insert({ sede_id: sedeId, disciplina_id: disciplinaId, dia_semana: 1, hora_inicio: '19:00', hora_fin: '20:30' });
        const [sesionId] = await knex('sesiones').insert({ clase_id: claseId, fecha: '2026-12-07' });
        await knex('reservas').insert({ sesion_id: sesionId, alumno_id: alumno });
        await rollBackThrough(knex, '20261113000005_disponibilidad_instructor.js');
        await assert.rejects(knex.migrate.down(), /reservas/);
        assert.equal((await knex('reservas')).length, 1);
    } finally {
        await knex.destroy();
    }
});

test('a sesion starts with no bookings counted', async () => {
    const knex = memoryDb();
    try {
        await knex.migrate.latest();
        const [sedeId] = await knex('sedes').pluck('id');
        const [disciplinaId] = await knex('disciplinas').pluck('id');
        const [claseId] = await knex('clases').insert({ sede_id: sedeId, disciplina_id: disciplinaId, dia_semana: 1, hora_inicio: '19:00', hora_fin: '20:30' });
        await knex('sesiones').insert({ clase_id: claseId, fecha: '2026-12-07' });
        assert.equal((await knex('sesiones').first()).reservas_activas, 0);
    } finally {
        await knex.destroy();
    }
});

test('rolling back the availability migration removes its table', async () => {
    const knex = memoryDb();
    try {
        await knex.migrate.latest();
        await rollBackThrough(knex, '20261113000005_disponibilidad_instructor.js');
        assert.equal(await knex.schema.hasTable('disponibilidad_instructor'), false);
        assert.ok(await knex.schema.hasTable('reservas'), 'the bookings migration stays');
    } finally {
        await knex.destroy();
    }
});

test('rolling back the availability migration refuses when blocks exist', async () => {
    const knex = memoryDb();
    try {
        await knex.migrate.latest();
        const [userId] = await knex('usuarios').insert({ nombre: 'I', email: 'i@x.cl', password_hash: 'h', rol_id: 3 });
        await knex('disponibilidad_instructor').insert({ instructor_id: userId, dia_semana: 1, hora_inicio: '09:00', hora_fin: '12:00' });
        await rollBackThrough(knex, '20261113000006_interesados.js');
        await assert.rejects(knex.migrate.down(), /disponibilidad_instructor/);
        assert.equal((await knex('disponibilidad_instructor')).length, 1);
    } finally {
        await knex.destroy();
    }
});

test('rolling back the interested-people migration removes its tables', async () => {
    const knex = memoryDb();
    try {
        await knex.migrate.latest();
        await rollBackThrough(knex, '20261113000006_interesados.js');
        for (const table of ['interesados', 'seguimientos', 'clases_prueba']) {
            assert.equal(await knex.schema.hasTable(table), false, table);
        }
        assert.ok(await knex.schema.hasTable('disponibilidad_instructor'), 'the availability migration stays');
    } finally {
        await knex.destroy();
    }
});

test('rolling back the interested-people migration refuses when people exist', async () => {
    const knex = memoryDb();
    try {
        await knex.migrate.latest();
        await knex('interesados').insert({ nombre: 'Juan', email: 'j@x.cl', consentimiento: true });
        await rollBackThrough(knex, '20261113000007_finanzas.js');
        await assert.rejects(knex.migrate.down(), /interesados/);
        assert.equal((await knex('interesados')).length, 1);
    } finally {
        await knex.destroy();
    }
});

test('rolling back the finance migration removes its tables', async () => {
    const knex = memoryDb();
    try {
        await knex.migrate.latest();
        await rollBackThrough(knex, '20261113000007_finanzas.js');
        for (const table of ['planes', 'suscripciones', 'cargos', 'pagos']) {
            assert.equal(await knex.schema.hasTable(table), false, table);
        }
        assert.ok(await knex.schema.hasTable('interesados'), 'the interested-people migration stays');
    } finally {
        await knex.destroy();
    }
});

test('rolling back the finance migration refuses when financial records exist', async () => {
    const knex = memoryDb();
    try {
        await knex.migrate.latest();
        await knex('planes').insert({ nombre: 'Mensual', monto: 30000, periodicidad: 'mensual' });
        await rollBackThrough(knex, '20261113000008_grados_examenes.js'); // what comes after is empty
        await assert.rejects(knex.migrate.down(), /planes/);
        assert.equal((await knex('planes')).length, 1);
    } finally {
        await knex.destroy();
    }
});

test('a charge is generated once per subscription and period', async () => {
    const knex = memoryDb();
    try {
        await knex.migrate.latest();
        const [alumno] = await knex('usuarios').insert({ nombre: 'A', email: 'a@x.cl', password_hash: 'h', rol_id: 5 });
        const [plan] = await knex('planes').insert({ nombre: 'Mensual', monto: 30000, periodicidad: 'mensual' });
        const [sub] = await knex('suscripciones').insert({ alumno_id: alumno, plan_id: plan, fecha_inicio: '2026-11-01' });
        const row = { alumno_id: alumno, suscripcion_id: sub, concepto: 'Mensual 2026-11', monto: 30000, periodo: '2026-11', fecha_emision: '2026-11-01', fecha_vencimiento: '2026-11-10' };
        await knex('cargos').insert(row);
        await assert.rejects(knex('cargos').insert(row), 'the database refuses a second charge for the same period');
        // Manual charges have no subscription and may repeat.
        const manual = { ...row, suscripcion_id: null, periodo: null };
        await knex('cargos').insert(manual);
        await knex('cargos').insert(manual);
        assert.equal((await knex('cargos')).length, 3);
    } finally {
        await knex.destroy();
    }
});

test('rolling back the assistant migration removes its table, unless it holds conversations', async () => {
    const knex = memoryDb();
    try {
        await knex.migrate.latest();
        await rollBackThrough(knex, '20261120000010_ventas.js');
        await knex('conversaciones_asistente').insert({ canal: 'sitio', chat_id: 'c1', rol: 'persona', texto: 'Hola' });
        await assert.rejects(knex.migrate.down(), /conversaciones_asistente/);
        await knex('conversaciones_asistente').del();
        await knex.migrate.down();
        assert.equal(await knex.schema.hasTable('conversaciones_asistente'), false);
        assert.ok(await knex.schema.hasTable('grados'), 'the grades migration stays');
    } finally {
        await knex.destroy();
    }
});

test('rolling back the grades migration removes its tables', async () => {
    const knex = memoryDb();
    try {
        await knex.migrate.latest();
        await rollBackThrough(knex, '20261113000009_asistente.js');
        await knex.migrate.down();
        for (const table of ['grados', 'examenes', 'historial_grados', 'inscripciones_examen']) {
            assert.equal(await knex.schema.hasTable(table), false, table);
        }
        assert.ok(await knex.schema.hasTable('pagos'), 'the finance migration stays');
    } finally {
        await knex.destroy();
    }
});

test('rolling back the grades migration refuses when grades exist', async () => {
    const knex = memoryDb();
    try {
        await knex.migrate.latest();
        const [disciplinaId] = await knex('disciplinas').pluck('id');
        await knex('grados').insert({ disciplina_id: disciplinaId, orden: 1, nombre: 'Blanco' });
        await rollBackThrough(knex, '20261113000009_asistente.js');
        await assert.rejects(knex.migrate.down(), /grados/);
        assert.equal((await knex('grados')).length, 1);
    } finally {
        await knex.destroy();
    }
});

test('a discipline cannot have two grades in the same position, nor a student the same nomination twice', async () => {
    const knex = memoryDb();
    try {
        await knex.migrate.latest();
        const [disciplinaId] = await knex('disciplinas').pluck('id');
        const [gradoId] = await knex('grados').insert({ disciplina_id: disciplinaId, orden: 1, nombre: 'Blanco' });
        await assert.rejects(knex('grados').insert({ disciplina_id: disciplinaId, orden: 1, nombre: 'Otro' }));
        const [alumno] = await knex('usuarios').insert({ nombre: 'A', email: 'a@x.cl', password_hash: 'h', rol_id: 5 });
        const [examenId] = await knex('examenes').insert({ fecha: '2026-12-05' });
        await knex('inscripciones_examen').insert({ examen_id: examenId, alumno_id: alumno, grado_id: gradoId });
        await assert.rejects(knex('inscripciones_examen').insert({ examen_id: examenId, alumno_id: alumno, grado_id: gradoId }));
    } finally {
        await knex.destroy();
    }
});

test('rolling back the products migration removes its tables and column, unless products exist', async () => {
    const knex = memoryDb();
    try {
        await knex.migrate.latest();
        const [id] = await knex('productos').insert({ titulo: 'Polera', precio: 12000 });
        await assert.rejects(rollBackThrough(knex, '20261121000012_productos.js'), /productos/);
        assert.ok(await knex.schema.hasTable('productos'));
        await knex('productos').where({ id }).del();
        await rollBackThrough(knex, '20261121000012_productos.js');
        assert.equal(await knex.schema.hasTable('productos'), false);
        assert.equal(await knex.schema.hasTable('producto_tallas'), false);
        assert.equal(await knex.schema.hasColumn('compra_items', 'producto_talla_id'), false);
        assert.ok(await knex.schema.hasTable('compras'), 'the sales migration stays');
    } finally {
        await knex.destroy();
    }
});

test('rolling back the Duan Pin migration removes its columns, unless levels or exam scores exist', async () => {
    const knex = memoryDb();
    try {
        await knex.migrate.latest();
        const [disciplina] = await knex('disciplinas').select('id');
        const [gradoId] = await knex('grados').insert({ disciplina_id: disciplina.id, orden: 1, nombre: '1.º Duan', serie: 'duan', nivel: 1 });
        await assert.rejects(rollBackThrough(knex, '20261121000014_duan_pin.js'), /Duan Pin/);
        await knex('grados').where({ id: gradoId }).update({ serie: null });
        await rollBackThrough(knex, '20261121000014_duan_pin.js');
        for (const column of ['serie', 'nivel', 'etapa', 'grado_pin', 'edad_minima', 'formas', 'requiere_teoria', 'requiere_combate']) {
            assert.equal(await knex.schema.hasColumn('grados', column), false, column);
        }
        for (const column of ['conducta_ok', 'nota_tecnica', 'nota_teoria', 'combate_ok', 'evaluadores', 'observaciones']) {
            assert.equal(await knex.schema.hasColumn('inscripciones_examen', column), false, column);
        }
        assert.equal(Number((await knex('grados').count({ n: '*' }).first()).n), 1, 'the grade row stays');
    } finally {
        await knex.destroy();
    }
});

test('the sedes migration deactivates Santiago and Talca, and rolling it back reactivates them', async () => {
    const knex = memoryDb();
    try {
        await knex.migrate.latest();
        const active = async () => (await knex('sedes').select('ciudad', 'activa').orderBy('id')).map((s) => [s.ciudad, Boolean(s.activa)]);
        assert.deepEqual(await active(), [['Concepción', true], ['Santiago', false], ['Talca', false]]);
        await knex.migrate.latest();
        assert.deepEqual(await active(), [['Concepción', true], ['Santiago', false], ['Talca', false]], 'running it again changes nothing');
        await rollBackThrough(knex, '20261121000011_sedes_solo_concepcion.js');
        assert.deepEqual(await active(), [['Concepción', true], ['Santiago', true], ['Talca', true]]);
    } finally {
        await knex.destroy();
    }
});

test('rolling back the sales migration removes its tables, unless they hold sales', async () => {
    const knex = memoryDb();
    try {
        await knex.migrate.latest();
        const [id] = await knex('seminarios').insert({ titulo: 'Seminario', estado: 'publicado' });
        // Undoes the later migrations too (sedes, products, Duan Pin), down to the sales one.
        await rollBackThrough(knex, '20261121000011_sedes_solo_concepcion.js');
        await assert.rejects(knex.migrate.down(), /seminarios/);
        await knex('seminarios').where({ id }).del();
        await knex.migrate.down();
        for (const table of ['seminarios', 'seminario_dias', 'cursos', 'curso_lecciones', 'compras', 'compra_items']) {
            assert.equal(await knex.schema.hasTable(table), false, table);
        }
        assert.ok(await knex.schema.hasTable('conversaciones_asistente'), 'the assistant migration stays');
    } finally {
        await knex.destroy();
    }
});
