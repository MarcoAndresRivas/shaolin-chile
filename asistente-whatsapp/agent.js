// The assistant's loop: send the conversation to the model, run the actions it
// asks for against the school's API, and repeat until it answers in text.
//
// chat(messages, tools) -> the model's message ({ content, tool_calls? })
// api(method, path, body) -> { status, body } from /api/asistente

const MAX_STEPS = 5; // model turns per incoming message, so a confused model cannot loop forever
const MAX_HISTORY = 20; // messages remembered per chat

export const FALLBACK = 'En este momento no puedo responderte. Una persona del equipo de Shaolin Chile te va a contestar por este mismo chat.';

const INTRO = 'Soy el asistente virtual de Shaolin Chile.';
const WEEKDAY = new Intl.DateTimeFormat('es-CL', { weekday: 'long', timeZone: 'UTC' });

const SYSTEM = `Eres el asistente virtual de Shaolin Chile, una escuela de kung fu. Atiendes por WhatsApp a personas interesadas en la escuela.

Reglas:
- En tu primer mensaje preséntate como asistente virtual.
- Responde en español, breve y con respeto. Escribe texto simple, sin Markdown ni asteriscos.
- Cuando necesites datos, usa la herramienta en ese mismo momento. Nunca digas que vas a revisar algo sin haberlo revisado.
- Al mencionar una clase, usa el día, la fecha y el horario tal como los entrega ver_clases.
- Lo único que sabes de la escuela son las clases que entrega la herramienta ver_clases. No inventes precios, horarios, direcciones ni ningún otro dato: si no lo tienes, di que una persona del equipo responderá por este mismo chat.
- No entregues consejos médicos ni sobre lesiones.
- Antes de registrar a alguien, pídele su nombre y su correo, y pregúntale si autoriza a Shaolin Chile a guardar esos datos para contactarlo. Usa registrar_interesado solo si responde que sí.
- Para agendar una clase de prueba, primero registra a la persona y después usa agendar_clase_prueba con el id de una clase que entregó ver_clases.
- Si hay un reclamo, o la persona pide hablar con alguien, di que una persona del equipo responderá por este mismo chat.`;

const TOOLS = [
    {
        type: 'function',
        function: {
            name: 'ver_clases',
            description: 'Lista las próximas clases programadas: id, fecha, horario, sede y disciplina.',
            parameters: { type: 'object', properties: {} },
        },
    },
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
                properties: { sesion_id: { type: 'integer', description: 'id de la clase, tomado de ver_clases' } },
                required: ['sesion_id'],
            },
        },
    },
];

export function createAgent({ chat, api, now = () => new Date() }) {
    // Every action the model can take. The person of the chat comes from
    // `state`, never from the model, so it cannot act on someone else.
    const actions = {
        async ver_clases() {
            const { body } = await api('GET', '/sesiones');
            if (!Array.isArray(body)) return { error: 'No se pudieron consultar las clases.' };
            // The weekday comes from here, so the model does not have to work it out.
            return body.slice(0, 30).map((sesion) => ({ ...sesion, dia: WEEKDAY.format(new Date(`${sesion.fecha}T12:00:00Z`)) }));
        },
        async registrar_interesado(args, state) {
            if (args.consentimiento !== true) return { error: 'Falta el consentimiento de la persona para guardar sus datos.' };
            const { status, body } = await api('POST', '/interesados', {
                nombre: args.nombre, email: args.email, consentimiento: true, origen: 'whatsapp',
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

    async function run(name, args, state) {
        if (!Object.hasOwn(actions, name)) return { error: `La herramienta ${name} no existe.` };
        try {
            return await actions[name](args ?? {}, state);
        } catch (error) {
            console.error(`Tool ${name} failed:`, error.message);
            return { error: 'El sistema de la escuela no respondió.' };
        }
    }

    // state: { history: [], interesadoId: null }, one per chat. Returns the text to send.
    async function handle(state, text) {
        const today = new Intl.DateTimeFormat('es-CL', { dateStyle: 'full', timeZone: 'America/Santiago' }).format(now());
        const messages = [{ role: 'system', content: `${SYSTEM}\n\nHoy es ${today}.` }, ...state.history, { role: 'user', content: text }];

        try {
            for (let step = 0; step < MAX_STEPS; step += 1) {
                const message = await chat(messages, TOOLS);
                if (!message.tool_calls?.length) {
                    let reply = (message.content ?? '').trim();
                    if (!reply) break;
                    // Meta requires a bot to say it is one; do not leave that to the model.
                    if (!state.history.length && !/asistente virtual/i.test(reply)) reply = `${INTRO}\n\n${reply}`;
                    // Only what was said is remembered; the tool traffic is not.
                    state.history.push({ role: 'user', content: text }, { role: 'assistant', content: reply });
                    state.history.splice(0, Math.max(0, state.history.length - MAX_HISTORY));
                    return reply;
                }
                messages.push(message);
                for (const call of message.tool_calls) {
                    const result = await run(call.function.name, call.function.arguments, state);
                    messages.push({ role: 'tool', tool_name: call.function.name, content: JSON.stringify(result) });
                }
            }
        } catch (error) {
            console.error('The model failed:', error.message);
        }
        return FALLBACK;
    }

    return { handle };
}
