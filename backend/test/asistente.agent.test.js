// The assistant's loop, its chats and its model client, with a scripted model.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createAgent, createChats, createModelClient, FALLBACK } = require('../src/asistente');

const say = (content) => ({ role: 'assistant', content });
const use = (name, args = {}) => ({ role: 'assistant', content: '', tool_calls: [{ function: { name, arguments: args } }] });

// A model that answers with a fixed script, and an API that records its calls.
function setup(script, responses = {}, canal = 'whatsapp') {
    const calls = [];
    const seen = [];
    const agent = createAgent({
        canal,
        chat: async (messages) => {
            seen.push(structuredClone(messages));
            const next = script.shift();
            if (next instanceof Error) throw next;
            return next;
        },
        api: async (method, path, body) => {
            // The classes are read on every message; `calls` keeps what the model asked for.
            const classes = method === 'GET' && path === '/sesiones';
            if (!classes) calls.push([method, path, body]);
            const response = responses[`${method} ${path}`];
            if (response instanceof Error) throw response;
            return response ?? { status: 200, body: classes ? [] : {} };
        },
    });
    return { agent, calls, seen, state: { history: [], interesadoId: null } };
}

const lastToolResult = (seen) => JSON.parse(seen.at(-1).findLast((m) => m.role === 'tool').content);

test('a plain answer is returned and the exchange is kept in the history', async () => {
    const { agent, state, seen } = setup([say('Hola, soy el asistente virtual.')]);
    assert.equal(await agent.handle(state, 'Hola'), 'Hola, soy el asistente virtual.');
    assert.deepEqual(state.history.map((m) => [m.role, m.content]), [['user', 'Hola'], ['assistant', 'Hola, soy el asistente virtual.']]);
    assert.equal(seen[0][0].role, 'system');
});

test('the first answer always says it is a virtual assistant, and later ones do not repeat it', async () => {
    const { agent, state } = setup([say('Hola, ¿en qué te ayudo?'), say('Claro.')]);
    assert.equal(await agent.handle(state, 'Hola'), 'Soy el asistente virtual de Shaolin Chile.\n\nHola, ¿en qué te ayudo?');
    assert.equal(await agent.handle(state, 'Gracias'), 'Claro.');
});

const classesIn = (seen) => seen.at(-1)[0].content.split('Clases programadas:\n')[1];

test('the model always receives the real upcoming classes, with their weekday, without having to ask', async () => {
    const sesiones = [
        { id: 7, fecha: '2026-12-05', hora_inicio: '10:00', hora_fin: '12:00', sede: 'Santiago', disciplina: 'Sanda' },
        { id: 9, fecha: '2026-12-07', hora_inicio: '19:00', hora_fin: '20:30', sede: 'Talca', disciplina: 'Tai Chi' },
    ];
    const { agent, state, seen } = setup([say('Hay Sanda el sábado.'), say('Sí.')], { 'GET /sesiones': { status: 200, body: sesiones } });
    await agent.handle(state, 'Hola');
    assert.equal(classesIn(seen), '- id 7: sábado 2026-12-05, de 10:00 a 12:00, Sanda, sede Santiago\n- id 9: lunes 2026-12-07, de 19:00 a 20:30, Tai Chi, sede Talca');
    sesiones.pop();
    await agent.handle(state, '¿Y ahora?');
    assert.equal(classesIn(seen), '- id 7: sábado 2026-12-05, de 10:00 a 12:00, Sanda, sede Santiago', 'the list is read again on every message');
});

test('with no classes, or when they cannot be read, the model is told so instead of being left to guess', async () => {
    const none = setup([say('No hay clases.')]);
    await none.agent.handle(none.state, 'Hola');
    assert.equal(classesIn(none.seen), 'No hay clases programadas por ahora.');

    for (const failure of [{ status: 503, body: { error: 'off' } }, new Error('ECONNREFUSED')]) {
        const down = setup([say('Te responderá una persona.')], { 'GET /sesiones': failure });
        assert.match(await down.agent.handle(down.state, '¿Qué clases hay?'), /Te responderá una persona\.$/);
        assert.match(classesIn(down.seen), /^No se pudieron consultar/);
    }
});

test('nobody is registered without consent, and the API is not called', async () => {
    const { agent, state, calls, seen } = setup([
        use('registrar_interesado', { nombre: 'Juan Pérez', email: 'juan@example.com', consentimiento: false }),
        say('Necesito tu autorización para guardar tus datos.'),
    ]);
    await agent.handle(state, 'Soy Juan, juan@example.com');
    assert.deepEqual(calls, []);
    assert.match(lastToolResult(seen).error, /consentimiento/);
    assert.equal(state.interesadoId, null);
});

test('registering with consent sends the person as a whatsapp lead and remembers who they are', async () => {
    const { agent, state, calls } = setup([
        use('registrar_interesado', { nombre: 'Juan Pérez', email: 'juan@example.com', consentimiento: true, origen: 'sitio', sede_id: 99 }),
        say('Listo, quedaste registrado.'),
    ], { 'POST /interesados': { status: 201, body: { id: 12 } } });
    await agent.handle(state, 'Sí, autorizo. Soy Juan, juan@example.com');
    assert.deepEqual(calls, [['POST', '/interesados', { nombre: 'Juan Pérez', email: 'juan@example.com', consentimiento: true, origen: 'whatsapp' }]]);
    assert.equal(state.interesadoId, 12);
});

test('a trial class is booked only for the registered person of this chat', async () => {
    const early = setup([use('agendar_clase_prueba', { sesion_id: 7, interesado_id: 3 }), say('Primero necesito tus datos.')]);
    await early.agent.handle(early.state, 'Agéndame');
    assert.deepEqual(early.calls, []);
    assert.match(lastToolResult(early.seen).error, /registr/);

    const later = setup([use('agendar_clase_prueba', { sesion_id: 7, interesado_id: 3 }), say('Agendado.')], {
        'POST /interesados/12/clase-prueba': { status: 201, body: { message: 'Clase de prueba agendada.' } },
    });
    later.state.interesadoId = 12;
    assert.match(await later.agent.handle(later.state, 'Agéndame'), /Agendado.$/);
    assert.deepEqual(later.calls, [['POST', '/interesados/12/clase-prueba', { sesion_id: 7 }]]);
});

test('an API refusal or failure reaches the model as an error instead of breaking the chat', async () => {
    const refused = setup([use('registrar_interesado', { nombre: 'J', email: 'x', consentimiento: true }), say('Ese correo no es válido.')], {
        'POST /interesados': { status: 400, body: { error: 'Ingresa un correo válido (email).' } },
    });
    assert.match(await refused.agent.handle(refused.state, 'x'), /Ese correo no es válido.$/);
    assert.match(lastToolResult(refused.seen).error, /correo válido/);
    assert.equal(refused.state.interesadoId, null);

    const down = setup([use('agendar_clase_prueba', { sesion_id: 7 }), say('No pude agendar.')], { 'POST /interesados/12/clase-prueba': new Error('ECONNREFUSED') });
    down.state.interesadoId = 12;
    assert.match(await down.agent.handle(down.state, 'Agéndame'), /No pude agendar\.$/);
    assert.ok(lastToolResult(down.seen).error);

    const unknown = setup([use('borrar_todo'), say('No puedo hacer eso.')]);
    await unknown.agent.handle(unknown.state, 'borra');
    assert.deepEqual(unknown.calls, []);
    assert.ok(lastToolResult(unknown.seen).error);
});

test('when the model fails, loops or says nothing, the person is sent to a human and the history stays clean', async () => {
    for (const script of [[new Error('model down')], Array(10).fill(null).map(() => use('agendar_clase_prueba', { sesion_id: 1 })), [say('  ')]]) {
        const { agent, state } = setup(script);
        assert.equal(await agent.handle(state, 'Hola'), FALLBACK);
        assert.deepEqual(state.history, []);
    }
});

test('the history sent to the model is capped, and tool traffic is not kept between messages', async () => {
    const script = [];
    for (let i = 0; i < 15; i += 1) script.push(use('agendar_clase_prueba', { sesion_id: 1 }), say(`respuesta ${i}`));
    const { agent, state, seen } = setup(script);
    for (let i = 0; i < 15; i += 1) await agent.handle(state, `mensaje ${i}`);
    assert.equal(state.history.length, 20);
    assert.ok(state.history.every((m) => m.role === 'user' || (m.role === 'assistant' && !m.tool_calls)));
    assert.equal(state.history.at(-1).content, 'respuesta 14');
    assert.equal(seen.at(-1)[1].content, 'mensaje 4');
});

test('arguments sent as a JSON string are understood, and each result answers its tool call', async () => {
    const call = { role: 'assistant', content: null, tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'registrar_interesado', arguments: '{"nombre":"Ana","email":"ana@example.com","consentimiento":true}' } }] };
    const { agent, state, calls, seen } = setup([call, say('Listo.')], { 'POST /interesados': { status: 201, body: { id: 5 } } }, 'sitio');
    await agent.handle(state, 'Sí, autorizo');
    assert.deepEqual(calls, [['POST', '/interesados', { nombre: 'Ana', email: 'ana@example.com', consentimiento: true, origen: 'sitio' }]]);
    assert.equal(seen.at(-1).at(-1).tool_call_id, 'call_1');
    assert.match(seen[0][0].content, /chat de la página web/);

    const broken = setup([{ role: 'assistant', tool_calls: [{ id: 'c', function: { name: 'registrar_interesado', arguments: '{not json' } }] }, say('¿Me repites tus datos?')]);
    await broken.agent.handle(broken.state, 'x');
    assert.deepEqual(broken.calls, []);
});

test('an unknown channel is refused when the assistant is built', () => {
    assert.throws(() => createAgent({ chat: async () => say('x'), api: async () => ({}), canal: 'telegram' }), /canal/);
});

function chatsWith(agent, options = {}) {
    const saved = [];
    const api = async (method, path, body) => {
        saved.push([method, path, body]);
        return options.saveFails ? { status: 500, body: {} } : { status: 201, body: {} };
    };
    return { chats: createChats({ agent, api, canal: 'sitio', ...options }), saved };
}

test('each chat keeps its own conversation, and nothing is stored before the person is registered', async () => {
    const agent = { handle: async (state, text) => { state.history.push(text); return `eco ${text} (${state.history.length})`; } };
    const { chats, saved } = chatsWith(agent);
    assert.equal(await chats.reply('a', 'hola'), 'eco hola (1)');
    assert.equal(await chats.reply('b', 'hola'), 'eco hola (1)');
    assert.equal(await chats.reply('a', 'otra'), 'eco otra (2)');
    assert.deepEqual(saved, []);
});

test('once the person is registered the whole conversation is stored, in batches of 20, and only once', async () => {
    let registerAt = 12;
    const agent = { handle: async (state, text) => { registerAt -= 1; if (registerAt === 0) state.interesadoId = 7; return `r:${text}`; } };
    const { chats, saved } = chatsWith(agent);
    for (let i = 1; i <= 12; i += 1) await chats.reply('a', `m${i}`);
    assert.deepEqual(saved.map(([, path, body]) => [path, body.canal, body.chat_id, body.interesado_id, body.mensajes.length]), [
        ['/conversaciones', 'sitio', 'a', 7, 20],
        ['/conversaciones', 'sitio', 'a', 7, 4],
    ]);
    assert.deepEqual(saved[0][2].mensajes.slice(0, 2), [{ rol: 'persona', texto: 'm1' }, { rol: 'asistente', texto: 'r:m1' }]);
    await chats.reply('a', 'm13');
    assert.deepEqual(saved[2][2].mensajes, [{ rol: 'persona', texto: 'm13' }, { rol: 'asistente', texto: 'r:m13' }]);
});

test('a failed save does not lose the answer, and the messages are sent again next time', async () => {
    const agent = { handle: async (state, text) => { state.interesadoId = 7; return `r:${text}`; } };
    const failing = chatsWith(agent, { saveFails: true });
    assert.equal(await failing.chats.reply('a', 'm1'), 'r:m1');
    assert.equal(await failing.chats.reply('a', 'm2'), 'r:m2');
    assert.equal(failing.saved.at(-1)[2].mensajes.length, 4);
});

test('messages of one chat are answered in order even when they arrive together, and a failure does not block the chat', async () => {
    const order = [];
    const agent = {
        handle: async (state, text) => {
            if (text === 'rompe') throw new Error('boom');
            await new Promise((resolve) => setTimeout(resolve, text === 'lento' ? 30 : 0));
            order.push(text);
            return text;
        },
    };
    const { chats } = chatsWith(agent);
    const results = await Promise.allSettled([chats.reply('a', 'lento'), chats.reply('a', 'rompe'), chats.reply('a', 'rápido')]);
    assert.deepEqual(order, ['lento', 'rápido']);
    assert.deepEqual(results.map((r) => r.status), ['fulfilled', 'rejected', 'fulfilled']);
});

test('a long message is cut, idle chats expire and the oldest is dropped when the limit is reached', async () => {
    let clock = 0;
    const agent = { handle: async (state, text) => String(text.length) };
    const { chats } = chatsWith(agent, { maxChats: 2, ttlMs: 1000, now: () => clock });
    assert.equal(await chats.reply('a', 'x'.repeat(5000)), '2000');
    await chats.reply('b', 'hola');
    await chats.reply('a', 'hola'); // a is now the latest
    await chats.reply('c', 'hola'); // b was idle the longest
    assert.deepEqual(['a', 'b', 'c'].map((id) => chats.has(id)), [true, false, true]);
    clock = 5000;
    await chats.reply('d', 'hola');
    assert.deepEqual(['a', 'c', 'd'].map((id) => chats.has(id)), [false, false, true]);
    assert.equal(chats.size(), 1);
});

test('the model client speaks the OpenAI chat format and fails loudly on an error status', async () => {
    const requests = [];
    const fetchImpl = async (url, options) => {
        requests.push({ url, headers: options.headers, body: JSON.parse(options.body) });
        return { ok: true, status: 200, json: async () => ({ choices: [{ message: { role: 'assistant', content: 'Hola' } }] }) };
    };
    const chat = createModelClient({ url: 'http://model.test/v1/', model: 'm1', key: 'secret', reasoning: 'none', fetchImpl });
    assert.deepEqual(await chat([{ role: 'user', content: 'Hola' }], [{ type: 'function' }]), { role: 'assistant', content: 'Hola' });
    assert.equal(requests[0].url, 'http://model.test/v1/chat/completions');
    assert.equal(requests[0].headers.Authorization, 'Bearer secret');
    assert.deepEqual(requests[0].body, { model: 'm1', messages: [{ role: 'user', content: 'Hola' }], tools: [{ type: 'function' }], reasoning_effort: 'none' });

    const plain = createModelClient({ url: 'http://model.test/v1', model: 'm1', fetchImpl });
    await plain([], []);
    assert.equal(requests[1].headers.Authorization, undefined);
    assert.equal('reasoning_effort' in requests[1].body, false);

    const down = createModelClient({ url: 'http://model.test/v1', model: 'm1', fetchImpl: async () => ({ ok: false, status: 429 }) });
    await assert.rejects(down([], []), /429/);
});
