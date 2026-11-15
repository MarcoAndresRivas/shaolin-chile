const crypto = require('node:crypto');
const express = require('express');
const { createAgent, createChats, createModelClient, FALLBACK } = require('../src/asistente');

const MAX_MESSAGE = 1000;

// The public chat of the site. It needs the assistant key and a model; without
// either it answers 503 and the site sends the visitor to WhatsApp.
module.exports = function chatRoutes({ config, rateLimit, assistantModel }) {
    const router = express.Router();
    const model = config.asistenteModelo ?? {};
    const chat = assistantModel ?? (model.url && model.model ? createModelClient(model) : null);

    if (!config.asistenteApiKey || !chat) {
        router.post('/chat', (req, res) => res.status(503).json({ error: 'El asistente virtual no está disponible.' }));
        return router;
    }

    // shortcut: the assistant acts through this server's own /api/asistente over HTTP,
    // so every rule there applies unchanged; call the handlers directly if that hop ever costs.
    let port = config.port;
    const api = async (method, path, body) => {
        const res = await fetch(`http://127.0.0.1:${port}/api/asistente${path}`, {
            method,
            headers: { 'Content-Type': 'application/json', 'X-Asistente-Key': config.asistenteApiKey },
            body: body === undefined ? undefined : JSON.stringify(body),
            signal: AbortSignal.timeout(15_000),
        });
        return { status: res.status, body: await res.json().catch(() => ({})) };
    };
    const chats = createChats({ agent: createAgent({ chat, api, canal: 'sitio' }), api, canal: 'sitio' });

    router.post('/chat', rateLimit, async (req, res) => {
        const { chat_id: givenId, mensaje } = req.body ?? {};
        const text = typeof mensaje === 'string' ? mensaje.trim() : '';
        if (!text || text.length > MAX_MESSAGE) {
            return res.status(400).json({ error: `Escribe un mensaje de hasta ${MAX_MESSAGE} caracteres (mensaje).` });
        }

        port = req.socket.localPort;
        // Only ids this server issued continue a chat; anything else starts a new one.
        const chatId = typeof givenId === 'string' && chats.has(givenId) ? givenId : crypto.randomUUID();
        try {
            res.json({ chat_id: chatId, respuesta: await chats.reply(chatId, text) });
        } catch (error) {
            console.error('Chat failed:', error);
            res.json({ chat_id: chatId, respuesta: FALLBACK });
        }
    });

    return router;
};
