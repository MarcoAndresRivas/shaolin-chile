// Seminars and courses on the site: the cart, its estimated price and the
// photo of each offer. The server computes the real total; this only shows it
// beforehand, with the same pack rule.

const WEEKDAY = new Intl.DateTimeFormat('es-CL', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });

// "viernes, 4 de diciembre"
export const dayLabel = (fecha) => WEEKDAY.format(new Date(`${fecha}T12:00:00Z`));

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

// cart: { days: { [diaId]: cantidad }, courses: [cursoId] }
export const emptyCart = () => ({ days: {}, courses: [] });

export function cartItems(cart) {
  return [
    ...Object.entries(cart.days)
      .filter(([, cantidad]) => cantidad > 0)
      .map(([id, cantidad]) => ({ seminario_dia_id: Number(id), cantidad })),
    ...cart.courses.map((id) => ({ curso_id: id })),
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
  return { lines, subtotal, descuento, total: subtotal - descuento };
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
