// Fase 3: the sales rules — closing time, pack price and the transfer message.
const test = require('node:test');
const assert = require('node:assert/strict');
const { chileStamp, isClosed, priceOf, newCode, reservationMessage } = require('../src/ventas');

test('a moment is written as Chilean local time', () => {
    // 15:00 UTC on 20 November is 12:00 in Santiago (summer time, UTC-3).
    assert.equal(chileStamp(new Date('2026-11-20T15:00:00Z')), '2026-11-20T12:00');
});

test('a day closes 12 hours before it starts', () => {
    const dia = { fecha: '2026-12-04', hora_inicio: '10:00' };
    // 4 December 10:00 in Santiago is 13:00 UTC.
    assert.equal(isClosed(dia, new Date('2026-12-04T00:59:00Z')), false, '12 h 1 min before');
    assert.equal(isClosed(dia, new Date('2026-12-04T01:00:00Z')), true, 'exactly 12 h before');
    assert.equal(isClosed({ fecha: '2026-12-04', hora_inicio: null }, new Date('2026-12-03T15:00:00Z')), true, 'without an hour it counts from midnight');
});

test('buying every day of a seminar, the same tickets each, costs the pack price', () => {
    const seminars = { 1: { precio_pack: 59000, dias: [10, 11] } };
    const day = (id, cantidad) => ({ seminario_id: 1, seminario_dia_id: id, cantidad, precio_unitario: 35000 });

    assert.deepEqual(priceOf([day(10, 1), day(11, 1)], seminars), { subtotal: 70000, descuento: 11000, total: 59000 });
    assert.deepEqual(priceOf([day(10, 2), day(11, 2)], seminars), { subtotal: 140000, descuento: 22000, total: 118000 });
    assert.deepEqual(priceOf([day(10, 1)], seminars), { subtotal: 35000, descuento: 0, total: 35000 }, 'one day pays the day price');
    assert.deepEqual(priceOf([day(10, 2), day(11, 1)], seminars), { subtotal: 105000, descuento: 0, total: 105000 }, 'different tickets per day: no pack');
    assert.deepEqual(priceOf([day(10, 1), day(11, 1)], { 1: { precio_pack: null, dias: [10, 11] } }).total, 70000, 'no pack price set');
    const withCourse = [day(10, 1), day(11, 1), { curso_id: 3, cantidad: 1, precio_unitario: 25000 }];
    assert.equal(priceOf(withCourse, seminars).total, 84000, 'a course adds its own price');
});

test('purchase codes are short, readable and different', () => {
    const codes = new Set(Array.from({ length: 200 }, newCode));
    assert.equal(codes.size, 200);
    for (const code of codes) assert.match(code, /^SC-[A-HJ-NP-Z2-9]{6}$/);
});

test('the transfer message follows the school wording, in bold on Instagram and WhatsApp', () => {
    const base = { codigo: 'SC-ABC234', total: 59000, concepto: 'el seminario' };
    const site = reservationMessage({ ...base, canal: 'sitio', pago: { comprobanteA: 'por WhatsApp al +56 9 8615 7545' } });
    assert.match(site, /transferencia de \$59\.000, correspondiente al valor de el seminario/);
    assert.match(site, /envíanos tu comprobante \+ Nombre Completo por WhatsApp al \+56 9 8615 7545/);
    assert.match(site, /Te enviaremos los datos para la transferencia/, 'without bank details it says they will be sent');
    assert.match(site, /SC-ABC234/);

    const dm = reservationMessage({ ...base, canal: 'instagram', pago: { banco: 'Banco Estado', numeroCuenta: '123', comprobanteA: 'x' } });
    assert.match(dm, /\*\$59\.000\*/);
    assert.match(dm, /Banco: Banco Estado\nN° de cuenta: 123/);
    assert.doesNotMatch(dm, /Nombre Completo x/, 'in a DM the receipt is sent in the same chat');
});
