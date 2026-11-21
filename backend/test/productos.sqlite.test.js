// Products (uniforms, event t-shirts, rattan staffs, shoes) sold with sizes and
// stock next to seminars and courses, paid by transfer and picked up at the seminar.
const test = require('node:test');
const assert = require('node:assert/strict');
const { withApi } = require('./apiHarness');

const USERS = [
    ['Admin', 'admin@x.cl', ['Administrador']],
    ['Ana', 'ana@x.cl', ['Alumno']],
];
const DAY_MS = 24 * 60 * 60 * 1000;
const isoDate = (offsetDays) => new Date(Date.now() + offsetDays * DAY_MS).toISOString().slice(0, 10);
const buyer = (items) => ({ nombre: 'Juana Pérez', email: 'juana@example.com', consentimiento: true, items });
const count = async (knex, table) => Number((await knex(table).count({ n: '*' }).first()).n);

// A published t-shirt with sizes S (stock 2) and M (stock 5), a draft product and a closed presale.
async function products(knex) {
    const [poleraId] = await knex('productos').insert({ titulo: 'Polera del evento', precio: 12000, estado: 'publicado', cierre_preventa: isoDate(5) });
    const [tallaS] = await knex('producto_tallas').insert({ producto_id: poleraId, talla: 'S', stock: 2 });
    const [tallaM] = await knex('producto_tallas').insert({ producto_id: poleraId, talla: 'M', stock: 5 });
    const [draftId] = await knex('productos').insert({ titulo: 'Borrador', precio: 1000, estado: 'borrador' });
    const [draftTalla] = await knex('producto_tallas').insert({ producto_id: draftId, talla: 'Única', stock: 3 });
    const [closedId] = await knex('productos').insert({ titulo: 'Vara de ratán', precio: 22000, estado: 'publicado', cierre_preventa: isoDate(-2) });
    const [closedTalla] = await knex('producto_tallas').insert({ producto_id: closedId, talla: '1,80 m', stock: 10 });
    return { poleraId, tallaS, tallaM, draftTalla, closedTalla };
}

test('the catalog lists published products with their sizes and what is left, never what was sold', async () => {
    await withApi(USERS, async ({ call, knex }) => {
        const { tallaS } = await products(knex);
        await knex('producto_tallas').where({ id: tallaS }).update({ vendidos: 1 });
        const { status, body } = await call('GET', '/api/ofertas', null);
        assert.equal(status, 200);
        assert.deepEqual(body.productos.map((p) => [p.titulo, p.precio, p.cerrado]), [['Polera del evento', 12000, false], ['Vara de ratán', 22000, true]]);
        assert.deepEqual(body.productos[0].tallas.map((t) => [t.talla, t.disponible]), [['S', 1], ['M', 5]]);
        assert.ok(JSON.stringify(body.productos).indexOf('vendidos') === -1 && JSON.stringify(body.productos).indexOf('stock') === -1);
    });
});

test('buying a product size adds its price, takes the stock and says it is picked up at the seminar', async () => {
    await withApi(USERS, async ({ call, knex }) => {
        const { tallaM } = await products(knex);
        const { status, body } = await call('POST', '/api/compras', null, buyer([{ producto_talla_id: tallaM, cantidad: 2 }]));
        assert.equal(status, 201);
        assert.deepEqual([body.subtotal, body.descuento, body.total], [24000, 0, 24000]);
        assert.deepEqual(body.items, [{ descripcion: 'Polera del evento (talla M)', cantidad: 2, precio: 12000 }]);
        assert.match(body.mensaje, /transferencia de \$24\.000/);
        assert.match(body.mensaje, /Los productos se entregan en el seminario/);
        assert.equal((await knex('producto_tallas').where({ id: tallaM }).first()).vendidos, 2);
        const [item] = await knex('compra_items');
        assert.deepEqual([item.tipo, item.producto_talla_id], ['producto', tallaM]);
    });
});

test('a purchase without products does not mention the pickup', async () => {
    await withApi(USERS, async ({ call, knex }) => {
        const [seminarioId] = await knex('seminarios').insert({ titulo: 'Seminario', estado: 'publicado' });
        const [dia] = await knex('seminario_dias').insert({ seminario_id: seminarioId, fecha: isoDate(10), hora_inicio: '10:00', precio: 35000, cupo: 5 });
        const { body } = await call('POST', '/api/compras', null, buyer([{ seminario_dia_id: dia, cantidad: 1 }]));
        assert.doesNotMatch(body.mensaje, /se entregan en el seminario/);
    });
});

test('a product is refused when its size has not enough stock, and the purchase takes nothing', async () => {
    await withApi(USERS, async ({ call, knex }) => {
        const { tallaS, tallaM } = await products(knex);
        const refused = await call('POST', '/api/compras', null, buyer([{ producto_talla_id: tallaM, cantidad: 1 }, { producto_talla_id: tallaS, cantidad: 3 }]));
        assert.equal(refused.status, 409);
        assert.equal(refused.body.error, 'No queda stock suficiente de Polera del evento en talla S: quedan 2.');
        assert.deepEqual((await knex('producto_tallas').whereIn('id', [tallaS, tallaM]).orderBy('id')).map((t) => t.vendidos), [0, 0]);
        assert.equal(await count(knex, 'compras'), 0);
    });
});

test('a product whose presale closed, a draft and an unknown size cannot be bought', async () => {
    await withApi(USERS, async ({ call, knex }) => {
        const { closedTalla, draftTalla } = await products(knex);
        const closed = await call('POST', '/api/compras', null, buyer([{ producto_talla_id: closedTalla, cantidad: 1 }]));
        assert.equal(closed.status, 409);
        assert.equal(closed.body.error, 'La preventa de Vara de ratán ya cerró.');
        for (const id of [draftTalla, 99999]) {
            const missing = await call('POST', '/api/compras', null, buyer([{ producto_talla_id: id, cantidad: 1 }]));
            assert.equal(missing.status, 400);
            assert.equal(missing.body.error, 'Uno de los productos no existe o ya no está a la venta.');
        }
        assert.equal(await count(knex, 'compras'), 0);
    });
});

test('product items need a whole size id and a quantity between 1 and 10', async () => {
    await withApi(USERS, async ({ call, knex }) => {
        const { tallaM } = await products(knex);
        const cases = [
            [{ producto_talla_id: 'x', cantidad: 1 }, 'producto_talla_id debe ser un número entero.'],
            [{ producto_talla_id: tallaM, cantidad: 0 }, 'cantidad debe ser un número entero mayor que 0.'],
            [{ producto_talla_id: tallaM, cantidad: 11 }, 'Puedes comprar hasta 10 unidades por talla en una compra.'],
            [{ algo: 1 }, 'Cada producto debe indicar seminario_dia_id, curso_id o producto_talla_id.'],
        ];
        for (const [item, error] of cases) {
            const res = await call('POST', '/api/compras', null, buyer([item]));
            assert.deepEqual([res.status, res.body.error], [400, error]);
        }
        assert.equal(await count(knex, 'compras'), 0);
    });
});

test('a seminar pack keeps its discount when products are added to the same purchase', async () => {
    await withApi(USERS, async ({ call, knex }) => {
        const { tallaM } = await products(knex);
        const [seminarioId] = await knex('seminarios').insert({ titulo: 'Seminario', precio_pack: 59000, estado: 'publicado' });
        const [d1] = await knex('seminario_dias').insert({ seminario_id: seminarioId, fecha: isoDate(10), hora_inicio: '10:00', precio: 35000, cupo: 5 });
        const [d2] = await knex('seminario_dias').insert({ seminario_id: seminarioId, fecha: isoDate(11), hora_inicio: '10:00', precio: 35000, cupo: 5 });
        const { body } = await call('POST', '/api/compras', null, buyer([{ seminario_dia_id: d1, cantidad: 1 }, { seminario_dia_id: d2, cantidad: 1 }, { producto_talla_id: tallaM, cantidad: 1 }]));
        assert.deepEqual([body.subtotal, body.descuento, body.total], [82000, 11000, 71000]);
    });
});

test('cancelling a purchase gives the product stock back', async () => {
    await withApi(USERS, async ({ call, login, knex }) => {
        const { tallaM } = await products(knex);
        await call('POST', '/api/compras', null, buyer([{ producto_talla_id: tallaM, cantidad: 3 }]));
        const admin = await login('admin@x.cl');
        const [compra] = await knex('compras');
        const cancelled = await call('PUT', `/api/intranet/ventas/compras/${compra.id}/anular`, admin);
        assert.equal(cancelled.status, 200);
        assert.equal((await knex('producto_tallas').where({ id: tallaM }).first()).vendidos, 0);
    });
});

const ADMIN = '/api/intranet/ventas';

test('administration creates a product with sizes, edits it and sees stock and what was sold', async () => {
    await withApi(USERS, async ({ call, login, knex }) => {
        const admin = await login('admin@x.cl');
        const created = await call('POST', `${ADMIN}/productos`, admin, { titulo: 'Zapatillas Feiyue', precio: 35000, cierre_preventa: isoDate(6), imagen: 'feiyue.jpg' });
        assert.equal(created.status, 201);
        const id = created.body.id;
        for (const [talla, stock] of [['40', 3], ['41', 4]]) {
            assert.equal((await call('POST', `${ADMIN}/productos/${id}/tallas`, admin, { talla, stock })).status, 201);
        }
        assert.equal((await call('PUT', `${ADMIN}/productos/${id}`, admin, { estado: 'publicado', precio: 36000 })).status, 200);

        const catalog = (await call('GET', `${ADMIN}/catalogo`, admin)).body;
        const [producto] = catalog.productos;
        assert.deepEqual([producto.titulo, producto.precio, producto.estado, producto.cierre_preventa], ['Zapatillas Feiyue', 36000, 'publicado', isoDate(6)]);
        assert.deepEqual(producto.tallas.map((t) => [t.talla, t.stock, t.vendidos]), [['40', 3, 0], ['41', 4, 0]]);
        assert.equal((await call('GET', '/api/ofertas', null)).body.productos.length, 1, 'published, it is on sale');
        assert.equal(await count(knex, 'productos'), 1);
    });
});

test('product and size data is validated, and a size stock never goes below what was sold', async () => {
    await withApi(USERS, async ({ call, login, knex }) => {
        const admin = await login('admin@x.cl');
        const { poleraId, tallaM } = await products(knex);
        const invalid = [
            [{ titulo: 'Polera', precio: 0 }, 'precio debe ser un número entero de pesos, sin decimales.'],
            [{ titulo: 'Polera', precio: 1000, cierre_preventa: '30-11-2026' }, 'cierre_preventa debe tener el formato AAAA-MM-DD.'],
            [{ titulo: 'Polera', precio: 1000, imagen: 'javascript:alert(1)' }, 'imagen debe ser un archivo o una dirección https.'],
        ];
        for (const [body, error] of invalid) {
            const res = await call('POST', `${ADMIN}/productos`, admin, body);
            assert.deepEqual([res.status, res.body.error], [400, error]);
        }
        const sizes = [
            [{ talla: '', stock: 1 }, 'talla debe tener entre 1 y 20 caracteres.'],
            [{ talla: 'L', stock: -1 }, 'stock debe ser un número entero de 0 o más.'],
            [{ talla: 'M', stock: 1 }, 'Ese producto ya tiene la talla M.'],
        ];
        for (const [body, error] of sizes) {
            const res = await call('POST', `${ADMIN}/productos/${poleraId}/tallas`, admin, body);
            assert.deepEqual([res.status, res.body.error], [error.startsWith('Ese') ? 409 : 400, error]);
        }
        assert.equal((await call('POST', `${ADMIN}/productos/99999/tallas`, admin, { talla: 'L', stock: 1 })).status, 404);

        await knex('producto_tallas').where({ id: tallaM }).update({ vendidos: 3 });
        const below = await call('PUT', `${ADMIN}/tallas/${tallaM}`, admin, { stock: 2 });
        assert.deepEqual([below.status, below.body.error], [409, 'Ya se vendieron 3 unidades de esa talla: el stock no puede ser menor.']);
        assert.equal((await call('PUT', `${ADMIN}/tallas/${tallaM}`, admin, { stock: 8 })).status, 200);
        assert.equal((await knex('producto_tallas').where({ id: tallaM }).first()).stock, 8);
    });
});

test('only administration manages products, and the purchases list says which items are products to hand out', async () => {
    await withApi(USERS, async ({ call, login, knex }) => {
        const { tallaM } = await products(knex);
        const student = await login('ana@x.cl');
        assert.equal((await call('POST', `${ADMIN}/productos`, student, { titulo: 'X', precio: 1000 })).status, 403);
        assert.equal((await call('PUT', `${ADMIN}/tallas/${tallaM}`, student, { stock: 1 })).status, 403);

        await call('POST', '/api/compras', null, buyer([{ producto_talla_id: tallaM, cantidad: 2 }]));
        const admin = await login('admin@x.cl');
        const [compra] = (await call('GET', `${ADMIN}/compras`, admin)).body;
        assert.deepEqual(compra.items, [{ tipo: 'producto', descripcion: 'Polera del evento (talla M)', cantidad: 2, precio: 12000 }]);
    });
});

test('the cancel message mentions the stock only when the purchase had products', async () => {
    await withApi(USERS, async ({ call, login, knex }) => {
        const { tallaM } = await products(knex);
        const [seminarioId] = await knex('seminarios').insert({ titulo: 'Seminario', estado: 'publicado' });
        const [dia] = await knex('seminario_dias').insert({ seminario_id: seminarioId, fecha: isoDate(10), hora_inicio: '10:00', precio: 35000, cupo: 5 });
        await call('POST', '/api/compras', null, buyer([{ seminario_dia_id: dia, cantidad: 1 }]));
        await call('POST', '/api/compras', null, buyer([{ producto_talla_id: tallaM, cantidad: 1 }]));
        const admin = await login('admin@x.cl');
        const [seminarOnly, withProduct] = await knex('compras').orderBy('id');
        assert.equal((await call('PUT', `${ADMIN}/compras/${seminarOnly.id}/anular`, admin)).body.message, 'Compra anulada. Los cupos quedaron libres.');
        assert.equal((await call('PUT', `${ADMIN}/compras/${withProduct.id}/anular`, admin)).body.message, 'Compra anulada. Los cupos y el stock quedaron libres.');
    });
});
