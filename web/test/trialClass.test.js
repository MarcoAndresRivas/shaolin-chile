import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateTrialRequest, buildTrialMessage, buildWhatsappUrl, buildLeadPayload } from '../src/lib/trialClass.js';

const valid = {
  name: 'Ana Pérez',
  email: 'ana@example.com',
  discipline: 'Sanda',
  location: 'Concepción',
  message: '',
  telefono: '',
  consent: true,
};

test('a complete request has no errors', () => {
  assert.deepEqual(validateTrialRequest(valid), {});
});

test('name, email, discipline and location are required', () => {
  const errors = validateTrialRequest({ name: ' ', email: '', discipline: '', location: '', consent: true });
  assert.deepEqual(Object.keys(errors).sort(), ['discipline', 'email', 'location', 'name']);
});

test('consent is required, and a phone number is optional but must look like one', () => {
  assert.equal(validateTrialRequest({ ...valid, consent: false }).consent, 'Debes aceptar que guardemos tus datos para contactarte.');
  assert.deepEqual(validateTrialRequest({ ...valid, telefono: '+56 9 8615 7545' }), {});
  assert.equal(validateTrialRequest({ ...valid, telefono: 'abc' }).telefono, 'Ingresa un teléfono válido.');
});

test('an invalid email is rejected', () => {
  const errors = validateTrialRequest({ ...valid, email: 'ana@' });
  assert.equal(errors.email, 'Ingresa un correo válido.');
});

test('the message lists every field and omits an empty comment', () => {
  const text = buildTrialMessage(valid);
  assert.equal(
    text,
    [
      'Hola, quiero reservar una clase de prueba gratuita.',
      'Nombre: Ana Pérez',
      'Correo: ana@example.com',
      'Disciplina: Sanda',
      'Sede: Concepción',
    ].join('\n'),
  );
});

test('the message includes a trimmed comment when present', () => {
  const text = buildTrialMessage({ ...valid, message: '  Tengo una lesión de rodilla.  ' });
  assert.ok(text.endsWith('\nComentario: Tengo una lesión de rodilla.'));
});

test('the WhatsApp URL targets the official number with the encoded message', () => {
  const url = buildWhatsappUrl('56986157545', 'Hola\nNombre: Ana Pérez');
  assert.equal(url, 'https://wa.me/56986157545?text=Hola%0ANombre%3A%20Ana%20P%C3%A9rez');
});

const catalog = {
  sedes: [{ id: 1, ciudad: 'Concepción' }, { id: 2, ciudad: 'Santiago' }],
  disciplinas: [{ id: 10, nombre: 'Kung Fu Tradicional' }, { id: 11, nombre: 'Sanda (Boxeo Chino)' }],
};

test('the API payload maps the chosen names to catalog ids and records consent', () => {
  const payload = buildLeadPayload({ ...valid, name: '  Ana Pérez ', discipline: 'Sanda (Boxeo Chino)', location: 'Santiago', telefono: '+56 9 1', message: 'Hola' }, catalog);
  assert.deepEqual(payload, {
    nombre: 'Ana Pérez', email: 'ana@example.com', telefono: '+56 9 1', sede_id: 2, disciplina_id: 11, mensaje: 'Hola', consentimiento: true, origen: 'sitio',
  });
});

test('the payload leaves out empty optional fields and unknown catalog entries', () => {
  const payload = buildLeadPayload({ ...valid, discipline: 'Algo nuevo', location: 'Valdivia' }, catalog);
  assert.deepEqual(payload, { nombre: 'Ana Pérez', email: 'ana@example.com', consentimiento: true, origen: 'sitio' });
  assert.deepEqual(buildLeadPayload(valid, null).nombre, 'Ana Pérez', 'works without a catalog');
});
