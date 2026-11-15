// Fase 2, T8: the API the virtual assistant (n8n) calls. It is not a person:
// it authenticates with a shared key instead of a login.
const test = require('node:test');
const assert = require('node:assert/strict');
const { withApi } = require('./apiHarness');

const USERS = [['Admin', 'admin@x.cl', ['Administrador']]];
const KEY = 'k'.repeat(40);
const ENV = { env: { ASISTENTE_API_KEY: KEY } };
const AUTH = { 'X-Asistente-Key': KEY };
const BASE = '/api/asistente';

const DAY_MS = 24 * 60 * 60 * 1000;
const isoDate = (offsetDays) => new Date(Date.now() + offsetDays * DAY_MS).toISOString().slice(0, 10);
const weekdayOf = (iso) => new Date(`${iso}T00:00:00Z`).getUTCDay() || 7;

const lead = (overrides = {}) => ({ nombre: 'Juan Pérez', email: 'juan@example.com', consentimiento: true, origen: 'instagram', ...overrides });

async function sesionOn({ call, admin }, offset) {
    const fecha = isoDate(offset);
    const sede = (await call('GET', '/api/intranet/sedes', admin)).body[0];
    const disciplina = (await call('GET', '/api/intranet/disciplinas', admin)).body[0];
    const clase = (await call('POST', '/api/intranet/clases', admin, {
        sede_id: sede.id, disciplina_id: disciplina.id, dia_semana: weekdayOf(fecha), hora_inicio: '19:00', hora_fin: '20:30',
    })).body;
    await call('POST', `/api/intranet/clases/${clase.id}/sesiones`, admin, { desde: fecha, hasta: fecha });
    return (await call('GET', `/api/intranet/sesiones?desde=${fecha}&hasta=${fecha}`, admin)).body[0];
}

const ROUTES = [
    ['GET', `${BASE}/sesiones`, undefined],
    ['POST', `${BASE}/interesados`, lead()],
    ['POST', `${BASE}/interesados/1/clase-prueba`, { sesion_id: 1 }],
    ['POST', `${BASE}/conversaciones`, { canal: 'sitio', chat_id: 'c1', mensajes: [{ rol: 'persona', texto: 'Hola' }] }],
];

test('without ASISTENTE_API_KEY every assistant route is off, whatever key is sent', async () => {
    await withApi(USERS, async ({ call, knex }) => {
        for (const [method, url, body] of ROUTES) {
            assert.equal((await call(method, url, null, body, AUTH)).status, 503, url);
            assert.equal((await call(method, url, null, body, { 'X-Asistente-Key': '' })).status, 503, url);
        }
        assert.equal((await knex('interesados')).length, 0);
        assert.equal((await knex('conversaciones_asistente')).length, 0);
    });
});

test('assistant routes reject a missing or wrong key, and a login token is not a key', async () => {
    await withApi(USERS, async ({ call, login, knex }) => {
        const admin = await login('admin@x.cl');
        for (const [method, url, body] of ROUTES) {
            assert.equal((await call(method, url, null, body)).status, 401, `${url} no key`);
            assert.equal((await call(method, url, null, body, { 'X-Asistente-Key': `${KEY}x` })).status, 401, `${url} wrong key`);
            assert.equal((await call(method, url, admin, body)).status, 401, `${url} login token`);
        }
        assert.equal((await knex('interesados')).length, 0);
        assert.equal((await knex('conversaciones_asistente')).length, 0);
    }, ENV);
});

test('the assistant sees only upcoming, scheduled sesiones, without private data', async () => {
    await withApi(USERS, async ({ call, login }) => {
        const admin = await login('admin@x.cl');
        const future = await sesionOn({ call, admin }, 5);
        await sesionOn({ call, admin }, -3);
        const cancelled = await sesionOn({ call, admin }, 6);
        await call('POST', `/api/intranet/sesiones/${cancelled.id}/cancelar`, admin, {});

        const { status, body } = await call('GET', `${BASE}/sesiones`, null, undefined, AUTH);
        assert.equal(status, 200);
        assert.deepEqual(body, [{
            id: future.id, fecha: future.fecha, hora_inicio: '19:00', hora_fin: '20:30', sede: future.sede, disciplina: future.disciplina,
        }]);
    }, ENV);
});

test('the assistant registers people with their origin and is not held by the form limit', async () => {
    await withApi(USERS, async ({ call, knex }) => {
        for (let i = 0; i < 7; i += 1) {
            const res = await call('POST', `${BASE}/interesados`, null, lead({ email: `p${i}@example.com` }), AUTH);
            assert.equal(res.status, 201, `request ${i + 1}`);
        }
        const rows = await knex('interesados');
        assert.equal(rows.length, 7);
        assert.ok(rows.every((row) => row.origen === 'instagram' && row.consentimiento_fecha));

        const noConsent = await call('POST', `${BASE}/interesados`, null, lead({ email: 'x@example.com', consentimiento: false }), AUTH);
        assert.equal(noConsent.status, 400);
        assert.equal((await knex('interesados')).length, 7);
    }, ENV);
});

test('the assistant books a trial class and the note has no user', async () => {
    await withApi(USERS, async ({ call, login, knex }) => {
        const admin = await login('admin@x.cl');
        const sesion = await sesionOn({ call, admin }, 5);
        const { body: { id } } = await call('POST', `${BASE}/interesados`, null, lead(), AUTH);

        const booked = await call('POST', `${BASE}/interesados/${id}/clase-prueba`, null, { sesion_id: sesion.id }, AUTH);
        assert.equal(booked.status, 201);
        assert.deepEqual((await knex('clases_prueba')).map((c) => [c.interesado_id, c.sesion_id, c.estado]), [[id, sesion.id, 'agendada']]);
        assert.equal((await knex('interesados').first()).estado, 'clase_prueba');
        const [note] = await knex('seguimientos');
        assert.equal(note.usuario_id, null);
        assert.match(note.nota, /Clase de prueba agendada/);

        assert.equal((await call('POST', `${BASE}/interesados/${id}/clase-prueba`, null, { sesion_id: 999 }, AUTH)).status, 404);
        assert.equal((await call('POST', `${BASE}/interesados/${id}/clase-prueba`, null, undefined, AUTH)).status, 400, 'no body');
        assert.equal((await knex('clases_prueba')).length, 1);
    }, ENV);
});

test('the assistant stores a conversation and links the earlier messages once the person is known', async () => {
    await withApi(USERS, async ({ call, knex }) => {
        const url = `${BASE}/conversaciones`;
        const first = await call('POST', url, null, {
            canal: 'sitio', chat_id: 'chat-1', mensajes: [{ rol: 'persona', texto: ' Hola ' }, { rol: 'asistente', texto: 'Hola, soy el asistente virtual.' }],
        }, AUTH);
        assert.equal(first.status, 201);
        await call('POST', url, null, { canal: 'instagram', chat_id: 'chat-1', mensajes: [{ rol: 'persona', texto: 'Otra persona' }] }, AUTH);

        const { body: { id } } = await call('POST', `${BASE}/interesados`, null, lead(), AUTH);
        const second = await call('POST', url, null, {
            canal: 'sitio', chat_id: 'chat-1', interesado_id: id, mensajes: [{ rol: 'persona', texto: 'Quiero una clase de prueba' }],
        }, AUTH);
        assert.equal(second.status, 201);

        const rows = await knex('conversaciones_asistente').orderBy('id');
        assert.deepEqual(
            rows.map((r) => [r.canal, r.chat_id, r.rol, r.texto, r.interesado_id]),
            [
                ['sitio', 'chat-1', 'persona', 'Hola', id],
                ['sitio', 'chat-1', 'asistente', 'Hola, soy el asistente virtual.', id],
                ['instagram', 'chat-1', 'persona', 'Otra persona', null],
                ['sitio', 'chat-1', 'persona', 'Quiero una clase de prueba', id],
            ],
        );
    }, ENV);
});

test('an invalid conversation is rejected and nothing is stored', async () => {
    await withApi(USERS, async ({ call, knex }) => {
        const ok = { canal: 'sitio', chat_id: 'chat-1', mensajes: [{ rol: 'persona', texto: 'Hola' }] };
        const cases = [
            [{ ...ok, canal: 'telegram' }, 'canal'],
            [{ ...ok, chat_id: '' }, 'chat_id'],
            [{ ...ok, chat_id: 'x'.repeat(101) }, 'chat_id'],
            [{ ...ok, interesado_id: 999 }, 'interesado_id'],
            [{ ...ok, interesado_id: 'uno' }, 'interesado_id'],
            [{ ...ok, mensajes: [] }, 'mensajes'],
            [{ ...ok, mensajes: 'Hola' }, 'mensajes'],
            [{ ...ok, mensajes: Array(21).fill(ok.mensajes[0]) }, 'mensajes'],
            [{ ...ok, mensajes: [ok.mensajes[0], { rol: 'sistema', texto: 'x' }] }, 'rol'],
            [{ ...ok, mensajes: [ok.mensajes[0], { rol: 'persona', texto: ' ' }] }, 'texto'],
            [{ ...ok, mensajes: [{ rol: 'persona', texto: 'x'.repeat(4001) }] }, 'texto'],
        ];
        for (const [body, field] of cases) {
            const res = await call('POST', `${BASE}/conversaciones`, null, body, AUTH);
            assert.equal(res.status, 400, field);
            assert.match(res.body.error, new RegExp(field), field);
        }
        assert.equal((await knex('conversaciones_asistente')).length, 0);
    }, ENV);
});

test('whatsapp is an origin for people and a channel for conversations', async () => {
    await withApi(USERS, async ({ call, knex }) => {
        const { status, body } = await call('POST', `${BASE}/interesados`, null, lead({ origen: 'whatsapp' }), AUTH);
        assert.equal(status, 201);
        const saved = await call('POST', `${BASE}/conversaciones`, null, {
            canal: 'whatsapp', chat_id: 'wa-1', interesado_id: body.id, mensajes: [{ rol: 'persona', texto: 'Hola' }],
        }, AUTH);
        assert.equal(saved.status, 201);
        assert.equal((await knex('interesados').first()).origen, 'whatsapp');
        assert.equal((await knex('conversaciones_asistente').first()).canal, 'whatsapp');
    }, ENV);
});
