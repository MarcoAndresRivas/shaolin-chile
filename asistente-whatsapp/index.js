// Test bridge between WhatsApp and the assistant. It uses Baileys, an
// unofficial WhatsApp Web client: WhatsApp can restrict the number that runs
// it. Link a separate test number, never the school's.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pino from 'pino';
import { makeWASocket, useMultiFileAuthState, DisconnectReason, isJidGroup } from 'baileys';
import { createAgent } from './agent.js';

const env = process.env;
const API_URL = (env.ASISTENTE_API_URL || 'http://localhost:3000/api/asistente').replace(/\/+$/, '');
const API_KEY = env.ASISTENTE_API_KEY || '';
const OLLAMA_URL = (env.OLLAMA_URL || 'http://localhost:11434').replace(/\/+$/, '');
const OLLAMA_MODEL = env.OLLAMA_MODEL || 'qwen3.5:latest';
const NUMERO = (env.WHATSAPP_NUMERO || '').replace(/\D/g, '');
const AUTH_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'auth');

if (!API_KEY) {
    console.error('Falta ASISTENTE_API_KEY: la misma clave que usa el backend.');
    process.exit(1);
}

async function api(method, route, body) {
    const res = await fetch(`${API_URL}${route}`, {
        method,
        headers: { 'Content-Type': 'application/json', 'X-Asistente-Key': API_KEY },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(15_000),
    });
    return { status: res.status, body: await res.json().catch(() => ({})) };
}

async function chat(messages, tools) {
    const res = await fetch(`${OLLAMA_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: OLLAMA_MODEL, messages, tools, stream: false, think: false }),
        signal: AbortSignal.timeout(180_000), // a local model can take a while on the first message
    });
    if (!res.ok) throw new Error(`Ollama respondió ${res.status}`);
    return (await res.json()).message;
}

const agent = createAgent({ chat, api });

// shortcut: chats live in memory, so a restart forgets them; store them when this stops being a test.
const chats = new Map(); // jid -> { history, interesadoId, pending, queue }

// The conversation is stored only once the person agreed to be registered.
async function saveConversation(jid, state) {
    if (!state.interesadoId) return;
    while (state.pending.length) {
        const mensajes = state.pending.slice(0, 20);
        const { status } = await api('POST', '/conversaciones', { canal: 'whatsapp', chat_id: jid, interesado_id: state.interesadoId, mensajes });
        if (status >= 400) throw new Error(`conversaciones respondió ${status}`);
        state.pending.splice(0, mensajes.length);
    }
}

async function answer(sock, jid, text) {
    const state = chats.get(jid);
    const reply = text
        ? await agent.handle(state, text.slice(0, 2000))
        : 'Por ahora solo puedo leer mensajes de texto.';
    await sock.sendMessage(jid, { text: reply });
    if (text) state.pending.push({ rol: 'persona', texto: text.slice(0, 2000) }, { rol: 'asistente', texto: reply });
    state.pending.splice(0, Math.max(0, state.pending.length - 200));
    await saveConversation(jid, state).catch((error) => console.error('No se pudo guardar la conversación:', error.message));
}

async function start() {
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
    const sock = makeWASocket({ auth: state, logger: pino({ level: 'warn' }) });
    sock.ev.on('creds.update', saveCreds);

    let asked = false;
    sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
        if (qr && !state.creds.registered && !asked) {
            asked = true;
            if (!NUMERO) {
                console.error('Falta WHATSAPP_NUMERO: el número de prueba, con código de país y sin "+" (por ejemplo 56912345678).');
                process.exit(1);
            }
            const code = await sock.requestPairingCode(NUMERO);
            console.log(`\nCódigo de vinculación: ${code}\nEn el teléfono de prueba: WhatsApp > Dispositivos vinculados > Vincular un dispositivo > Vincular con el número de teléfono.\n`);
        }
        if (connection === 'open') console.log('Conectado a WhatsApp. Escribe al número de prueba desde otro teléfono.');
        if (connection === 'close') {
            const code = lastDisconnect?.error?.output?.statusCode;
            if (code === DisconnectReason.loggedOut) {
                console.error('La sesión se cerró desde el teléfono. Borra la carpeta auth/ y vuelve a vincular.');
                process.exit(1);
            }
            console.log(`Conexión cerrada (${code ?? 'sin código'}). Reconectando...`);
            setTimeout(() => start().catch(fatal), 3000);
        }
    });

    sock.ev.on('messages.upsert', ({ messages, type }) => {
        if (type !== 'notify') return; // skip history that syncs after linking
        for (const msg of messages) {
            const jid = msg.key.remoteJid;
            // Only people writing in private: no groups, statuses, broadcasts or our own messages.
            if (!jid || msg.key.fromMe || isJidGroup(jid) || !/@(s\.whatsapp\.net|lid)$/.test(jid) || !msg.message) continue;
            if (msg.message.protocolMessage || msg.message.reactionMessage) continue;
            const text = (msg.message.conversation || msg.message.extendedTextMessage?.text || '').trim();

            if (!chats.has(jid)) chats.set(jid, { history: [], interesadoId: null, pending: [], queue: Promise.resolve() });
            const state = chats.get(jid);
            // One message at a time per chat, so answers keep their order.
            state.queue = state.queue
                .then(() => answer(sock, jid, text))
                .catch((error) => console.error('No se pudo responder:', error.message));
        }
    });
}

const fatal = (error) => {
    console.error('El puente se detuvo:', error);
    process.exit(1);
};

start().catch(fatal);
