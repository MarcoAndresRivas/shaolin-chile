// Baseline: the schema the old setup scripts created (setup_db.js,
// setup_intranet_db.js, database_schema.sql). Every table is created only if
// it does not exist yet, so running this on the production database, where
// the tables already exist, changes nothing and only records the migration.

const LEGACY_ROLES = [
    { id: 1, nombre: 'Desarrollador' },
    { id: 2, nombre: 'Administrador' },
    { id: 3, nombre: 'Colaborador' },
    { id: 4, nombre: 'Externo' },
    { id: 5, nombre: 'Alumno' },
];

const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

async function createIfMissing(knex, name, build) {
    if (!(await knex.schema.hasTable(name))) {
        await knex.schema.createTable(name, build);
    }
}

exports.up = async function up(knex) {
    await createIfMissing(knex, 'representantes', (t) => {
        t.increments('id');
        t.string('nombre', 255).notNullable();
        t.string('email', 255).notNullable();
        t.string('sede', 255).notNullable();
        t.text('mensaje');
        t.datetime('fecha_registro').defaultTo(knex.fn.now());
    });

    await createIfMissing(knex, 'roles', (t) => {
        t.increments('id');
        t.string('nombre', 50).notNullable().unique();
    });
    const existing = new Set(await knex('roles').pluck('nombre'));
    const missing = LEGACY_ROLES.filter((r) => !existing.has(r.nombre));
    if (missing.length) await knex('roles').insert(missing);

    await createIfMissing(knex, 'usuarios', (t) => {
        t.increments('id');
        t.string('nombre', 255).notNullable();
        t.string('email', 255).notNullable().unique();
        t.string('password_hash', 255).notNullable();
        t.integer('rol_id').unsigned().notNullable().references('id').inTable('roles');
        t.datetime('fecha_creacion').defaultTo(knex.fn.now());
    });

    await createIfMissing(knex, 'detalles_alumno', (t) => {
        t.integer('usuario_id').unsigned().primary().references('id').inTable('usuarios').onDelete('CASCADE');
        t.integer('ano_ingreso');
        t.date('fecha_nacimiento');
        t.string('telefono', 50);
    });

    await createIfMissing(knex, 'horarios', (t) => {
        t.increments('id');
        t.string('titulo', 255).notNullable();
        t.text('descripcion');
        t.enu('dia_semana', DIAS).notNullable();
        t.time('hora_inicio').notNullable();
        t.time('hora_fin').notNullable();
        t.integer('creador_id').unsigned().notNullable().references('id').inTable('usuarios');
        t.integer('cupo_maximo').defaultTo(20);
    });

    await createIfMissing(knex, 'reservas_alumno', (t) => {
        t.integer('alumno_id').unsigned().notNullable().references('id').inTable('usuarios').onDelete('CASCADE');
        t.integer('horario_id').unsigned().notNullable().references('id').inTable('horarios').onDelete('CASCADE');
        t.enu('estado', ['Activo', 'Inactivo']).defaultTo('Activo');
        t.datetime('fecha_reserva').defaultTo(knex.fn.now());
        t.primary(['alumno_id', 'horario_id']);
    });
};

exports.down = async function down() {
    // Rolling back the baseline would drop production data. Refuse.
    throw new Error('The baseline migration cannot be rolled back.');
};
