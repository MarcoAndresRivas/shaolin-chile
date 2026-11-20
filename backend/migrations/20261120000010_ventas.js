// Fase 3: seminars by day, online courses and the purchases of both.
//
// A seminar has one or more days; each day has its own price and seats. A
// course has lessons (videos). A purchase (compra) groups what one person buys
// and is paid by bank transfer: it starts as pendiente and counts once
// administration validates it (pagada). Amounts are whole Chilean pesos.
//
// Safe to repeat (MySQL commits DDL immediately).

const { isUnsignedKey, foreignId, createTableIfMissing } = require('../src/db/schemaHelpers');

exports.up = async function up(knex) {
    const usuariosUnsigned = await isUnsignedKey(knex, 'usuarios');

    await createTableIfMissing(knex, 'seminarios', (t) => {
        t.increments('id');
        t.string('titulo', 150).notNullable();
        t.text('descripcion').nullable();
        t.string('sede', 150).nullable(); // null: "Por confirmar"
        t.string('imagen', 255).nullable(); // a file in the site's /ofertas folder, or an https URL
        t.string('video_url', 255).nullable(); // promotional video
        t.integer('precio_pack').nullable(); // price per person when buying every day of the seminar
        t.string('oferta', 255).nullable(); // the offer as shown to people
        t.string('estado', 20).notNullable().defaultTo('borrador'); // borrador | publicado | cerrado
        t.datetime('fecha_creacion').defaultTo(knex.fn.now());
    });
    const seminariosUnsigned = await isUnsignedKey(knex, 'seminarios');

    await createTableIfMissing(knex, 'seminario_dias', (t) => {
        t.increments('id');
        foreignId(t, 'seminario_id', seminariosUnsigned).notNullable().references('id').inTable('seminarios').onDelete('CASCADE');
        t.string('fecha', 10).notNullable();
        t.string('hora_inicio', 5).nullable(); // null: "Por confirmar"
        t.string('hora_fin', 5).nullable();
        t.integer('precio').notNullable();
        t.integer('cupo').notNullable();
        // Tickets held by purchases that are not anulada. One guarded UPDATE
        // takes the seats, so two buyers can never get the last one.
        t.integer('vendidos').notNullable().defaultTo(0);
    });
    const diasUnsigned = await isUnsignedKey(knex, 'seminario_dias');

    await createTableIfMissing(knex, 'cursos', (t) => {
        t.increments('id');
        t.string('titulo', 150).notNullable();
        t.text('descripcion').nullable();
        t.string('imagen', 255).nullable();
        t.integer('precio').notNullable();
        t.string('estado', 20).notNullable().defaultTo('borrador'); // borrador | publicado | cerrado
        t.datetime('fecha_creacion').defaultTo(knex.fn.now());
    });
    const cursosUnsigned = await isUnsignedKey(knex, 'cursos');

    await createTableIfMissing(knex, 'curso_lecciones', (t) => {
        t.increments('id');
        foreignId(t, 'curso_id', cursosUnsigned).notNullable().references('id').inTable('cursos').onDelete('CASCADE');
        t.integer('orden').notNullable();
        t.string('titulo', 150).notNullable();
        t.string('duracion', 20).nullable();
        t.string('video_url', 500).nullable(); // shown only to people who paid
        t.boolean('descargable').notNullable().defaultTo(true);
    });

    await createTableIfMissing(knex, 'compras', (t) => {
        t.increments('id');
        t.string('codigo', 20).notNullable().unique();
        t.string('nombre', 100).notNullable();
        t.string('email', 255).notNullable();
        t.string('telefono', 30).nullable();
        t.string('origen', 20).notNullable(); // sitio | instagram | whatsapp
        t.boolean('consentimiento').notNullable();
        t.datetime('consentimiento_fecha').nullable();
        t.integer('subtotal').notNullable();
        t.integer('descuento').notNullable().defaultTo(0);
        t.integer('total').notNullable();
        t.string('estado', 20).notNullable().defaultTo('pendiente'); // pendiente | pagada | anulada
        t.string('referencia_pago', 255).nullable(); // what the buyer reported about the transfer
        t.datetime('fecha_informe').nullable();
        foreignId(t, 'validado_por', usuariosUnsigned).nullable().references('id').inTable('usuarios').onDelete('SET NULL');
        t.datetime('fecha_validacion').nullable();
        t.datetime('fecha_creacion').defaultTo(knex.fn.now());
    });
    const comprasUnsigned = await isUnsignedKey(knex, 'compras');

    await createTableIfMissing(knex, 'compra_items', (t) => {
        t.increments('id');
        foreignId(t, 'compra_id', comprasUnsigned).notNullable().references('id').inTable('compras').onDelete('CASCADE');
        t.string('tipo', 20).notNullable(); // seminario_dia | curso
        foreignId(t, 'seminario_dia_id', diasUnsigned).nullable().references('id').inTable('seminario_dias');
        foreignId(t, 'curso_id', cursosUnsigned).nullable().references('id').inTable('cursos');
        t.string('descripcion', 255).notNullable();
        t.integer('cantidad').notNullable();
        t.integer('precio_unitario').notNullable();
    });
};

// Sales records: never dropped while they hold data.
const TABLES = ['compra_items', 'compras', 'curso_lecciones', 'cursos', 'seminario_dias', 'seminarios'];

exports.down = async function down(knex) {
    for (const table of TABLES) {
        if ((await knex.schema.hasTable(table)) && (await knex(table).first())) {
            throw new Error(`Refusing to roll back: ${table} holds data.`);
        }
    }
    for (const table of TABLES) await knex.schema.dropTableIfExists(table);
};
