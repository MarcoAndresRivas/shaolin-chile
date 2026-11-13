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

test('an intranet call without a session fails as 401 without reaching the server', async () => {
  const { fetchImpl, calls } = fakeFetch(403, { error: 'Se requiere un token de autenticación.' });
  const api = createApi({ baseUrl: '', fetchImpl, getToken: () => null });
  await assert.rejects(api.reservar(1), { status: 401, message: 'Tu sesión expiró. Ingresa de nuevo.' });
  assert.equal(calls.length, 0);
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
  const api = createApi({ baseUrl: '', fetchImpl, getToken: () => 'abc' });
  await assert.rejects(api.horarios(), { status: 500, message: 'Error del servidor (500).' });
});

test('a network failure raises ApiError with status 0', async () => {
  const api = createApi({
    baseUrl: '',
    getToken: () => 'abc',
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

test('the school endpoints use their routes, methods and query strings', async () => {
    const { fetchImpl, calls } = fakeFetch(200, {});
    const api = createApi({ baseUrl: '', fetchImpl, getToken: () => 'abc' });
    await api.sedes();
    await api.disciplinas();
    await api.clases();
    await api.clases(3);
    await api.crearClase({ sede_id: 1, disciplina_id: 2, dia_semana: 1, hora_inicio: '19:00', hora_fin: '20:30' });
    await api.eliminarClase(5);
    await api.generarSesiones(5, '2026-12-01', '2026-12-31');
    await api.sesiones({ desde: '2026-12-01', hasta: '2026-12-31' });
    await api.sesiones();
    await api.cancelarSesion(8, 'Feriado');
    assert.deepEqual(
        calls.map((c) => `${c.options.method} ${c.url} ${c.options.body ?? ''}`.trim()),
        [
            'GET /api/intranet/sedes',
            'GET /api/intranet/disciplinas',
            'GET /api/intranet/clases',
            'GET /api/intranet/clases?sede_id=3',
            'POST /api/intranet/clases {"sede_id":1,"disciplina_id":2,"dia_semana":1,"hora_inicio":"19:00","hora_fin":"20:30"}',
            'DELETE /api/intranet/clases/5',
            'POST /api/intranet/clases/5/sesiones {"desde":"2026-12-01","hasta":"2026-12-31"}',
            'GET /api/intranet/sesiones?desde=2026-12-01&hasta=2026-12-31',
            'GET /api/intranet/sesiones',
            'POST /api/intranet/sesiones/8/cancelar {"motivo":"Feriado"}',
        ],
    );
});

test('the booking and attendance endpoints use their routes and methods', async () => {
    const { fetchImpl, calls } = fakeFetch(200, {});
    const api = createApi({ baseUrl: '', fetchImpl, getToken: () => 'abc' });
    await api.reservarSesion(4);
    await api.cancelarReservaSesion(4);
    await api.misReservasSesiones();
    await api.asistencia(4);
    await api.guardarAsistencia(4, [{ alumno_id: 7, presente: true }]);
    await api.miAsistencia();
    assert.deepEqual(
        calls.map((c) => `${c.options.method} ${c.url} ${c.options.body ?? ''}`.trim()),
        [
            'POST /api/intranet/sesiones/4/reservar',
            'DELETE /api/intranet/sesiones/4/reservar',
            'GET /api/intranet/reservas/mias',
            'GET /api/intranet/sesiones/4/asistencia',
            'PUT /api/intranet/sesiones/4/asistencia {"asistencias":[{"alumno_id":7,"presente":true}]}',
            'GET /api/intranet/asistencia/mia',
        ],
    );
});

test('the availability endpoints use their routes and methods', async () => {
    const { fetchImpl, calls } = fakeFetch(200, {});
    const api = createApi({ baseUrl: '', fetchImpl, getToken: () => 'abc' });
    await api.disponibilidad();
    await api.disponibilidad(7);
    await api.guardarDisponibilidad([{ dia_semana: 1, hora_inicio: '09:00', hora_fin: '12:00' }]);
    await api.guardarDisponibilidad([], 7);
    assert.deepEqual(
        calls.map((c) => `${c.options.method} ${c.url} ${c.options.body ?? ''}`.trim()),
        [
            'GET /api/intranet/disponibilidad',
            'GET /api/intranet/disponibilidad?instructor_id=7',
            'PUT /api/intranet/disponibilidad {"bloques":[{"dia_semana":1,"hora_inicio":"09:00","hora_fin":"12:00"}]}',
            'PUT /api/intranet/disponibilidad {"bloques":[],"instructor_id":7}',
        ],
    );
});

test('the public form and its catalog are called without a token', async () => {
    const { fetchImpl, calls } = fakeFetch(200, {});
    const api = createApi({ baseUrl: '', fetchImpl, getToken: () => null });
    await api.catalogo();
    await api.registrarInteresado({ nombre: 'Ana', consentimiento: true });
    assert.deepEqual(
        calls.map((c) => `${c.options.method} ${c.url} ${c.options.body ?? ''}`.trim()),
        ['GET /api/catalogo', 'POST /api/interesados {"nombre":"Ana","consentimiento":true}'],
    );
    assert.equal(calls[1].options.headers.Authorization, undefined);
});

test('the follow-up endpoints use their routes and methods', async () => {
    const { fetchImpl, calls } = fakeFetch(200, {});
    const api = createApi({ baseUrl: '', fetchImpl, getToken: () => 'abc' });
    await api.interesados();
    await api.interesados('nuevo');
    await api.interesado(3);
    await api.cambiarEstadoInteresado(3, 'contactado');
    await api.agregarSeguimiento(3, 'Llamé');
    await api.agendarClasePrueba(3, 9);
    await api.resultadoClasePrueba(5, 'asistio');
    assert.deepEqual(
        calls.map((c) => `${c.options.method} ${c.url} ${c.options.body ?? ''}`.trim()),
        [
            'GET /api/intranet/interesados',
            'GET /api/intranet/interesados?estado=nuevo',
            'GET /api/intranet/interesados/3',
            'PUT /api/intranet/interesados/3 {"estado":"contactado"}',
            'POST /api/intranet/interesados/3/seguimientos {"nota":"Llamé"}',
            'POST /api/intranet/interesados/3/clase-prueba {"sesion_id":9}',
            'PUT /api/intranet/clases-prueba/5 {"estado":"asistio"}',
        ],
    );
});

test('booking for a student in your care sends alumno_id, and the family endpoints use their routes', async () => {
    const { fetchImpl, calls } = fakeFetch(200, {});
    const api = createApi({ baseUrl: '', fetchImpl, getToken: () => 'abc' });
    await api.reservarSesion(4, 7);
    await api.cancelarReservaSesion(4, 7);
    await api.miFamilia();
    await api.familias();
    await api.crearFamilia('Familia Soto');
    await api.eliminarFamilia(2);
    await api.agregarMiembro(2, 7, 'alumno');
    await api.quitarMiembro(2, 7);
    assert.deepEqual(
        calls.map((c) => `${c.options.method} ${c.url} ${c.options.body ?? ''}`.trim()),
        [
            'POST /api/intranet/sesiones/4/reservar {"alumno_id":7}',
            'DELETE /api/intranet/sesiones/4/reservar {"alumno_id":7}',
            'GET /api/intranet/familia/mia',
            'GET /api/intranet/familias',
            'POST /api/intranet/familias {"nombre":"Familia Soto"}',
            'DELETE /api/intranet/familias/2',
            'POST /api/intranet/familias/2/miembros {"usuario_id":7,"rol_en_familia":"alumno"}',
            'DELETE /api/intranet/familias/2/miembros/7',
        ],
    );
});
