// Test bridge between WhatsApp and the assistant. It uses Baileys, an
// unofficial WhatsApp Web client: WhatsApp can restrict the number that runs
// it. Link a separate test number, never the school's.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pino from 'pino';
import { makeWASocket, useMultiFileAuthState, DisconnectReason, isJidGroup } from 'baileys';
import { createAgent, createChats, createModelClient } from '../backend/src/asistente.js';

const env = process.env;
const API_URL = (env.ASISTENTE_API_URL || 'http://localhost:3000/api/asistente').replace(/\/+$/, '');
const API_KEY = env.ASISTENTE_API_KEY || '';
// Any provider with the OpenAI chat format; by default, Ollama on this computer.
const MODEL = {
    url: env.ASISTENTE_MODELO_URL || 'http://localhost:11434/v1',
    model: env.ASISTENTE_MODELO || 'qwen3.5:latest',
    key: env.ASISTENTE_MODELO_KEY || '',
    reasoning: env.ASISTENTE_MODELO_RAZONAMIENTO ?? 'none',
    timeoutMs: 180_000, // a local model can take a while on the first message
};
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

const agent = createAgent({ chat: createModelClient(MODEL), api, canal: 'whatsapp' });
const chats = createChats({ agent, api, canal: 'whatsapp' });

async function answer(sock, jid, text) {
    const reply = text ? await chats.reply(jid, text) : 'Por ahora solo puedo leer mensajes de texto.';
    await sock.sendMessage(jid, { text: reply });
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

            answer(sock, jid, text).catch((error) => console.error('No se pudo responder:', error.message));
        }
    });
}

const fatal = (error) => {
    console.error('El puente se detuvo:', error);
    process.exit(1);
};

start().catch(fatal);
