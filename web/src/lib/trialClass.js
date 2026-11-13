// Trial-class request: validation, the body sent to the API and the WhatsApp
// message used as a fallback when the server cannot be reached, so the person
// is never lost.

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^[+\d][\d\s()-]{5,24}$/;

const REQUIRED = {
  name: 'Ingresa tu nombre.',
  email: 'Ingresa tu correo.',
  discipline: 'Elige una disciplina.',
  location: 'Elige una sede.',
};

export function validateTrialRequest(request) {
  const errors = {};
  for (const [field, message] of Object.entries(REQUIRED)) {
    if (!String(request[field] ?? '').trim()) errors[field] = message;
  }
  if (!errors.email && !EMAIL_PATTERN.test(request.email.trim())) {
    errors.email = 'Ingresa un correo válido.';
  }
  const phone = String(request.telefono ?? '').trim();
  if (phone && !PHONE_PATTERN.test(phone)) errors.telefono = 'Ingresa un teléfono válido.';
  if (request.consent !== true) errors.consent = 'Debes aceptar que guardemos tus datos para contactarte.';
  return errors;
}

// Body for POST /api/interesados. The visitor picks names; the API wants ids,
// which come from the public catalog. Entries missing from the catalog are
// left out instead of failing the whole request.
export function buildLeadPayload({ name, email, telefono, discipline, location, message }, catalog) {
  const sede = catalog?.sedes?.find((s) => s.ciudad === location);
  const disciplina = catalog?.disciplinas?.find((d) => d.nombre === discipline);
  const phone = String(telefono ?? '').trim();
  const comment = String(message ?? '').trim();
  return {
    nombre: name.trim(),
    email: email.trim(),
    ...(phone && { telefono: phone }),
    ...(sede && { sede_id: sede.id }),
    ...(disciplina && { disciplina_id: disciplina.id }),
    ...(comment && { mensaje: comment }),
    consentimiento: true,
    origen: 'sitio',
  };
}

export function buildTrialMessage({ name, email, discipline, location, message }) {
  const lines = [
    'Hola, quiero reservar una clase de prueba gratuita.',
    `Nombre: ${name.trim()}`,
    `Correo: ${email.trim()}`,
    `Disciplina: ${discipline}`,
    `Sede: ${location}`,
  ];
  const comment = String(message ?? '').trim();
  if (comment) lines.push(`Comentario: ${comment}`);
  return lines.join('\n');
}

export function buildWhatsappUrl(phone, text) {
  return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
}
