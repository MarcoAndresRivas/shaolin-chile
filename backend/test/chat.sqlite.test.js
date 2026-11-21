// Fase 2, T8b: the public chat of the site. The model is scripted; everything
// else is real, including the calls the assistant makes to /api/asistente.
const test = require('node:test');
const assert = require('node:assert/strict');
const { withApi } = require('./apiHarness');
const { FALLBACK } = require('../src/asistente');

const USERS = [['Admin', 'admin@x.cl', ['Administrador']]];
const KEY = 'k'.repeat(40);
const CHAT = '/api/chat';

const say = (content) => ({ role: 'assistant', content });
const use = (name, args = {}) => ({ role: 'assistant', content: '', tool_calls: [{ id: `call_${name}`, type: 'function', function: { name, arguments: JSON.stringify(args) } }] });

// Runs fn with the chat on and a model that follows `script`.
function withChat(script, fn) {
    const seen = [];
    const assistantModel = async (messages) => {
        seen.push(structuredClone(messages));
        const next = script.shift();
        if (next instanceof Error) throw next;
        return next;
    };
    return withApi(USERS, (tools) => fn({ ...tools, seen }), { env: { ASISTENTE_API_KEY: KEY }, assistantModel });
}

test('the chat is off without the assistant key or without a model', async () => {
    await withApi(USERS, async ({ call }) => {
        assert.equal((await call('POST', CHAT, null, { mensaje: 'Hola' })).status, 503);
    }, { env: { ASISTENTE_API_KEY: KEY } });
    await withApi(USERS, async ({ call }) => {
        assert.equal((await call('POST', CHAT, null, { mensaje: 'Hola' })).status, 503);
    }, { assistantModel: async () => say('Hola') });
});

test('a visitor chats without logging in, and the chat id keeps the conversation going', async () => {
    await withChat([say('Hola, ¿en qué te ayudo?'), say('Claro.'), say('Hola.')], async ({ call, seen }) => {
        const first = await call('POST', CHAT, null, { mensaje: ' Hola ' });
        assert.equal(first.status, 200);
        assert.equal(first.body.respuesta, 'Soy el asistente virtual de Shaolin Chile.\n\nHola, ¿en qué te ayudo?');
        assert.match(first.body.chat_id, /^[0-9a-f-]{36}$/);

        const second = await call('POST', CHAT, null, { chat_id: first.body.chat_id, mensaje: 'Gracias' });
        assert.deepEqual(second.body, { chat_id: first.body.chat_id, respuesta: 'Claro.' });
        assert.deepEqual(seen[1].slice(1).map((m) => m.content), ['Hola', first.body.respuesta, 'Gracias']);

        const stranger = await call('POST', CHAT, null, { chat_id: 'made-up', mensaje: 'Hola' });
        assert.notEqual(stranger.body.chat_id, 'made-up', 'a chat id the server did not issue starts a new chat');
        assert.equal(seen[2].length, 2, 'and it starts without history');
    });
});

test('through the chat a person sees the classes, registers with consent and books a trial class', async () => {
    const script = [
        say('Hay una clase.'),
        use('registrar_interesado', { nombre: 'Juan Pérez', email: 'juan@example.com', consentimiento: true }),
        use('agendar_clase_prueba', { sesion_id: 0 }), // replaced below with the real id
        say('Quedaste agendado.'),
    ];
    await withChat(script, async ({ call, login, knex, seen }) => {
        const admin = await login('admin@x.cl');
        const fecha = new Date(Date.now() + 5 * 864e5).toISOString().slice(0, 10);
        const sede = (await call('GET', '/api/intranet/sedes', admin)).body[0];
        const disciplina = (await call('GET', '/api/intranet/disciplinas', admin)).body[0];
        const clase = (await call('POST', '/api/intranet/clases', admin, {
            sede_id: sede.id, disciplina_id: disciplina.id, dia_semana: new Date(`${fecha}T00:00:00Z`).getUTCDay() || 7, hora_inicio: '19:00', hora_fin: '20:30',
        })).body;
        await call('POST', `/api/intranet/clases/${clase.id}/sesiones`, admin, { desde: fecha, hasta: fecha });
        const sesion = await knex('sesiones').first();
        script[2] = use('agendar_clase_prueba', { sesion_id: sesion.id });

        const first = await call('POST', CHAT, null, { mensaje: '¿Qué clases hay?' });
        const classes = seen[0][0].content.split('Clases programadas:\n')[1];
        assert.match(classes, new RegExp(`^- \\S+ \\d+ de \\S+, de 19:00 a 20:30, ${disciplina.nombre.replace(/[()]/g, '\\$&')}, sede ${sede.ciudad} \\[id ${sesion.id}\\]$`));
        assert.deepEqual(await knex('conversaciones_asistente'), [], 'nothing is stored before the person agrees');

        const second = await call('POST', CHAT, null, { chat_id: first.body.chat_id, mensaje: 'Soy Juan Pérez, juan@example.com. Sí, autorizo.' });
        assert.equal(second.body.respuesta, 'Quedaste agendado.');

        const person = await knex('interesados').first();
        assert.deepEqual([person.nombre, person.origen, person.estado], ['Juan Pérez', 'sitio', 'clase_prueba']);
        assert.deepEqual((await knex('clases_prueba')).map((c) => [c.interesado_id, c.sesion_id]), [[person.id, sesion.id]]);
        const stored = await knex('conversaciones_asistente').orderBy('id');
        assert.deepEqual(stored.map((m) => [m.canal, m.chat_id, m.interesado_id, m.rol]), [
            ['sitio', first.body.chat_id, person.id, 'persona'],
            ['sitio', first.body.chat_id, person.id, 'asistente'],
            ['sitio', first.body.chat_id, person.id, 'persona'],
            ['sitio', first.body.chat_id, person.id, 'asistente'],
        ]);
    });
});

test('an empty, long or malformed message is rejected and never reaches the model', async () => {
    await withChat([], async ({ call, seen }) => {
        for (const body of [{}, { mensaje: '  ' }, { mensaje: 'x'.repeat(1001) }, { mensaje: 42 }, { mensaje: ['Hola'] }, undefined]) {
            const res = await call('POST', CHAT, null, body);
            assert.equal(res.status, 400, JSON.stringify(body));
            assert.match(res.body.error, /mensaje/);
        }
        assert.equal(seen.length, 0);
    });
});

test('when the model fails the visitor still gets an answer that sends them to a person', async () => {
    await withChat([new Error('model down')], async ({ call }) => {
        const { status, body } = await call('POST', CHAT, null, { mensaje: 'Hola' });
        assert.equal(status, 200);
        assert.equal(body.respuesta, FALLBACK);
        assert.ok(body.chat_id);
    });
});

test('the chat is limited per visitor and does not use up the form limit', async () => {
    const script = Array(40).fill(null).map(() => say('ok'));
    await withChat(script, async ({ call }) => {
        const as = (ip) => ({ 'X-Forwarded-For': ip });
        for (let i = 0; i < 30; i += 1) assert.equal((await call('POST', CHAT, null, { mensaje: 'Hola' }, as('203.0.113.7'))).status, 200, `message ${i + 1}`);
        assert.equal((await call('POST', CHAT, null, { mensaje: 'Hola' }, as('203.0.113.7'))).status, 429);
        assert.equal((await call('POST', CHAT, null, { mensaje: 'Hola' }, as('198.51.100.9'))).status, 200, 'another visitor is not affected');
        const form = await call('POST', '/api/interesados', null, { nombre: 'Juan Pérez', email: 'j@example.com', consentimiento: true }, as('203.0.113.7'));
        assert.equal(form.status, 201, 'the form has its own limit');
    });
});
