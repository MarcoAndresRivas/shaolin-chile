// Products sold next to seminars and courses: uniforms, event t-shirts, rattan
// staffs, shoes. Each product has sizes (tallas) with their own stock; a
// purchase item can point at one size. Products are picked up at the seminar
// and stop selling after their presale closing date (cierre_preventa).
//
// Safe to repeat (MySQL commits DDL immediately).

const { isUnsignedKey, foreignId, createTableIfMissing } = require('../src/db/schemaHelpers');

exports.up = async function up(knex) {
    await createTableIfMissing(knex, 'productos', (t) => {
        t.increments('id');
        t.string('titulo', 150).notNullable();
        t.text('descripcion').nullable();
        t.string('imagen', 255).nullable(); // a file in the site's /ofertas folder, or an https address
        t.integer('precio').notNullable(); // whole Chilean pesos
        t.string('cierre_preventa', 10).nullable(); // YYYY-MM-DD, last day to buy (Chile time); null = no closing date
        t.string('estado', 20).notNullable().defaultTo('borrador'); // borrador | publicado | cerrado
        t.datetime('fecha_creacion').defaultTo(knex.fn.now());
    });
    const productosUnsigned = await isUnsignedKey(knex, 'productos');

    await createTableIfMissing(knex, 'producto_tallas', (t) => {
        t.increments('id');
        foreignId(t, 'producto_id', productosUnsigned).notNullable().references('id').inTable('productos').onDelete('CASCADE');
        t.string('talla', 20).notNullable();
        t.integer('stock').notNullable();
        t.integer('vendidos').notNullable().defaultTo(0);
        t.unique(['producto_id', 'talla']);
    });

    // A plain column (no foreign key): SQLite cannot add a constraint to an existing table.
    if (!(await knex.schema.hasColumn('compra_items', 'producto_talla_id'))) {
        await knex.schema.alterTable('compra_items', (t) => {
            t.integer('producto_talla_id').nullable().index();
        });
    }
};

// Sales records: never dropped while they hold data.
exports.down = async function down(knex) {
    for (const table of ['producto_tallas', 'productos']) {
        if ((await knex.schema.hasTable(table)) && (await knex(table).first())) {
            throw new Error(`Refusing to roll back: ${table} holds data.`);
        }
    }
    if (await knex.schema.hasColumn('compra_items', 'producto_talla_id')) {
        await knex.schema.alterTable('compra_items', (t) => {
            t.dropIndex(['producto_talla_id']);
            t.dropColumn('producto_talla_id');
        });
    }
    await knex.schema.dropTableIfExists('producto_tallas');
    await knex.schema.dropTableIfExists('productos');
};
