// How a store order is delivered: shipped to an address (always available) or
// picked up at the seminar (only products suggested for it, subject to stock).
// productos.sugerido_seminario marks those suggestions; compras keeps the
// delivery choice and, for shipping, the address.
//
// Safe to repeat.

const COMPRAS_COLUMNS = [
    ['entrega', (t) => t.string('entrega', 20).nullable()], // envio | retiro; null when the purchase has no products
    ['direccion', (t) => t.string('direccion', 255).nullable()],
    ['comuna', (t) => t.string('comuna', 100).nullable()],
    ['region', (t) => t.string('region', 100).nullable()],
];

exports.up = async function up(knex) {
    if (!(await knex.schema.hasColumn('productos', 'sugerido_seminario'))) {
        await knex.schema.alterTable('productos', (t) => {
            t.boolean('sugerido_seminario').notNullable().defaultTo(false);
        });
    }
    for (const [name, add] of COMPRAS_COLUMNS) {
        if (!(await knex.schema.hasColumn('compras', name))) await knex.schema.alterTable('compras', add);
    }
};

// Shipping addresses are sales records: never dropped while an order has one.
exports.down = async function down(knex) {
    if ((await knex.schema.hasColumn('compras', 'entrega')) && (await knex('compras').whereNotNull('entrega').first())) {
        throw new Error('Refusing to roll back: compras holds delivery data.');
    }
    for (const [name] of COMPRAS_COLUMNS) {
        if (await knex.schema.hasColumn('compras', name)) await knex.schema.alterTable('compras', (t) => t.dropColumn(name));
    }
    if (await knex.schema.hasColumn('productos', 'sugerido_seminario')) {
        await knex.schema.alterTable('productos', (t) => t.dropColumn('sugerido_seminario'));
    }
};
