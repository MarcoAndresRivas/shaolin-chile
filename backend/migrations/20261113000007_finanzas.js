// Fase 2, T6: plans, subscriptions, charges and payments.
//
// Amounts are whole Chilean pesos (integers). A student's balance is their
// charges minus the payments that administration validated. Payments are made
// by bank transfer and a person confirms them, so a payment starts as
// por_validar and only counts once it is validado.
//
// Safe to repeat (MySQL commits DDL immediately).

const { isUnsignedKey, foreignId, createTableIfMissing } = require('../src/db/schemaHelpers');

exports.up = async function up(knex) {
    const usuariosUnsigned = await isUnsignedKey(knex, 'usuarios');

    await createTableIfMissing(knex, 'planes', (t) => {
        t.increments('id');
        t.string('nombre', 120).notNullable();
        t.integer('monto').notNullable();
        t.string('periodicidad', 20).notNullable(); // mensual | unico
        t.boolean('activa').notNullable().defaultTo(true);
    });
    const planesUnsigned = await isUnsignedKey(knex, 'planes');

    await createTableIfMissing(knex, 'suscripciones', (t) => {
        t.increments('id');
        foreignId(t, 'alumno_id', usuariosUnsigned).notNullable().references('id').inTable('usuarios').onDelete('CASCADE');
        foreignId(t, 'plan_id', planesUnsigned).notNullable().references('id').inTable('planes');
        t.string('fecha_inicio', 10).notNullable();
        t.string('fecha_fin', 10).nullable();
        t.string('estado', 20).notNullable().defaultTo('activa'); // activa | pausada | cancelada
    });
    const suscripcionesUnsigned = await isUnsignedKey(knex, 'suscripciones');

    await createTableIfMissing(knex, 'cargos', (t) => {
        t.increments('id');
        foreignId(t, 'alumno_id', usuariosUnsigned).notNullable().references('id').inTable('usuarios').onDelete('CASCADE');
        foreignId(t, 'plan_id', planesUnsigned).nullable().references('id').inTable('planes').onDelete('SET NULL');
        foreignId(t, 'suscripcion_id', suscripcionesUnsigned).nullable().references('id').inTable('suscripciones').onDelete('SET NULL');
        t.string('concepto', 255).notNullable();
        t.integer('monto').notNullable();
        t.string('periodo', 7).nullable(); // YYYY-MM for monthly charges
        t.string('fecha_emision', 10).notNullable();
        t.string('fecha_vencimiento', 10).notNullable();
        t.string('estado', 20).notNullable().defaultTo('pendiente'); // pendiente | pagado | anulado
        // A subscription is charged once per period.
        t.unique(['suscripcion_id', 'periodo']);
    });
    const cargosUnsigned = await isUnsignedKey(knex, 'cargos');

    await createTableIfMissing(knex, 'pagos', (t) => {
        t.increments('id');
        foreignId(t, 'cargo_id', cargosUnsigned).notNullable().references('id').inTable('cargos').onDelete('CASCADE');
        t.integer('monto').notNullable();
        t.string('metodo', 30).notNullable().defaultTo('transferencia');
        t.string('referencia', 255).nullable();
        t.string('estado', 20).notNullable().defaultTo('por_validar'); // por_validar | validado | rechazado
        foreignId(t, 'registrado_por', usuariosUnsigned).nullable().references('id').inTable('usuarios').onDelete('SET NULL');
        foreignId(t, 'validado_por', usuariosUnsigned).nullable().references('id').inTable('usuarios').onDelete('SET NULL');
        t.datetime('fecha_creacion').defaultTo(knex.fn.now());
        t.datetime('fecha_validacion').nullable();
    });
};

// Financial records: never dropped while they hold data.
const PROTECTED_TABLES = ['pagos', 'cargos', 'suscripciones', 'planes'];

exports.down = async function down(knex) {
    for (const table of PROTECTED_TABLES) {
        if ((await knex.schema.hasTable(table)) && (await knex(table).first())) {
            throw new Error(`Refusing to roll back: ${table} holds data.`);
        }
    }
    for (const table of PROTECTED_TABLES) await knex.schema.dropTableIfExists(table);
};
