// Seminars and courses on the site: the cart, its estimated price and the
// photo of each offer. The server computes the real total; this only shows it
// beforehand, with the same pack rule.

const WEEKDAY = new Intl.DateTimeFormat('es-CL', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });

// "viernes, 4 de diciembre"
export const dayLabel = (fecha) => WEEKDAY.format(new Date(`${fecha}T12:00:00Z`));

const WEEKDAY_ONLY = new Intl.DateTimeFormat('es-CL', { weekday: 'long', timeZone: 'UTC' });
const MONTH_ONLY = new Intl.DateTimeFormat('es-CL', { month: 'long', timeZone: 'UTC' });
const AND = new Intl.ListFormat('es', { type: 'conjunction' });

// The seminar the site announces: the first published one with a day still open.
export function currentSeminar(catalog) {
  return catalog?.seminarios?.find((s) => s.dias.some((d) => !d.cerrado)) ?? null;
}

// "viernes 4 y sábado 5 de diciembre", or each with its month when they differ.
export function seminarDates(seminario) {
  const days = seminario.dias.map((d) => {
    const date = new Date(`${d.fecha}T12:00:00Z`);
    return { day: `${WEEKDAY_ONLY.format(date)} ${date.getUTCDate()}`, month: MONTH_ONLY.format(date) };
  });
  const month = days[0]?.month;
  return days.every((d) => d.month === month)
    ? `${AND.format(days.map((d) => d.day))} de ${month}`
    : AND.format(days.map((d) => `${d.day} de ${d.month}`));
}

export function hoursLabel(dia) {
  if (!dia.hora_inicio) return 'Horario por confirmar';
  return dia.hora_fin ? `${dia.hora_inicio} a ${dia.hora_fin}` : `Desde las ${dia.hora_inicio}`;
}

// A file in the site's /ofertas folder, or an https address.
export function offerImage(imagen, base = '') {
  if (!imagen) return null;
  if (/^https:\/\//.test(imagen)) return imagen;
  if (!/^[\w.-]+$/.test(imagen)) return null;
  return `${base.replace(/\/$/, '')}/ofertas/${imagen}`;
}

// cart: { days: { [diaId]: cantidad }, courses: [cursoId], products: { [tallaId]: cantidad } }
export const emptyCart = () => ({ days: {}, courses: [], products: {} });

const chosen = (counts = {}) => Object.entries(counts).filter(([, cantidad]) => cantidad > 0);

export function cartItems(cart) {
  return [
    ...chosen(cart.days).map(([id, cantidad]) => ({ seminario_dia_id: Number(id), cantidad })),
    ...cart.courses.map((id) => ({ curso_id: id })),
    ...chosen(cart.products).map(([id, cantidad]) => ({ producto_talla_id: Number(id), cantidad })),
  ];
}

// The estimated price of the cart against the catalog: the sum of the days and
// courses, and the pack price for a seminar bought on every day with the same tickets.
export function estimate(cart, catalog) {
  let subtotal = 0;
  let descuento = 0;
  const lines = [];
  for (const seminario of catalog?.seminarios ?? []) {
    const bought = seminario.dias.filter((dia) => cart.days[dia.id] > 0);
    for (const dia of bought) {
      const cantidad = cart.days[dia.id];
      subtotal += dia.precio * cantidad;
      lines.push({ key: `d${dia.id}`, label: `${seminario.titulo} · ${dayLabel(dia.fecha)}`, cantidad, monto: dia.precio * cantidad });
    }
    const quantities = new Set(bought.map((dia) => cart.days[dia.id]));
    if (seminario.precio_pack && bought.length === seminario.dias.length && bought.length > 0 && quantities.size === 1) {
      const [cantidad] = quantities;
      const sum = bought.reduce((total, dia) => total + dia.precio * cantidad, 0);
      descuento += Math.max(0, sum - seminario.precio_pack * cantidad);
    }
  }
  for (const curso of catalog?.cursos ?? []) {
    if (!cart.courses.includes(curso.id)) continue;
    subtotal += curso.precio;
    lines.push({ key: `c${curso.id}`, label: curso.titulo, cantidad: 1, monto: curso.precio });
  }
  for (const producto of catalog?.productos ?? []) {
    for (const talla of producto.tallas) {
      const cantidad = cart.products?.[talla.id] ?? 0;
      if (cantidad < 1) continue;
      subtotal += producto.precio * cantidad;
      lines.push({ key: `p${talla.id}`, label: `${producto.titulo} (talla ${talla.talla})`, cantidad, monto: producto.precio * cantidad });
    }
  }
  return { lines, subtotal, descuento, total: subtotal - descuento };
}

const MAX_UNITS = 10; // units of one product size in one purchase, as the server allows

// The store cart: { [tallaId]: cantidad } -> lines with photo, size and amount.
export function storeLines(cart, productos) {
  const lines = [];
  for (const producto of productos) {
    for (const talla of producto.tallas) {
      const cantidad = cart[talla.id] ?? 0;
      if (cantidad < 1) continue;
      lines.push({
        tallaId: talla.id, titulo: producto.titulo, talla: talla.talla, imagen: producto.imagen,
        precio: producto.precio, cantidad, disponible: talla.disponible, monto: producto.precio * cantidad,
        retiro: Boolean(producto.sugerido_seminario) && !producto.cerrado, // can be picked up at the seminar
      });
    }
  }
  return { lines, count: lines.reduce((sum, l) => sum + l.cantidad, 0), total: lines.reduce((sum, l) => sum + l.monto, 0) };
}

// A cart read back from the browser: only whole quantities of sizes still on sale, within stock.
export function cleanCart(saved, productos) {
  if (!saved || typeof saved !== 'object') return {};
  const clean = {};
  for (const producto of productos) {
    for (const talla of producto.tallas) {
      const cantidad = saved[talla.id];
      if (!Number.isInteger(cantidad) || cantidad < 1) continue;
      const allowed = Math.min(cantidad, talla.disponible, MAX_UNITS);
      if (allowed > 0) clean[talla.id] = allowed;
    }
  }
  return clean;
}

const productItems = (items) => items.filter((i) => i.tipo === 'producto').map(({ descripcion, cantidad }) => ({ descripcion, cantidad }));
const byName = (a, b) => a.nombre.localeCompare(b.nombre, 'es');

// Products to hand out at the seminar: each order not cancelled nor shipped, by buyer name.
export function pickupList(compras) {
  return compras
    .filter((c) => c.estado !== 'anulada' && c.entrega !== 'envio')
    .map(({ codigo, nombre, estado, items }) => ({ codigo, nombre, estado, items: productItems(items) }))
    .filter((c) => c.items.length)
    .sort(byName);
}

// Orders to ship: each not cancelled, with its address in one line.
export function shippingList(compras) {
  return compras
    .filter((c) => c.estado !== 'anulada' && c.entrega === 'envio')
    .map(({ codigo, nombre, estado, direccion, comuna, region, items }) => ({
      codigo, nombre, estado, direccion: [direccion, comuna, region].filter(Boolean).join(', '), items: productItems(items),
    }))
    .filter((c) => c.items.length)
    .sort(byName);
}

// The delivery form: { entrega, direccion?, comuna?, region? } -> errors by field.
export function validateDelivery(values) {
  const errors = {};
  if (!['envio', 'retiro'].includes(values.entrega)) errors.entrega = 'Elige cómo recibir tu pedido.';
  if (values.entrega === 'envio') {
    // The same limits the server applies, so a long value gets its own message.
    const direccion = (values.direccion ?? '').trim();
    const comuna = (values.comuna ?? '').trim();
    const region = (values.region ?? '').trim();
    if (direccion.length < 3) errors.direccion = 'Escribe la calle y el número.';
    else if (direccion.length > 255) errors.direccion = 'La dirección admite hasta 255 caracteres.';
    if (comuna.length < 2) errors.comuna = 'Escribe la comuna.';
    else if (comuna.length > 100) errors.comuna = 'La comuna admite hasta 100 caracteres.';
    if (region.length < 2) errors.region = 'Escribe la región.';
    else if (region.length > 100) errors.region = 'La región admite hasta 100 caracteres.';
  }
  return errors;
}

// How many of each product and size to buy, across every order not cancelled (shipped or picked up).
export function pickupTotals(compras) {
  const totals = new Map();
  for (const { estado, items } of compras) {
    if (estado === 'anulada') continue;
    for (const { descripcion, cantidad } of productItems(items)) totals.set(descripcion, (totals.get(descripcion) ?? 0) + cantidad);
  }
  return [...totals].map(([descripcion, cantidad]) => ({ descripcion, cantidad })).sort((a, b) => a.descripcion.localeCompare(b.descripcion, 'es'));
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// The buyer's form: { nombre, email, telefono, consentimiento } -> errors by field.
export function validateBuyer(values) {
  const errors = {};
  if (values.nombre.trim().length < 2) errors.nombre = 'Escribe tu nombre completo.';
  if (!EMAIL.test(values.email.trim())) errors.email = 'Escribe un correo válido.';
  if (values.telefono.trim() && !/^[+\d][\d\s()-]{5,24}$/.test(values.telefono.trim())) errors.telefono = 'Escribe un teléfono válido.';
  if (!values.consentimiento) errors.consentimiento = 'Necesitamos tu autorización para gestionar la compra.';
  return errors;
}
