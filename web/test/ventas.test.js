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
