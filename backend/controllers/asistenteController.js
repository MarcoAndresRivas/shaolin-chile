// Fase 2, T8: what the virtual assistant needs beyond the interesados
// endpoints it shares with the site and with administration.

const { todayInChile } = require('../src/dates');

const CANALES = ['sitio', 'instagram'];
const ROLES = ['persona', 'asistente'];

const bad = (res, message) => res.status(400).json({ error: message });
const serverError = (label, error, res) => {
    console.error(label, error);
    res.status(500).json({ error: 'Error del servidor.' });
};

// Only what the assistant may tell a visitor: no instructor, seats or reasons.
exports.getSesiones = async (req, res) => {
    try {
        const [rows] = await req.db.execute(
            `SELECT se.id, se.fecha, c.hora_inicio, c.hora_fin, s.ciudad AS sede, d.nombre AS disciplina
             FROM sesiones se
             JOIN clases c ON c.id = se.clase_id
             JOIN sedes s ON s.id = c.sede_id
             JOIN disciplinas d ON d.id = c.disciplina_id
             WHERE se.fecha >= ? AND se.estado = 'programada'
             ORDER BY se.fecha, c.hora_inicio, se.id
             LIMIT 100`,
            [todayInChile()],
        );
        res.json(rows);
    } catch (error) {
        serverError('Error fetching sesiones for the assistant:', error, res);
    }
};

exports.saveConversacion = async (req, res) => {
    const { canal, chat_id: chatId, interesado_id: interesadoId = null, mensajes } = req.body ?? {};

    if (!CANALES.includes(canal)) return bad(res, `El canal no es válido (canal). Opciones: ${CANALES.join(', ')}.`);
    if (typeof chatId !== 'string' || !chatId.trim() || chatId.length > 100) return bad(res, 'chat_id debe tener entre 1 y 100 caracteres.');
    if (interesadoId !== null && !Number.isInteger(interesadoId)) return bad(res, 'interesado_id debe ser un número entero.');
    if (!Array.isArray(mensajes) || mensajes.length < 1 || mensajes.length > 50) return bad(res, 'mensajes debe traer entre 1 y 50 mensajes.');

    const rows = [];
    for (const mensaje of mensajes) {
        const texto = typeof mensaje?.texto === 'string' ? mensaje.texto.trim() : '';
        if (!ROLES.includes(mensaje?.rol)) return bad(res, `El rol de cada mensaje no es válido (rol). Opciones: ${ROLES.join(', ')}.`);
        if (!texto || texto.length > 4000) return bad(res, 'Cada mensaje debe tener entre 1 y 4000 caracteres (texto).');
        rows.push([canal, chatId, interesadoId, mensaje.rol, texto]);
    }

    try {
        if (interesadoId !== null) {
            const [people] = await req.db.execute('SELECT id FROM interesados WHERE id = ?', [interesadoId]);
            if (!people.length) return bad(res, 'interesado_id no existe.');
            // What was said before the person gave their name belongs to them too.
            await req.db.execute(
                'UPDATE conversaciones_asistente SET interesado_id = ? WHERE canal = ? AND chat_id = ? AND interesado_id IS NULL',
                [interesadoId, canal, chatId],
            );
        }
        // One statement, so a conversation is never stored in part.
        await req.db.execute(
            `INSERT INTO conversaciones_asistente (canal, chat_id, interesado_id, rol, texto) VALUES ${rows.map(() => '(?, ?, ?, ?, ?)').join(', ')}`,
            rows.flat(),
        );
        res.status(201).json({ message: 'Conversación guardada.' });
    } catch (error) {
        serverError('Error saving conversacion:', error, res);
    }
};
