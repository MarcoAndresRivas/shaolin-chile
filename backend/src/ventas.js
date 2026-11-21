// Sales rules shared by the API and the virtual assistant: when a seminar day
// closes, how much a purchase costs and the message that asks for the transfer.

const crypto = require('node:crypto');

// Registration for a day closes this long before it starts.
const CLOSE_BEFORE_MS = 12 * 60 * 60 * 1000;

// A moment as Chilean local time, 'YYYY-MM-DDTHH:MM', so it compares with a day's date and hour.
function chileStamp(date) {
    const parts = Object.fromEntries(
        new Intl.DateTimeFormat('en-CA', {
            timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
        }).formatToParts(date).map((part) => [part.type, part.value]),
    );
    return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

// A day without a start hour closes 12 hours before midnight of its date.
function isClosed(dia, now = new Date()) {
    return `${dia.fecha}T${dia.hora_inicio || '00:00'}` <= chileStamp(new Date(now.getTime() + CLOSE_BEFORE_MS));
}

// A product sells until the end of its presale closing day, Chile time.
function presaleClosed(producto, now = new Date()) {
    return Boolean(producto.cierre_preventa) && producto.cierre_preventa < chileStamp(now).slice(0, 10);
}

// lines: [{ seminario_id?, seminario_dia_id?, cantidad, precio_unitario }]
// seminars: { [seminario_id]: { precio_pack, dias: [dia ids] } }
// Buying every day of a seminar, the same number of tickets for each, costs
// the seminar's pack price instead of the sum of the days.
function priceOf(lines, seminars = {}) {
    const subtotal = lines.reduce((sum, line) => sum + line.cantidad * line.precio_unitario, 0);
    let descuento = 0;
    for (const [id, seminar] of Object.entries(seminars)) {
        if (!seminar.precio_pack || !seminar.dias.length) continue;
        const bought = lines.filter((line) => String(line.seminario_id) === String(id));
        const quantities = new Set(bought.map((line) => line.cantidad));
        const days = new Set(bought.map((line) => line.seminario_dia_id));
        if (days.size !== seminar.dias.length || !seminar.dias.every((dia) => days.has(dia)) || quantities.size !== 1) continue;
        const [cantidad] = quantities;
        const sum = bought.reduce((total, line) => total + line.cantidad * line.precio_unitario, 0);
        descuento += Math.max(0, sum - seminar.precio_pack * cantidad);
    }
    return { subtotal, descuento, total: subtotal - descuento };
}

// A short code people can type and quote in their transfer, without letters that look alike.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function newCode() {
    const bytes = crypto.randomBytes(6);
    return `SC-${Array.from(bytes, (byte) => CODE_ALPHABET[byte % CODE_ALPHABET.length]).join('')}`;
}

const pesos = (amount) => `$${new Intl.NumberFormat('es-CL', { maximumFractionDigits: 0 }).format(amount)}`;

// Bank details, only the fields that are configured.
function bankLines(pago = {}) {
    return [
        ['Banco', pago.banco],
        ['Tipo de cuenta', pago.tipoCuenta],
        ['N° de cuenta', pago.numeroCuenta],
        ['Titular', pago.titular],
        ['RUT', pago.rut],
        ['Correo', pago.email],
    ].filter(([, value]) => value).map(([label, value]) => `${label}: ${value}`);
}

// The message that asks for the transfer, in the school's own words. Instagram
// and WhatsApp show *text* in bold; the site shows plain text.
// `entrega`: how the products arrive, 'envio' (to `direccion`, shipping paid on delivery)
// or 'retiro' (at the seminar, subject to stock); null when there are no products.
// `soloProductos`: a store order, so it speaks of an order instead of seats and enrolment.
function reservationMessage({ codigo, total, concepto, canal = 'sitio', pago = {}, entrega = null, direccion = null, soloProductos = false }) {
    const amount = canal === 'sitio' ? pesos(total) : `*${pesos(total)}*`;
    const bank = bankLines(pago);
    const sendTo = canal === 'sitio' && pago.comprobanteA ? ` ${pago.comprobanteA}` : '';
    const what = soloProductos ? 'pedido' : 'reserva';
    return [
        soloProductos
            ? `🛍️ Para confirmar tu pedido, es necesario realizar una transferencia de ${amount}, correspondiente al valor de ${concepto}. ✨`
            : `🗓️ Para confirmar tu reserva y asegurar tu cupo, es necesario realizar una transferencia de ${amount}, correspondiente al valor de ${concepto}. ✨`,
        bank.length ? `Datos para la transferencia:\n${bank.join('\n')}` : 'Te enviaremos los datos para la transferencia.',
        `Una vez realizada, envíanos tu comprobante + Nombre Completo${sendTo} para confirmar tu ${soloProductos ? 'pedido' : 'inscripción'}. 💕`,
        ...(entrega === 'retiro' ? [`Los productos se retiran en el seminario, sujetos a disponibilidad: retíralos en la mesa de venta con tu código de ${what}. 🥋`] : []),
        ...(entrega === 'envio' ? [`Enviaremos tu pedido a ${direccion}. El envío se paga al recibir. 📦`] : []),
        `Tu código de ${what} es ${codigo}.`,
    ].join('\n\n');
}

module.exports = { chileStamp, isClosed, presaleClosed, priceOf, newCode, pesos, bankLines, reservationMessage, CLOSE_BEFORE_MS };
