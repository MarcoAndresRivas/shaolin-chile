// Fase 2, T8: what the virtual assistant and each person said, one row per
// message. A conversation is a chat_id inside a canal; it is linked to the
// interested person once the assistant knows who they are.
//
// Safe to repeat (MySQL commits DDL immediately).

const { isUnsignedKey, foreignId, createTableIfMissing } = require('../src/db/schemaHelpers');

exports.up = async function up(knex) {
    const interesadosUnsigned = await isUnsignedKey(knex, 'interesados');
    await createTableIfMissing(knex, 'conversaciones_asistente', (t) => {
        t.increments('id');
        t.string('canal', 20).notNullable(); // sitio | instagram
        t.string('chat_id', 100).notNullable();
        foreignId(t, 'interesado_id', interesadosUnsigned).nullable().references('id').inTable('interesados').onDelete('CASCADE');
        t.string('rol', 20).notNullable(); // persona | asistente
        t.text('texto').notNullable();
        t.datetime('fecha').defaultTo(knex.fn.now());
        t.index(['canal', 'chat_id']);
    });
};

exports.down = async function down(knex) {
    if ((await knex.schema.hasTable('conversaciones_asistente')) && (await knex('conversaciones_asistente').first())) {
        throw new Error('Refusing to roll back: conversaciones_asistente holds data.');
    }
    await knex.schema.dropTableIfExists('conversaciones_asistente');
};
