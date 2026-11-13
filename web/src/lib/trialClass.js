// Trial-class request: validation and the WhatsApp message it produces.
// Until the leads API exists (Fase 2), the request is sent through WhatsApp.

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
  return errors;
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
