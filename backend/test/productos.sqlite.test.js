// Products (uniforms, event t-shirts, rattan staffs, shoes) sold with sizes and
// stock next to seminars and courses, paid by transfer, shipped or picked up at the seminar.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { withApi } = require('./apiHarness');

const USERS = [
    ['Admin', 'admin@x.cl', ['Administrador']],
    ['Ana', 'ana@x.cl', ['Alumno']],
];
const DAY_MS = 24 * 60 * 60 * 1000;
const isoDate = (offsetDays) => new Date(Date.now() + offsetDays * DAY_MS).toISOString().slice(0, 10);
// Product orders pick up at the seminar unless a test says otherwise.
const buyer = (items, extra = { entrega: 'retiro' }) => ({ nombre: 'Juana Pérez', email: 'juana@example.com', consentimiento: true, items, ...extra });
const ENVIO = { entrega: 'envio', direccion: 'Av. Colón 1234', comuna: 'Hualpén', region: 'Biobío' };
const count = async (knex, table) => Number((await knex(table).count({ n: '*' }).first()).n);

// A published t-shirt suggested for the seminar (S stock 2, M stock 5), a draft, a suggested staff whose
// presale closed, and shoes that are not a seminar suggestion.
async function products(knex) {
    const [poleraId] = await knex('productos').insert({ titulo: 'Polera del evento', precio: 12000, estado: 'publicado', cierre_preventa: isoDate(5), sugerido_seminario: true });
    const [tallaS] = await knex('producto_tallas').insert({ producto_id: poleraId, talla: 'S', stock: 2 });
    const [tallaM] = await knex('producto_tallas').insert({ producto_id: poleraId, talla: 'M', stock: 5 });
    const [draftId] = await knex('productos').insert({ titulo: 'Borrador', precio: 1000, estado: 'borrador' });
    const [draftTalla] = await knex('producto_tallas').insert({ producto_id: draftId, talla: 'Única', stock: 3 });
    const [closedId] = await knex('productos').insert({ titulo: 'Vara de ratán', precio: 22000, estado: 'publicado', cierre_preventa: isoDate(-2), sugerido_seminario: true });
    const [closedTalla] = await knex('producto_tallas').insert({ producto_id: closedId, talla: '1,80 m', stock: 10 });
    const [shoesId] = await knex('productos').insert({ titulo: 'Zapatillas', precio: 30000, estado: 'publicado' });
    const [tallaZ] = await knex('producto_tallas').insert({ producto_id: shoesId, talla: '40', stock: 4 });
    return { poleraId, tallaS, tallaM, draftTalla, closedTalla, tallaZ };
}

test('the catalog lists published products with their sizes and what is left, never what was sold', async () => {
    await withApi(USERS, async ({ call, knex }) => {
        const { tallaS } = await products(knex);
        await knex('producto_tallas').where({ id: tallaS }).update({ vendidos: 1 });
        const { status, body } = await call('GET', '/api/ofertas', null);
        assert.equal(status, 200);
        assert.deepEqual(body.productos.map((p) => [p.titulo, p.precio, p.cerrado, p.sugerido_seminario]), [['Polera del evento', 12000, false, true], ['Vara de ratán', 22000, true, true], ['Zapatillas', 30000, false, false]]);
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
        assert.match(body.mensaje, /Los productos se retiran en el seminario, sujetos a disponibilidad/);
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

test('the product seed creates the real list once: fifteen on sale, three by order as drafts, each with its photo', async () => {
    await withApi(USERS, async ({ call, knex }) => {
        const { seedProductos } = require('../src/seedProductos');
        assert.deepEqual(await seedProductos(knex), [
            'Zapatillas Feiyue', 'Bastón de ratán 1,8 m', 'Guantes foco Mitt', 'Paletas dobles para patear (par)',
            'Escudo curvo ThaiPad', 'Chaleco Shaolin', 'Espada Jian de entrenamiento', 'Kwandao desmontable 1,85 m',
            'Traje de Tai Chi', 'Zapatillas de cuero blancas Tai Chi', 'Traje de Nanquan', 'Traje de competencia Changquan',
            'Traje de Sanda', 'Bastón de 3 secciones (San Jie Gun)', 'Doble espada Shuang Jian', 'Empeineras Wesing',
            'Canillera Wesing', 'Doble gancho de entrenamiento',
        ]);
        assert.deepEqual(await seedProductos(knex), [], 'repeating changes nothing');
        const { productos } = (await call('GET', '/api/ofertas', null)).body;
        assert.deepEqual(productos.map((p) => [p.titulo, p.precio, p.tallas.map((t) => t.talla).join(' ')]), [
            ['Zapatillas Feiyue', 25990, '35 36 37 38 39 40 41 43'],
            ['Bastón de ratán 1,8 m', 24990, 'Única'],
            ['Guantes foco Mitt', 16990, 'Rojo Azul'],
            ['Paletas dobles para patear (par)', 22990, 'Única'],
            ['Escudo curvo ThaiPad', 22990, 'Única'],
            ['Chaleco Shaolin', 22990, 'Única'],
            ['Traje de Tai Chi', 47990, 'Blanco Negro Azul Gris'],
            ['Zapatillas de cuero blancas Tai Chi', 41990, '38 39 40 41 42 43'],
            ['Traje de Nanquan', 38990, 'Rojo 165-175 cm Rojo 175-185 cm Dorado 165-175 cm Dorado 175-185 cm'],
            ['Traje de competencia Changquan', 48990, '160-170 cm'],
            ['Traje de Sanda', 28990, 'Rojo 170 cm Rojo 180 cm Rojo 190 cm Azul 170 cm Azul 180 cm Azul 190 cm'],
            ['Bastón de 3 secciones (San Jie Gun)', 53990, 'Única'],
            ['Doble espada Shuang Jian', 88990, 'Única'],
            ['Empeineras Wesing', 28990, 'Rojo Azul'],
            ['Canillera Wesing', 53990, 'L Azul'],
        ]);
        assert.ok(productos.every((p) => p.cierre_preventa === '2026-11-27'));
        assert.deepEqual(productos.filter((p) => p.sugerido_seminario).map((p) => p.titulo), ['Zapatillas Feiyue', 'Bastón de ratán 1,8 m', 'Guantes foco Mitt', 'Paletas dobles para patear (par)']);
        assert.deepEqual((await knex('productos').where({ estado: 'borrador' })).map((p) => p.titulo), ['Espada Jian de entrenamiento', 'Kwandao desmontable 1,85 m', 'Doble gancho de entrenamiento']);
        const photos = path.join(__dirname, '..', '..', 'web', 'public', 'ofertas');
        for (const { imagen } of await knex('productos')) assert.ok(fs.existsSync(path.join(photos, imagen)), `the photo ${imagen} is on the site`);
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

test('an order of products only speaks of an order, not of seats or enrolment', async () => {
    await withApi(USERS, async ({ call, knex }) => {
        const { tallaM } = await products(knex);
        const { body } = await call('POST', '/api/compras', null, buyer([{ producto_talla_id: tallaM, cantidad: 1 }]));
        assert.match(body.mensaje, /^🛍️ Para confirmar tu pedido, es necesario realizar una transferencia de \$12\.000, correspondiente al valor de Polera del evento \(talla M\)\. ✨/);
        assert.match(body.mensaje, /envíanos tu comprobante \+ Nombre Completo para confirmar tu pedido\./);
        assert.doesNotMatch(body.mensaje, /💕/u);
        assert.match(body.mensaje, /Tu código de pedido es SC-/);
        assert.doesNotMatch(body.mensaje, /cupo|inscripción/);
    });
});

test('shipping is always available: the address is stored, the presale does not apply, and the message says how it arrives', async () => {
    await withApi(USERS, async ({ call, knex }) => {
        const { closedTalla, tallaZ } = await products(knex);
        const { status, body } = await call('POST', '/api/compras', null, buyer([{ producto_talla_id: closedTalla, cantidad: 1 }, { producto_talla_id: tallaZ, cantidad: 1 }], ENVIO));
        assert.equal(status, 201);
        assert.match(body.mensaje, /Enviaremos tu pedido a Av\. Colón 1234, Hualpén, Biobío\. El envío se paga al recibir\. 📦/);
        assert.doesNotMatch(body.mensaje, /se retiran en el seminario/);
        const [compra] = await knex('compras');
        assert.deepEqual([compra.entrega, compra.direccion, compra.comuna, compra.region], ['envio', 'Av. Colón 1234', 'Hualpén', 'Biobío']);
    });
});

test('pickup at the seminar is only for suggested products, and an order with products must say how it is delivered', async () => {
    await withApi(USERS, async ({ call, knex }) => {
        const { tallaM, tallaZ } = await products(knex);
        const notSuggested = await call('POST', '/api/compras', null, buyer([{ producto_talla_id: tallaZ, cantidad: 1 }]));
        assert.deepEqual([notSuggested.status, notSuggested.body.error], [400, 'Zapatillas no se puede retirar en el seminario: elige envío.']);
        const cases = [
            [{}, 'Elige cómo recibir tus productos (entrega): envio o retiro.'],
            [{ entrega: 'otro' }, 'Elige cómo recibir tus productos (entrega): envio o retiro.'],
            [{ entrega: 'envio', direccion: 'Av. Colón 1234' }, 'Para el envío indica dirección, comuna y región.'],
            [{ ...ENVIO, direccion: 'x'.repeat(256) }, 'Para el envío indica dirección, comuna y región.'],
        ];
        for (const [extra, error] of cases) {
            const res = await call('POST', '/api/compras', null, buyer([{ producto_talla_id: tallaM, cantidad: 1 }], extra));
            assert.deepEqual([res.status, res.body.error], [400, error]);
        }
        assert.equal(await count(knex, 'compras'), 0);
        assert.equal((await knex('producto_tallas').where({ id: tallaM }).first()).vendidos, 0);
    });
});

test('a seminar-only purchase stores no delivery, whatever the body says', async () => {
    await withApi(USERS, async ({ call, knex }) => {
        const [seminarioId] = await knex('seminarios').insert({ titulo: 'Seminario', estado: 'publicado' });
        const [dia] = await knex('seminario_dias').insert({ seminario_id: seminarioId, fecha: isoDate(10), hora_inicio: '10:00', precio: 35000, cupo: 5 });
        assert.equal((await call('POST', '/api/compras', null, buyer([{ seminario_dia_id: dia, cantidad: 1 }], ENVIO))).status, 201);
        const [compra] = await knex('compras');
        assert.deepEqual([compra.entrega, compra.direccion], [null, null]);
    });
});

test('administration marks seminar suggestions and sees how each order is delivered', async () => {
    await withApi(USERS, async ({ call, login, knex }) => {
        const { tallaZ, tallaM } = await products(knex);
        const admin = await login('admin@x.cl');
        const [shoes] = await knex('productos').where({ titulo: 'Zapatillas' });
        assert.equal((await call('PUT', `${ADMIN}/productos/${shoes.id}`, admin, { sugerido_seminario: true })).status, 200);
        assert.equal((await call('PUT', `${ADMIN}/productos/${shoes.id}`, admin, { sugerido_seminario: 'si' })).body.error, 'sugerido_seminario debe ser true o false.');
        assert.equal(Boolean((await knex('productos').where({ id: shoes.id }).first()).sugerido_seminario), true);

        await call('POST', '/api/compras', null, buyer([{ producto_talla_id: tallaZ, cantidad: 1 }], ENVIO));
        await call('POST', '/api/compras', null, buyer([{ producto_talla_id: tallaM, cantidad: 1 }]));
        const compras = (await call('GET', `${ADMIN}/compras`, admin)).body;
        assert.deepEqual(compras.map((c) => [c.entrega, c.direccion, c.comuna, c.region]).sort(), [
            ['envio', 'Av. Colón 1234', 'Hualpén', 'Biobío'],
            ['retiro', null, null, null],
        ]);
    });
});
