import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cartItems, dayLabel, emptyCart, estimate, hoursLabel, offerImage, validateBuyer } from '../src/lib/ventas.js';

const catalog = {
  seminarios: [{
    id: 1, titulo: 'Seminario', precio_pack: 59000,
    dias: [{ id: 10, fecha: '2026-12-04', precio: 35000 }, { id: 11, fecha: '2026-12-05', precio: 35000 }],
  }],
  cursos: [{ id: 3, titulo: 'Curso', precio: 25000 }],
};

test('days are written in Spanish with their weekday', () => {
  assert.equal(dayLabel('2026-12-04'), 'viernes, 4 de diciembre');
  assert.equal(hoursLabel({ hora_inicio: null }), 'Horario por confirmar');
  assert.equal(hoursLabel({ hora_inicio: '10:00', hora_fin: '13:00' }), '10:00 a 13:00');
});

test('the estimate gives the pack price only for every day with the same tickets', () => {
  assert.equal(estimate({ days: { 10: 1, 11: 1 }, courses: [] }, catalog).total, 59000);
  assert.deepEqual(
    (({ subtotal, descuento, total }) => ({ subtotal, descuento, total }))(estimate({ days: { 10: 2, 11: 2 }, courses: [3] }, catalog)),
    { subtotal: 165000, descuento: 22000, total: 143000 },
  );
  assert.equal(estimate({ days: { 10: 1 }, courses: [] }, catalog).total, 35000);
  assert.equal(estimate({ days: { 10: 2, 11: 1 }, courses: [] }, catalog).descuento, 0);
  assert.equal(estimate(emptyCart(), catalog).total, 0);
});

test('the cart becomes the items the server expects', () => {
  assert.deepEqual(cartItems({ days: { 10: 2, 11: 0 }, courses: [3] }), [{ seminario_dia_id: 10, cantidad: 2 }, { curso_id: 3 }]);
});

test('offer photos come from the site folder or an https address, nothing else', () => {
  assert.equal(offerImage('seminario.jpg', '/shaolin-chile/'), '/shaolin-chile/ofertas/seminario.jpg');
  assert.equal(offerImage('https://cdn.example/a.jpg'), 'https://cdn.example/a.jpg');
  assert.equal(offerImage('javascript:alert(1)'), null);
  assert.equal(offerImage('../x.jpg'), null);
  assert.equal(offerImage(null), null);
});

test('the buyer form asks for name, email and consent', () => {
  const ok = { nombre: 'Juana Pérez', email: 'juana@example.com', telefono: '', consentimiento: true };
  assert.deepEqual(validateBuyer(ok), {});
  assert.deepEqual(Object.keys(validateBuyer({ nombre: '', email: 'x', telefono: 'abc', consentimiento: false })), ['nombre', 'email', 'telefono', 'consentimiento']);
});

const withProducts = {
  ...catalog,
  productos: [{ id: 5, titulo: 'Polera', precio: 12000, tallas: [{ id: 50, talla: 'S', disponible: 2 }, { id: 51, talla: 'M', disponible: 0 }] }],
};

test('products in the cart add their price per size and unit, without touching the seminar pack', () => {
  const summary = estimate({ days: { 10: 1, 11: 1 }, courses: [], products: { 50: 2 } }, withProducts);
  assert.deepEqual(summary.lines.at(-1), { key: 'p50', label: 'Polera (talla S)', cantidad: 2, monto: 24000 });
  assert.deepEqual([summary.subtotal, summary.descuento, summary.total], [94000, 11000, 83000]);
  assert.equal(estimate({ days: {}, courses: [], products: { 50: 0 } }, withProducts).lines.length, 0);
});

test('product sizes become items with their quantity, and an empty cart starts without products', () => {
  assert.deepEqual(cartItems({ days: {}, courses: [], products: { 50: 2, 51: 0 } }), [{ producto_talla_id: 50, cantidad: 2 }]);
  assert.deepEqual(emptyCart(), { days: {}, courses: [], products: {} });
  assert.deepEqual(cartItems({ days: { 10: 1 }, courses: [] }), [{ seminario_dia_id: 10, cantidad: 1 }], 'a cart from before products still works');
});

const compras = [
  { codigo: 'SC-B', nombre: 'Pedro', estado: 'pagada', items: [{ tipo: 'producto', descripcion: 'Polera (talla M)', cantidad: 1 }, { tipo: 'seminario_dia', descripcion: 'Seminario (viernes)', cantidad: 1 }] },
  { codigo: 'SC-A', nombre: 'Ana', estado: 'pendiente', items: [{ tipo: 'producto', descripcion: 'Polera (talla M)', cantidad: 2 }, { tipo: 'producto', descripcion: 'Vara (talla Única)', cantidad: 1 }] },
  { codigo: 'SC-C', nombre: 'Carla', estado: 'anulada', items: [{ tipo: 'producto', descripcion: 'Polera (talla S)', cantidad: 5 }] },
  { codigo: 'SC-D', nombre: 'Diego', estado: 'pagada', items: [{ tipo: 'curso', descripcion: 'Curso', cantidad: 1 }] },
];

test('the pickup list has the products each person picks up at the seminar, by name, leaving out cancelled and shipped orders', async () => {
  const { pickupList } = await import('../src/lib/ventas.js');
  assert.deepEqual(pickupList([...compras, { codigo: 'SC-E', nombre: 'Eva', estado: 'pagada', entrega: 'envio', items: [{ tipo: 'producto', descripcion: 'Polera (talla M)', cantidad: 1 }] }]), [
    { codigo: 'SC-A', nombre: 'Ana', estado: 'pendiente', items: [{ descripcion: 'Polera (talla M)', cantidad: 2 }, { descripcion: 'Vara (talla Única)', cantidad: 1 }] },
    { codigo: 'SC-B', nombre: 'Pedro', estado: 'pagada', items: [{ descripcion: 'Polera (talla M)', cantidad: 1 }] },
  ]);
});

test('the order totals add up each product and size across purchases, to buy from suppliers', async () => {
  const { pickupTotals } = await import('../src/lib/ventas.js');
  assert.deepEqual(pickupTotals(compras), [{ descripcion: 'Polera (talla M)', cantidad: 3 }, { descripcion: 'Vara (talla Única)', cantidad: 1 }]);
});

const shop = [
  { id: 5, titulo: 'Feiyue', precio: 25990, imagen: 'feiyue.webp', sugerido_seminario: true, cerrado: false, tallas: [{ id: 50, talla: '38', disponible: 3 }, { id: 51, talla: '40', disponible: 1 }] },
  { id: 6, titulo: 'Bastón', precio: 24990, imagen: null, tallas: [{ id: 60, talla: 'Única', disponible: 0 }] },
];

test('the cart lines of the store carry the photo, size, quantity and amount, with the total', async () => {
  const { storeLines } = await import('../src/lib/ventas.js');
  const { lines, count, total } = storeLines({ 50: 2, 51: 1 }, shop);
  assert.deepEqual(lines, [
    { tallaId: 50, titulo: 'Feiyue', talla: '38', imagen: 'feiyue.webp', precio: 25990, cantidad: 2, disponible: 3, monto: 51980, retiro: true },
    { tallaId: 51, titulo: 'Feiyue', talla: '40', imagen: 'feiyue.webp', precio: 25990, cantidad: 1, disponible: 1, monto: 25990, retiro: true },
  ]);
  assert.deepEqual([count, total], [3, 77970]);
  assert.deepEqual(storeLines({}, shop), { lines: [], count: 0, total: 0 });
});

test('a saved cart keeps only sizes still on sale, within stock and the per-size limit', async () => {
  const { cleanCart } = await import('../src/lib/ventas.js');
  assert.deepEqual(cleanCart({ 50: 2, 51: 5, 60: 1, 99: 3, abc: 1 }, shop), { 50: 2, 51: 1 });
  assert.deepEqual(cleanCart({ 50: 25 }, [{ ...shop[0], tallas: [{ id: 50, talla: '38', disponible: 40 }] }]), { 50: 10 });
  assert.deepEqual(cleanCart({ 50: -1, 51: 1.5 }, shop), {});
  assert.deepEqual(cleanCart('basura', shop), {});
  assert.deepEqual(cleanCart({ 50: 1 }, [{ ...shop[0], cerrado: true }]), { 50: 1 }, 'a closed presale only closes the pickup: shipping stays');
});

test('the shipping list has each order to send with its address, leaving out cancelled ones', async () => {
  const { shippingList, pickupTotals } = await import('../src/lib/ventas.js');
  const orders = [
    { codigo: 'SC-E', nombre: 'Eva', estado: 'pagada', entrega: 'envio', direccion: 'Av. Colón 1234', comuna: 'Hualpén', region: 'Biobío', items: [{ tipo: 'producto', descripcion: 'Polera (talla M)', cantidad: 1 }] },
    { codigo: 'SC-F', nombre: 'Fabián', estado: 'anulada', entrega: 'envio', direccion: 'X 1', comuna: 'Y', region: 'Z', items: [{ tipo: 'producto', descripcion: 'Polera (talla S)', cantidad: 1 }] },
    { codigo: 'SC-A', nombre: 'Ana', estado: 'pendiente', entrega: 'retiro', items: [{ tipo: 'producto', descripcion: 'Polera (talla M)', cantidad: 2 }] },
  ];
  assert.deepEqual(shippingList(orders), [
    { codigo: 'SC-E', nombre: 'Eva', estado: 'pagada', direccion: 'Av. Colón 1234, Hualpén, Biobío', items: [{ descripcion: 'Polera (talla M)', cantidad: 1 }] },
  ]);
  assert.deepEqual(pickupTotals(orders), [{ descripcion: 'Polera (talla M)', cantidad: 3 }], 'what to buy adds shipped and picked-up orders');
});

test('the delivery form needs a choice, and an address for shipping', async () => {
  const { validateDelivery } = await import('../src/lib/ventas.js');
  assert.deepEqual(validateDelivery({ entrega: 'retiro' }), {});
  assert.deepEqual(validateDelivery({ entrega: 'envio', direccion: 'Av. Colón 1234', comuna: 'Hualpén', region: 'Biobío' }), {});
  assert.deepEqual(Object.keys(validateDelivery({ entrega: '' })), ['entrega']);
  assert.deepEqual(Object.keys(validateDelivery({ entrega: 'envio', direccion: ' ', comuna: '', region: 'B' })), ['direccion', 'comuna', 'region']);
});
