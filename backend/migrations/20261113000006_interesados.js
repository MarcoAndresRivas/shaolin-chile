// Fase 2, T4: people interested in the school, their follow-up notes and their
// trial classes. The public form records a person together with their consent
// and the moment they gave it.
//
// A trial class does not take a booking place (it is not tied to a user
// account); it only links the person to a sesion.
//
// Safe to repeat (MySQL commits DDL immediately).

const { isUnsignedKey, foreignId, createTableIfMissing } = require('../src/db/schemaHelpers');

exports.up = async function up(knex) {
    const usuariosUnsigned = await isUnsignedKey(knex, 'usuarios');
    const sedesUnsigned = await isUnsignedKey(knex, 'sedes');
    const disciplinasUnsigned = await isUnsignedKey(knex, 'disciplinas');
    const sesionesUnsigned = await isUnsignedKey(knex, 'sesiones');

    await createTableIfMissing(knex, 'interesados', (t) => {
        t.increments('id');
        t.string('nombre', 255).notNullable();
        t.string('email', 255).notNullable().index();
        t.string('telefono', 40).nullable();
        foreignId(t, 'sede_id', sedesUnsigned).nullable().references('id').inTable('sedes').onDelete('SET NULL');
        foreignId(t, 'disciplina_id', disciplinasUnsigned).nullable().references('id').inTable('disciplinas').onDelete('SET NULL');
        t.text('mensaje').nullable();
        t.string('origen', 20).notNullable().defaultTo('sitio'); // sitio | instagram | referido | otro
        t.string('estado', 20).notNullable().defaultTo('nuevo'); // nuevo | contactado | clase_prueba | inscrito | descartado
        t.boolean('consentimiento').notNullable();
        t.datetime('consentimiento_fecha').nullable();
        t.datetime('fecha_creacion').defaultTo(knex.fn.now());
    });
    const interesadosUnsigned = await isUnsignedKey(knex, 'interesados');

    await createTableIfMissing(knex, 'seguimientos', (t) => {
        t.increments('id');
        foreignId(t, 'interesado_id', interesadosUnsigned).notNullable().references('id').inTable('interesados').onDelete('CASCADE');
        foreignId(t, 'usuario_id', usuariosUnsigned).nullable().references('id').inTable('usuarios').onDelete('SET NULL');
        t.text('nota').notNullable();
        t.datetime('fecha').defaultTo(knex.fn.now());
    });

    await createTableIfMissing(knex, 'clases_prueba', (t) => {
        t.increments('id');
        foreignId(t, 'interesado_id', interesadosUnsigned).notNullable().references('id').inTable('interesados').onDelete('CASCADE');
        foreignId(t, 'sesion_id', sesionesUnsigned).nullable().references('id').inTable('sesiones').onDelete('SET NULL');
        t.string('estado', 20).notNullable().defaultTo('agendada'); // agendada | asistio | no_asistio | cancelada
        t.datetime('fecha_creacion').defaultTo(knex.fn.now());
    });
};

exports.down = async function down(knex) {
    for (const table of ['interesados', 'seguimientos', 'clases_prueba']) {
        if ((await knex.schema.hasTable(table)) && (await knex(table).first())) {
            throw new Error(`Refusing to roll back: ${table} holds data.`);
        }
    }
    await knex.schema.dropTableIfExists('clases_prueba');
    await knex.schema.dropTableIfExists('seguimientos');
    await knex.schema.dropTableIfExists('interesados');
};
