// The virtual assistant, shared by every channel (the site's chat, the WhatsApp
// test bridge): the loop that talks to the model, the chats it remembers and
// the client for the model.
//
// chat(messages, tools) -> the model's message ({ content, tool_calls? })
// api(method, path, body) -> { status, body } from /api/asistente

const { pesos } = require('./ventas');

const MAX_STEPS = 5; // model turns per incoming message, so a confused model cannot loop forever
const MAX_HISTORY = 20; // messages remembered per chat
const MAX_TEXT = 2000; // characters read from one incoming message

const FALLBACK = 'En este momento no puedo responderte. Una persona del equipo de Shaolin Chile te va a contestar.';
const INTRO = 'Soy el asistente virtual de Shaolin Chile.';
// Emojis with their variation selectors and joiners, and the spaces they leave behind.
const stripEmojis = (text) => text
    .replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}\u{1F3FB}-\u{1F3FF}]/gu, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]+$/gm, '')
    .trim();
const WEEKDAY = new Intl.DateTimeFormat('es-CL', { weekday: 'long', timeZone: 'UTC' });

const CANALES = {
    whatsapp: 'por WhatsApp',
    sitio: 'en el chat de la página web',
    instagram: 'por Instagram',
};

const systemPrompt = (canal) => `Eres el asistente virtual de Shaolin Chile, una escuela de kung fu. Atiendes ${CANALES[canal]} a personas interesadas en la escuela.

Reglas:
- En tu primer mensaje preséntate como asistente virtual.
- Responde en español, breve, cercano y con respeto. Escribe texto simple, sin Markdown ni asteriscos. No uses emojis.
- Lo único que sabes de la escuela son las clases de la lista "Clases programadas" y los seminarios y cursos de la lista "A la venta", que están al final. No existe nada más. No inventes clases, seminarios, cursos, precios, horarios, direcciones ni ningún otro dato: si no lo tienes, di que una persona del equipo responderá.
- Si preguntan por seminarios o cursos, cuenta lo que está en "A la venta": las fechas, el horario, la sede, qué se entrena y los cupos. Luego pregunta: "¿Te gustaría hacer la reserva?".
- No menciones precios ni ofertas a menos que la persona pregunte directamente cuánto cuesta. Si lo pregunta, dale el precio por persona y la oferta si existe, tal como están en "A la venta".
- Para reservar un seminario o comprar un curso, pide el nombre completo y el correo, y pregunta si autoriza a Shaolin Chile a guardar esos datos para gestionar su reserva. Usa reservar solo si responde que sí, con los id de los días o cursos de la lista "A la venta" y la cantidad de personas. No reserves días marcados como cerrados.
- Después de reservar, el sistema envía el monto exacto y cómo pagar. Tú solo confirma en una frase que la reserva quedó creada; no escribas montos ni datos bancarios.
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
            name: 'reservar',
            description: 'Reserva días de un seminario o compra cursos online. Solo después de que la persona autorizó guardar sus datos.',
            parameters: {
                type: 'object',
                properties: {
                    nombre: { type: 'string', description: 'nombre completo' },
                    email: { type: 'string' },
                    consentimiento: { type: 'boolean', description: 'true solo si la persona autorizó guardar sus datos' },
                    seminario_dia_ids: { type: 'array', items: { type: 'integer' }, description: 'id de los días del seminario, de la lista "A la venta"' },
                    cantidad: { type: 'integer', description: 'cuántas personas van a cada día (1 si no lo dijo)' },
                    curso_ids: { type: 'array', items: { type: 'integer' }, description: 'id de los cursos, de la lista "A la venta"' },
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
        async reservar(args, state) {
            if (args.consentimiento !== true) return { error: 'Falta el consentimiento de la persona para guardar sus datos.' };
            const ids = (value) => (Array.isArray(value) ? value.map(Number).filter(Number.isInteger) : []);
            const cantidad = Number.isInteger(Number(args.cantidad)) && Number(args.cantidad) > 0 ? Number(args.cantidad) : 1;
            const items = [
                ...ids(args.seminario_dia_ids).map((id) => ({ seminario_dia_id: id, cantidad })),
                ...ids(args.curso_ids).map((id) => ({ curso_id: id })),
            ];
            if (!items.length) return { error: 'Indica los días del seminario o los cursos que la persona quiere.' };
            const { status, body } = await api('POST', '/compras', {
                nombre: args.nombre, email: args.email, consentimiento: true, origen: canal, items,
            });
            if (status >= 400) return { error: body?.error ?? 'No se pudo reservar.' };
            // The amount and how to pay are sent by the code, word for word, never retyped by the model.
            state.notice = body.mensaje;
            // The person is also followed up as interested, so the team sees the conversation.
            if (!state.interesadoId) {
                const lead = await api('POST', '/interesados', {
                    nombre: args.nombre, email: args.email, consentimiento: true, origen: canal, mensaje: `Reserva ${body.codigo}`,
                }).catch(() => null);
                if (lead && lead.status < 400) state.interesadoId = lead.body.id;
            }
            return { reservado: true, codigo: body.codigo };
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

    // The seminars and courses for sale, read on every message like the classes.
    async function offersText() {
        const unknown = 'No se pudieron consultar. Di que una persona del equipo informará los seminarios y cursos.';
        try {
            const { status, body } = await api('GET', '/ofertas');
            if (status >= 400 || !Array.isArray(body?.seminarios) || !Array.isArray(body?.cursos)) return unknown;
            // Prices go in their own block, apart from the rest, so the model gives them only when asked.
            const lines = [];
            const prices = [];
            for (const s of body.seminarios.slice(0, 10)) {
                const dias = s.dias.slice(0, 10);
                lines.push(`- Seminario "${s.titulo}", sede ${s.sede ?? 'por confirmar'}.`);
                for (const d of dias) {
                    const hours = d.hora_inicio ? `de ${d.hora_inicio}${d.hora_fin ? ` a ${d.hora_fin}` : ''}` : 'horario por confirmar';
                    const seats = d.cerrado ? 'inscripciones cerradas' : `${d.cupo_disponible} cupos disponibles`;
                    lines.push(`  - día id ${d.id}: ${WEEKDAY.format(new Date(`${d.fecha}T12:00:00Z`))} ${d.fecha}, ${hours}, ${seats}`);
                }
                prices.push(`- Seminario "${s.titulo}": ${dias.map((d) => `día id ${d.id}, ${pesos(d.precio)} por persona`).join('; ')}.${s.oferta ? ` ${s.oferta}.` : ''}${s.precio_pack ? ` Precio por persona si va a todos los días: ${pesos(s.precio_pack)}.` : ''}`);
            }
            for (const c of body.cursos.slice(0, 10)) {
                lines.push(`- Curso online id ${c.id}: "${c.titulo}", con acceso a los videos y descarga. Lecciones: ${c.lecciones.map((l) => l.titulo).join('; ') || 'por confirmar'}.`);
                prices.push(`- Curso online id ${c.id}: ${pesos(c.precio)}.`);
            }
            if (!lines.length) return 'No hay seminarios ni cursos a la venta por ahora.';
            return [...lines, '', 'Precios (dalos solo si la persona pregunta cuánto cuesta):', ...prices].join('\n');
        } catch (error) {
            console.error('The assistant could not read the offers:', error.message);
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
        const system = `${systemPrompt(canal)}\n\nHoy es ${today}.\n\nA la venta:\n${await offersText()}\n\nClases programadas:\n${await classesText()}`;
        const messages = [{ role: 'system', content: system }, ...state.history, { role: 'user', content: text }];

        try {
            for (let step = 0; step < MAX_STEPS; step += 1) {
                const message = await chat(messages, TOOLS);
                if (!message?.tool_calls?.length) {
                    // The school's tone is serious: models add emojis even when told not to.
                    let reply = stripEmojis(message?.content ?? '');
                    if (!reply) break;
                    // Meta requires a bot to say it is one; do not leave that to the model.
                    if (!state.history.length && !/asistente virtual/i.test(reply)) reply = `${INTRO}\n\n${reply}`;
                    // After a booking, the exact amount and how to pay, in the school's words.
                    if (state.notice) {
                        reply = `${reply}\n\n${state.notice}`;
                        state.notice = null;
                    }
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
