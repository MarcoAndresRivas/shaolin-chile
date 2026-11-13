import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateTrialRequest, buildTrialMessage, buildWhatsappUrl } from '../src/lib/trialClass.js';

const valid = {
  name: 'Ana Pérez',
  email: 'ana@example.com',
  discipline: 'Sanda',
  location: 'Concepción',
  message: '',
};

test('a complete request has no errors', () => {
  assert.deepEqual(validateTrialRequest(valid), {});
});

test('name, email, discipline and location are required', () => {
  const errors = validateTrialRequest({ name: ' ', email: '', discipline: '', location: '' });
  assert.deepEqual(Object.keys(errors).sort(), ['discipline', 'email', 'location', 'name']);
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
