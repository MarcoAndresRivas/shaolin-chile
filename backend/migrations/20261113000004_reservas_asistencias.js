// Fase 2, T2: students book a sesion and instructors take attendance.
//
// sesiones.reservas_activas counts the active bookings of a sesion. Booking
// bumps it with one guarded UPDATE (reservas_activas < cupo), which the
// database applies atomically, so two simultaneous bookings can never take
// the last place twice. It works the same on SQLite and MySQL.
//
// Every step is safe to repeat (MySQL commits DDL immediately).

const { isUnsignedKey, foreignId, createTableIfMissing } = require('../src/db/schemaHelpers');

exports.up = async function up(knex) {
    if (!(await knex.schema.hasColumn('sesiones', 'reservas_activas'))) {
        await knex.schema.alterTable('sesiones', (t) => {
            t.integer('reservas_activas').notNullable().defaultTo(0);
        });
    }

    const usuariosUnsigned = await isUnsignedKey(knex, 'usuarios');
    const sesionesUnsigned = await isUnsignedKey(knex, 'sesiones');

    await createTableIfMissing(knex, 'reservas', (t) => {
        t.increments('id');
        foreignId(t, 'sesion_id', sesionesUnsigned).notNullable().references('id').inTable('sesiones').onDelete('CASCADE');
        foreignId(t, 'alumno_id', usuariosUnsigned).notNullable().references('id').inTable('usuarios').onDelete('CASCADE');
        t.string('estado', 20).notNullable().defaultTo('activa'); // activa | cancelada
        t.datetime('fecha_reserva').defaultTo(knex.fn.now());
        t.unique(['sesion_id', 'alumno_id']);
    });

    await createTableIfMissing(knex, 'asistencias', (t) => {
        t.increments('id');
        foreignId(t, 'sesion_id', sesionesUnsigned).notNullable().references('id').inTable('sesiones').onDelete('CASCADE');
        foreignId(t, 'alumno_id', usuariosUnsigned).notNullable().references('id').inTable('usuarios').onDelete('CASCADE');
        t.boolean('presente').notNullable();
        foreignId(t, 'registrada_por', usuariosUnsigned).nullable().references('id').inTable('usuarios').onDelete('SET NULL');
        t.datetime('fecha_registro').defaultTo(knex.fn.now());
        t.unique(['sesion_id', 'alumno_id']);
    });
};

exports.down = async function down(knex) {
    for (const table of ['reservas', 'asistencias']) {
        if ((await knex.schema.hasTable(table)) && (await knex(table).first())) {
            throw new Error(`Refusing to roll back: ${table} holds data.`);
        }
    }
    await knex.schema.dropTableIfExists('asistencias');
    await knex.schema.dropTableIfExists('reservas');
    if (await knex.schema.hasColumn('sesiones', 'reservas_activas')) {
        await knex.schema.alterTable('sesiones', (t) => t.dropColumn('reservas_activas'));
    }
};
