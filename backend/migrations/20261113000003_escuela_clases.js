// Fase 2, T1: the school (sedes, disciplinas) and its classes. A clase is the
// weekly template; a sesion is one concrete date of it, so a single day can be
// cancelled without touching the template.
//
// Dates and times are stored as text (YYYY-MM-DD and HH:MM): identical in
// SQLite and MySQL and free of time zone shifts.
//
// The legacy tables horarios and reservas_alumno are left untouched; students
// keep booking through them until their flow moves to sesiones.
//
// Every step is safe to repeat (MySQL commits DDL immediately).

const { isUnsignedKey, foreignId, createTableIfMissing } = require('../src/db/schemaHelpers');

// Official content from the school; addresses are still pending, so null.
const SEDES = [
    { nombre: 'Sede Administrativa Nacional', ciudad: 'Concepción' },
    { nombre: 'Sede Región Metropolitana', ciudad: 'Santiago' },
    { nombre: 'Sede Región del Maule', ciudad: 'Talca' },
];

const DISCIPLINAS = [
    { nombre: 'Kung Fu Tradicional', slug: 'kung-fu-tradicional' },
    { nombre: 'Sanda (Boxeo Chino)', slug: 'sanda' },
    { nombre: 'Tai Chi y Qi Gong', slug: 'tai-chi-qi-gong' },
];

exports.up = async function up(knex) {
    await createTableIfMissing(knex, 'sedes', (t) => {
        t.increments('id');
        t.string('nombre', 255).notNullable();
        t.string('ciudad', 120).notNullable();
        t.string('direccion', 255).nullable();
        t.boolean('activa').notNullable().defaultTo(true);
    });
    await createTableIfMissing(knex, 'disciplinas', (t) => {
        t.increments('id');
        t.string('nombre', 120).notNullable();
        t.string('slug', 80).notNullable().unique();
        t.boolean('activa').notNullable().defaultTo(true);
    });

    const existingSedes = new Set(await knex('sedes').pluck('ciudad'));
    const newSedes = SEDES.filter((s) => !existingSedes.has(s.ciudad));
    if (newSedes.length) await knex('sedes').insert(newSedes);

    const existingSlugs = new Set(await knex('disciplinas').pluck('slug'));
    const newDisciplinas = DISCIPLINAS.filter((d) => !existingSlugs.has(d.slug));
    if (newDisciplinas.length) await knex('disciplinas').insert(newDisciplinas);

    const usuariosUnsigned = await isUnsignedKey(knex, 'usuarios');
    const sedesUnsigned = await isUnsignedKey(knex, 'sedes');
    const disciplinasUnsigned = await isUnsignedKey(knex, 'disciplinas');

    await createTableIfMissing(knex, 'clases', (t) => {
        t.increments('id');
        foreignId(t, 'sede_id', sedesUnsigned).notNullable().references('id').inTable('sedes');
        foreignId(t, 'disciplina_id', disciplinasUnsigned).notNullable().references('id').inTable('disciplinas');
        foreignId(t, 'instructor_id', usuariosUnsigned).nullable().references('id').inTable('usuarios').onDelete('SET NULL');
        t.integer('dia_semana').notNullable(); // 1 = Monday ... 7 = Sunday
        t.string('hora_inicio', 5).notNullable();
        t.string('hora_fin', 5).notNullable();
        t.integer('cupo').notNullable().defaultTo(20);
        t.boolean('activa').notNullable().defaultTo(true);
    });
    const clasesUnsigned = await isUnsignedKey(knex, 'clases');

    await createTableIfMissing(knex, 'sesiones', (t) => {
        t.increments('id');
        foreignId(t, 'clase_id', clasesUnsigned).notNullable().references('id').inTable('clases').onDelete('CASCADE');
        t.string('fecha', 10).notNullable();
        t.string('estado', 20).notNullable().defaultTo('programada'); // programada | cancelada
        t.string('motivo', 255).nullable();
        t.unique(['clase_id', 'fecha']);
    });
};

exports.down = async function down(knex) {
    for (const table of ['sesiones', 'clases']) {
        if ((await knex.schema.hasTable(table)) && (await knex(table).first())) {
            throw new Error(`Refusing to roll back: ${table} holds data.`);
        }
    }
    await knex.schema.dropTableIfExists('sesiones');
    await knex.schema.dropTableIfExists('clases');
    await knex.schema.dropTableIfExists('disciplinas');
    await knex.schema.dropTableIfExists('sedes');
};
