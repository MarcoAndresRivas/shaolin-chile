// Fase 2, T7: grades, the history of each student's grades, exams and the
// nominations to them.
//
// The content of each grade (minimum classes, months in the grade, techniques)
// is defined by the instructor principal, so no grade is preloaded.
//
// Safe to repeat (MySQL commits DDL immediately).

const { isUnsignedKey, foreignId, createTableIfMissing } = require('../src/db/schemaHelpers');

exports.up = async function up(knex) {
    const usuariosUnsigned = await isUnsignedKey(knex, 'usuarios');
    const disciplinasUnsigned = await isUnsignedKey(knex, 'disciplinas');
    const sedesUnsigned = await isUnsignedKey(knex, 'sedes');

    await createTableIfMissing(knex, 'grados', (t) => {
        t.increments('id');
        foreignId(t, 'disciplina_id', disciplinasUnsigned).notNullable().references('id').inTable('disciplinas');
        t.integer('orden').notNullable(); // 1 = first grade of the discipline
        t.string('nombre', 120).notNullable();
        t.integer('clases_minimas').notNullable().defaultTo(0);
        t.integer('meses_minimos').notNullable().defaultTo(0);
        t.text('tecnicas').nullable();
        t.unique(['disciplina_id', 'orden']);
    });
    const gradosUnsigned = await isUnsignedKey(knex, 'grados');

    await createTableIfMissing(knex, 'examenes', (t) => {
        t.increments('id');
        foreignId(t, 'sede_id', sedesUnsigned).nullable().references('id').inTable('sedes').onDelete('SET NULL');
        t.string('nombre', 120).nullable();
        t.string('fecha', 10).notNullable();
        t.string('estado', 20).notNullable().defaultTo('programado'); // programado | realizado | cancelado
        t.integer('monto_derecho').nullable(); // exam fee in pesos, when it has one
    });
    const examenesUnsigned = await isUnsignedKey(knex, 'examenes');

    await createTableIfMissing(knex, 'historial_grados', (t) => {
        t.increments('id');
        foreignId(t, 'alumno_id', usuariosUnsigned).notNullable().references('id').inTable('usuarios').onDelete('CASCADE');
        foreignId(t, 'grado_id', gradosUnsigned).notNullable().references('id').inTable('grados');
        t.string('fecha', 10).notNullable();
        foreignId(t, 'examen_id', examenesUnsigned).nullable().references('id').inTable('examenes').onDelete('SET NULL');
    });

    await createTableIfMissing(knex, 'inscripciones_examen', (t) => {
        t.increments('id');
        foreignId(t, 'examen_id', examenesUnsigned).notNullable().references('id').inTable('examenes').onDelete('CASCADE');
        foreignId(t, 'alumno_id', usuariosUnsigned).notNullable().references('id').inTable('usuarios').onDelete('CASCADE');
        foreignId(t, 'grado_id', gradosUnsigned).notNullable().references('id').inTable('grados');
        t.string('estado', 20).notNullable().defaultTo('nominado'); // nominado | confirmado | aprobado | reprobado | ausente
        foreignId(t, 'nominado_por', usuariosUnsigned).nullable().references('id').inTable('usuarios').onDelete('SET NULL');
        t.integer('cargo_id').nullable(); // the exam fee charged when the nomination is confirmed
        t.unique(['examen_id', 'alumno_id']);
    });
};

// Grade history is a record of the student: never dropped while it holds data.
const PROTECTED_TABLES = ['inscripciones_examen', 'historial_grados', 'examenes', 'grados'];

exports.down = async function down(knex) {
    for (const table of PROTECTED_TABLES) {
        if ((await knex.schema.hasTable(table)) && (await knex(table).first())) {
            throw new Error(`Refusing to roll back: ${table} holds data.`);
        }
    }
    for (const table of PROTECTED_TABLES) await knex.schema.dropTableIfExists(table);
};
