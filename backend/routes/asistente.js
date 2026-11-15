const crypto = require('node:crypto');
const express = require('express');
const interesadosController = require('../controllers/interesadosController');
const asistenteController = require('../controllers/asistenteController');

const router = express.Router();

const digest = (value) => crypto.createHash('sha256').update(String(value)).digest();

// The virtual assistant (n8n) is not a person with a login: it sends the
// shared key from ASISTENTE_API_KEY. Without that variable these routes are off.
router.use((req, res, next) => {
    const expected = req.app.locals.config.asistenteApiKey;
    if (!expected) return res.status(503).json({ error: 'El asistente virtual no está configurado.' });
    // Hashing first gives timingSafeEqual two buffers of the same length.
    if (!crypto.timingSafeEqual(digest(req.headers['x-asistente-key'] ?? ''), digest(expected))) {
        return res.status(401).json({ error: 'Clave del asistente inválida.' });
    }
    req.user = { id: null }; // the notes the assistant leaves belong to no usuario
    next();
});

router.get('/sesiones', asistenteController.getSesiones);
// No per-IP limit here: every person the assistant talks to arrives from the same server.
router.post('/interesados', interesadosController.registrar);
router.post('/interesados/:id/clase-prueba', interesadosController.agendarClasePrueba);
router.post('/conversaciones', asistenteController.saveConversacion);

module.exports = router;
