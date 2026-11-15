import test from 'node:test';
import assert from 'node:assert/strict';
import { createAgent, FALLBACK } from '../agent.js';

const say = (content) => ({ role: 'assistant', content });
const use = (name, args = {}) => ({ role: 'assistant', content: '', tool_calls: [{ function: { name, arguments: args } }] });

// A model that answers with a fixed script, and an API that records its calls.
function setup(script, responses = {}) {
    const calls = [];
    const seen = [];
    const agent = createAgent({
        chat: async (messages) => {
            seen.push(structuredClone(messages));
            const next = script.shift();
            if (next instanceof Error) throw next;
            return next;
        },
        api: async (method, path, body) => {
            calls.push([method, path, body]);
            const response = responses[`${method} ${path}`];
            if (response instanceof Error) throw response;
            return response ?? { status: 200, body: {} };
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

test('the model reads the upcoming classes through the API before answering', async () => {
    const sesiones = [{ id: 7, fecha: '2026-12-05', hora_inicio: '10:00', hora_fin: '12:00', sede: 'Santiago', disciplina: 'Sanda' }];
    const { agent, state, calls, seen } = setup([use('ver_clases'), say('Hay Sanda el 5 de diciembre.')], {
        'GET /sesiones': { status: 200, body: sesiones },
    });
    assert.match(await agent.handle(state, '¿Qué clases hay?'), /Hay Sanda el 5 de diciembre.$/);
    assert.deepEqual(calls, [['GET', '/sesiones', undefined]]);
    assert.deepEqual(lastToolResult(seen), [{ ...sesiones[0], dia: 'sábado' }]);
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

    const odd = setup([use('ver_clases'), say('No pude consultar las clases.')], { 'GET /sesiones': { status: 503, body: { error: 'off' } } });
    await odd.agent.handle(odd.state, 'clases?');
    assert.ok(lastToolResult(odd.seen).error);

    const down = setup([use('ver_clases'), say('No pude consultar las clases.')], { 'GET /sesiones': new Error('ECONNREFUSED') });
    assert.match(await down.agent.handle(down.state, 'clases?'), /No pude consultar las clases.$/);
    assert.ok(lastToolResult(down.seen).error);

    const unknown = setup([use('borrar_todo'), say('No puedo hacer eso.')]);
    await unknown.agent.handle(unknown.state, 'borra');
    assert.deepEqual(unknown.calls, []);
    assert.ok(lastToolResult(unknown.seen).error);
});

test('when the model fails, loops or says nothing, the person is sent to a human and the history stays clean', async () => {
    for (const script of [[new Error('model down')], Array(10).fill(null).map(() => use('ver_clases')), [say('  ')]]) {
        const { agent, state } = setup(script);
        assert.equal(await agent.handle(state, 'Hola'), FALLBACK);
        assert.deepEqual(state.history, []);
    }
});

test('the history sent to the model is capped, and tool traffic is not kept between messages', async () => {
    const script = [];
    for (let i = 0; i < 15; i += 1) script.push(use('ver_clases'), say(`respuesta ${i}`));
    const { agent, state, seen } = setup(script);
    for (let i = 0; i < 15; i += 1) await agent.handle(state, `mensaje ${i}`);
    assert.equal(state.history.length, 20);
    assert.ok(state.history.every((m) => m.role === 'user' || (m.role === 'assistant' && !m.tool_calls)));
    assert.equal(state.history.at(-1).content, 'respuesta 14');
    assert.equal(seen.at(-1)[1].content, 'mensaje 4');
});
