import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApi, ApiError, apiBaseUrl } from '../src/lib/api.js';

function fakeFetch(status, body) {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => {
        if (body === undefined) throw new SyntaxError('no body');
        return body;
      },
    };
  };
  return { fetchImpl, calls };
}

test('login posts the credentials as JSON and returns the response', async () => {
  const { fetchImpl, calls } = fakeFetch(200, { token: 't', nombre: 'Ana' });
  const api = createApi({ baseUrl: 'http://api.test', fetchImpl });
  assert.deepEqual(await api.login('ana@example.com', 'secret'), { token: 't', nombre: 'Ana' });
  assert.equal(calls[0].url, 'http://api.test/api/login');
  assert.equal(calls[0].options.method, 'POST');
  assert.equal(calls[0].options.headers['Content-Type'], 'application/json');
  assert.equal(calls[0].options.body, JSON.stringify({ email: 'ana@example.com', password: 'secret' }));
  assert.equal(calls[0].options.headers.Authorization, undefined);
});

test('intranet calls send the bearer token', async () => {
  const { fetchImpl, calls } = fakeFetch(200, []);
  const api = createApi({ baseUrl: 'http://api.test', fetchImpl, getToken: () => 'abc' });
  await api.horarios();
  assert.equal(calls[0].url, 'http://api.test/api/intranet/horarios');
  assert.equal(calls[0].options.headers.Authorization, 'Bearer abc');
});

test('each endpoint uses its route and method', async () => {
  const { fetchImpl, calls } = fakeFetch(200, {});
  const api = createApi({ baseUrl: '', fetchImpl, getToken: () => 'abc' });
  await api.usuarios();
  await api.misReservas();
  await api.reservar(4);
  await api.crearHorario({ titulo: 'Sanda' });
  await api.eliminarHorario(9);
  assert.deepEqual(
    calls.map((c) => `${c.options.method} ${c.url} ${c.options.body ?? ''}`.trim()),
    [
      'GET /api/intranet/usuarios',
      'GET /api/intranet/mis-reservas',
      'POST /api/intranet/reservar {"horario_id":4}',
      'POST /api/intranet/horarios {"titulo":"Sanda"}',
      'DELETE /api/intranet/horarios/9',
    ],
  );
});

test('an error response raises ApiError with the server message and status', async () => {
  const { fetchImpl } = fakeFetch(401, { error: 'Credenciales inválidas.' });
  const api = createApi({ baseUrl: '', fetchImpl });
  await assert.rejects(api.login('a@b.cl', 'x'), (error) => {
    assert.ok(error instanceof ApiError);
    assert.equal(error.status, 401);
    assert.equal(error.message, 'Credenciales inválidas.');
    return true;
  });
});

test('an error without a JSON body gets a generic message', async () => {
  const { fetchImpl } = fakeFetch(500, undefined);
  const api = createApi({ baseUrl: '', fetchImpl });
  await assert.rejects(api.horarios(), { status: 500, message: 'Error del servidor (500).' });
});

test('a network failure raises ApiError with status 0', async () => {
  const api = createApi({
    baseUrl: '',
    fetchImpl: async () => {
      throw new TypeError('Failed to fetch');
    },
  });
  await assert.rejects(api.horarios(), { status: 0, message: 'No se pudo conectar con el servidor.' });
});

test('the API URL is the configured one, else local or production by host', () => {
  assert.equal(apiBaseUrl({ configured: 'https://x.test/', hostname: 'localhost' }), 'https://x.test');
  assert.equal(apiBaseUrl({ hostname: 'localhost' }), 'http://localhost:3000');
  assert.equal(apiBaseUrl({ hostname: '127.0.0.1' }), 'http://localhost:3000');
  assert.equal(apiBaseUrl({ hostname: 'marcoandresrivas.github.io' }), 'https://shaolin-chile-backend.onrender.com');
});
