// The virtual assistant, shared by every channel (the site's chat, the WhatsApp
// test bridge): the loop that talks to the model, the chats it remembers and
// the client for the model.
//
// chat(messages, tools) -> the model's message ({ content, tool_calls? })
// api(method, path, body) -> { status, body } from /api/asistente

const MAX_STEPS = 5; // model turns per incoming message, so a confused model cannot loop forever
const MAX_HISTORY = 20; // messages remembered per chat
const MAX_TEXT = 2000; // characters read from one incoming message

const FALLBACK = 'En este momento no puedo responderte. Una persona del equipo de Shaolin Chile te va a contestar.';
const INTRO = 'Soy el asistente virtual de Shaolin Chile.';
const WEEKDAY = new Intl.DateTimeFormat('es-CL', { weekday: 'long', timeZone: 'UTC' });

const CANALES = {
    whatsapp: 'por WhatsApp',
    sitio: 'en el chat de la página web',
    instagram: 'por Instagram',
};

const systemPrompt = (canal) => `Eres el asistente virtual de Shaolin Chile, una escuela de kung fu. Atiendes ${CANALES[canal]} a personas interesadas en la escuela.

Reglas:
- En tu primer mensaje preséntate como asistente virtual.
- Responde en español, breve y con respeto. Escribe texto simple, sin Markdown ni asteriscos.
- Lo único que sabes de la escuela son las clases de la lista "Clases programadas" que está al final. No existe ninguna otra clase. No inventes clases, precios, horarios, direcciones ni ningún otro dato: si no lo tienes, di que una persona del equipo responderá.
- Al mencionar una clase, copia el día, la fecha, el horario, la sede y la disciplina tal como están en la lista. Escribe las horas con números (por ejemplo 10:00), nunca con palabras.
- Si preguntan qué clases hay, muestra las de la lista sin pedir antes más datos.
- No entregues consejos médicos ni sobre lesiones.
- Antes de registrar a alguien, pídele su nombre y su correo, y pregúntale si autoriza a Shaolin Chile a guardar esos datos para contactarlo. Usa registrar_interesado solo si responde que sí.
- Para agendar una clase de prueba, primero registra a la persona y después usa agendar_clase_prueba con el id de una clase de la lista.
- Si hay un reclamo, o la persona pide hablar con alguien, di que una persona del equipo responderá.`;

const TOOLS = [
    {
        type: 'function',
        function: {
            name: 'registrar_interesado',
            description: 'Registra a la persona como interesada. Solo después de que autorizó guardar sus datos.',
            parameters: {
                type: 'object',
                properties: {
                    nombre: { type: 'string' },
                    email: { type: 'string' },
                    consentimiento: { type: 'boolean', description: 'true solo si la persona autorizó guardar sus datos' },
                },
                required: ['nombre', 'email', 'consentimiento'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'agendar_clase_prueba',
            description: 'Agenda una clase de prueba para la persona ya registrada en este chat.',
            parameters: {
                type: 'object',
                properties: { sesion_id: { type: 'integer', description: 'id de la clase, tomado de la lista de clases programadas' } },
                required: ['sesion_id'],
            },
        },
    },
];

// Models send the arguments as a JSON string (OpenAI format) or as an object.
function parseArguments(value) {
    if (typeof value !== 'string') return value ?? {};
    try {
        return JSON.parse(value) ?? {};
    } catch {
        return {};
    }
}

function createAgent({ chat, api, canal, now = () => new Date() }) {
    if (!Object.hasOwn(CANALES, canal)) throw new Error(`Unknown canal: ${canal}`);

    // Every action the model can take. The person of the chat comes from
    // `state`, never from the model, so it cannot act on someone else.
    const actions = {
        async registrar_interesado(args, state) {
            if (args.consentimiento !== true) return { error: 'Falta el consentimiento de la persona para guardar sus datos.' };
            const { status, body } = await api('POST', '/interesados', {
                nombre: args.nombre, email: args.email, consentimiento: true, origen: canal,
            });
            if (status >= 400) return { error: body?.error ?? 'No se pudo registrar.' };
            state.interesadoId = body.id;
            return { registrado: true };
        },
        async agendar_clase_prueba(args, state) {
            if (!state.interesadoId) return { error: 'La persona todavía no está registrada. Primero usa registrar_interesado.' };
            const { status, body } = await api('POST', `/interesados/${state.interesadoId}/clase-prueba`, { sesion_id: Number(args.sesion_id) });
            return status >= 400 ? { error: body?.error ?? 'No se pudo agendar.' } : { agendada: true };
        },
    };

    // The classes are read here and handed to the model on every message: a
    // model left to ask for them sometimes answers with classes it made up.
    async function classesText() {
        const unknown = 'No se pudieron consultar. Di que una persona del equipo informará las clases.';
        try {
            const { body } = await api('GET', '/sesiones');
            if (!Array.isArray(body)) return unknown;
            if (!body.length) return 'No hay clases programadas por ahora.';
            // The weekday comes from here, so the model does not have to work it out.
            return body.slice(0, 30)
                .map((s) => `- id ${s.id}: ${WEEKDAY.format(new Date(`${s.fecha}T12:00:00Z`))} ${s.fecha}, de ${s.hora_inicio} a ${s.hora_fin}, ${s.disciplina}, sede ${s.sede}`)
                .join('\n');
        } catch (error) {
            console.error('The assistant could not read the classes:', error.message);
            return unknown;
        }
    }

    async function run(name, args, state) {
        if (!Object.hasOwn(actions, name)) return { error: `La herramienta ${name} no existe.` };
        try {
            return await actions[name](args, state);
        } catch (error) {
            console.error(`Assistant tool ${name} failed:`, error.message);
            return { error: 'El sistema de la escuela no respondió.' };
        }
    }

    // state: { history: [], interesadoId: null }, one per chat. Returns the text to send.
    async function handle(state, text) {
        const today = new Intl.DateTimeFormat('es-CL', { dateStyle: 'full', timeZone: 'America/Santiago' }).format(now());
        const system = `${systemPrompt(canal)}\n\nHoy es ${today}.\n\nClases programadas:\n${await classesText()}`;
        const messages = [{ role: 'system', content: system }, ...state.history, { role: 'user', content: text }];

        try {
            for (let step = 0; step < MAX_STEPS; step += 1) {
                const message = await chat(messages, TOOLS);
                if (!message?.tool_calls?.length) {
                    let reply = (message?.content ?? '').trim();
                    if (!reply) break;
                    // Meta requires a bot to say it is one; do not leave that to the model.
                    if (!state.history.length && !/asistente virtual/i.test(reply)) reply = `${INTRO}\n\n${reply}`;
                    // Only what was said is remembered; the tool traffic is not.
                    state.history.push({ role: 'user', content: text }, { role: 'assistant', content: reply });
                    state.history.splice(0, Math.max(0, state.history.length - MAX_HISTORY));
                    return reply;
                }
                messages.push({ role: 'assistant', content: message.content ?? '', tool_calls: message.tool_calls });
                for (const call of message.tool_calls) {
                    const result = await run(call.function?.name, parseArguments(call.function?.arguments), state);
                    messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result) });
                }
            }
        } catch (error) {
            console.error('The assistant model failed:', error.message);
        }
        return FALLBACK;
    }

    return { handle };
}

// The chats of one channel, kept in memory.
// shortcut: a restart forgets the open chats, store them when one process is no longer enough.
function createChats({ agent, api, canal, maxChats = 1000, ttlMs = 2 * 60 * 60 * 1000, now = Date.now }) {
    const chats = new Map(); // chat id -> { history, interesadoId, pending, queue, seen }

    function stateOf(chatId) {
        const current = now();
        if (!chats.has(chatId)) {
            for (const [id, chat] of chats) if (current - chat.seen > ttlMs) chats.delete(id);
            // Still full of live chats: drop the one idle the longest.
            if (chats.size >= maxChats) chats.delete(chats.keys().next().value);
            chats.set(chatId, { history: [], interesadoId: null, pending: [], queue: Promise.resolve(), seen: current });
        }
        const state = chats.get(chatId);
        state.seen = current;
        // Re-insert, so the map stays ordered from the longest idle to the latest.
        chats.delete(chatId);
        chats.set(chatId, state);
        return state;
    }

    // The conversation is stored only once the person agreed to be registered.
    async function save(chatId, state) {
        if (!state.interesadoId) return;
        while (state.pending.length) {
            const mensajes = state.pending.slice(0, 20);
            const { status } = await api('POST', '/conversaciones', { canal, chat_id: chatId, interesado_id: state.interesadoId, mensajes });
            if (status >= 400) throw new Error(`conversaciones answered ${status}`);
            state.pending.splice(0, mensajes.length);
        }
    }

    async function answer(chatId, state, text) {
        const question = text.slice(0, MAX_TEXT);
        const reply = await agent.handle(state, question);
        state.pending.push({ rol: 'persona', texto: question }, { rol: 'asistente', texto: reply });
        state.pending.splice(0, Math.max(0, state.pending.length - 200));
        await save(chatId, state).catch((error) => console.error('Could not store the conversation:', error.message));
        return reply;
    }

    // One message at a time per chat, so answers keep their order.
    function reply(chatId, text) {
        const state = stateOf(chatId);
        const result = state.queue.then(() => answer(chatId, state, text));
        state.queue = result.catch(() => {});
        return result;
    }

    return { reply, has: (chatId) => chats.has(chatId), size: () => chats.size };
}

// Any provider with the OpenAI chat-completions format: Ollama, Gemini,
// OpenRouter, Groq... so changing the model is a configuration change.
function createModelClient({ url, model, key = '', reasoning = '', timeoutMs = 60_000, fetchImpl = globalThis.fetch }) {
    return async function chat(messages, tools) {
        const res = await fetchImpl(`${url.replace(/\/+$/, '')}/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...(key ? { Authorization: `Bearer ${key}` } : {}) },
            body: JSON.stringify({ model, messages, tools, ...(reasoning ? { reasoning_effort: reasoning } : {}) }),
            signal: AbortSignal.timeout(timeoutMs),
        });
        if (!res.ok) throw new Error(`the model answered ${res.status}`);
        return (await res.json()).choices?.[0]?.message;
    };
}

module.exports = { createAgent, createChats, createModelClient, FALLBACK, INTRO };
