// Fase 2, T3: the weekly hours each instructor can teach. A day can hold
// several blocks; the API keeps them from overlapping.
//
// Safe to repeat (MySQL commits DDL immediately).

const { isUnsignedKey, foreignId, createTableIfMissing } = require('../src/db/schemaHelpers');

exports.up = async function up(knex) {
    const usuariosUnsigned = await isUnsignedKey(knex, 'usuarios');
    await createTableIfMissing(knex, 'disponibilidad_instructor', (t) => {
        t.increments('id');
        foreignId(t, 'instructor_id', usuariosUnsigned).notNullable().references('id').inTable('usuarios').onDelete('CASCADE');
        t.integer('dia_semana').notNullable(); // 1 = Monday ... 7 = Sunday
        t.string('hora_inicio', 5).notNullable();
        t.string('hora_fin', 5).notNullable();
    });
};

exports.down = async function down(knex) {
    if ((await knex.schema.hasTable('disponibilidad_instructor')) && (await knex('disponibilidad_instructor').first())) {
        throw new Error('Refusing to roll back: disponibilidad_instructor holds data.');
    }
    await knex.schema.dropTableIfExists('disponibilidad_instructor');
};
