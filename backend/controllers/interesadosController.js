// Fase 2, T4: people interested in the school.
// Public: the catalog for the form and the form itself. Administration: list,
// follow-up notes, estado changes and trial classes.

const { todayInChile } = require('../src/dates');

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE = /^[+\d][\d\s()-]{5,24}$/;
const PUBLIC_ORIGINS = ['sitio', 'instagram'];
const ESTADOS = ['nuevo', 'contactado', 'clase_prueba', 'inscrito', 'descartado'];
const TRIAL_ESTADOS = ['agendada', 'asistio', 'no_asistio', 'cancelada'];
const OPEN_ESTADOS = ['nuevo', 'contactado', 'clase_prueba'];

const bad = (res, message) => res.status(400).json({ error: message });
const notFound = (res, message) => res.status(404).json({ error: message });
const serverError = (label, error, res) => {
    console.error(label, error);
    res.status(500).json({ error: 'Error del servidor.' });
};

async function exists(db, table, id, onlyActive = false) {
    const [rows] = await db.execute(`SELECT id FROM ${table} WHERE id = ?${onlyActive ? ' AND activa = 1' : ''}`, [id]);
    return rows.length > 0;
}

async function addNote(db, interesadoId, usuarioId, nota) {
    await db.execute('INSERT INTO seguimientos (interesado_id, usuario_id, nota) VALUES (?, ?, ?)', [interesadoId, usuarioId ?? null, nota]);
}

// ---- Public ----
exports.catalogo = async (req, res) => {
    try {
        const [sedes] = await req.db.execute('SELECT id, nombre, ciudad FROM sedes WHERE activa = 1 ORDER BY id');
        const [disciplinas] = await req.db.execute('SELECT id, nombre FROM disciplinas WHERE activa = 1 ORDER BY id');
        res.json({ sedes, disciplinas });
    } catch (error) {
        serverError('Error fetching catalogo:', error, res);
    }
};

exports.registrar = async (req, res) => {
    const body = req.body ?? {};

    // A hidden field that people leave empty and bots fill in.
    if (body.website) return res.status(201).json({ message: 'Solicitud recibida.' });

    const nombre = typeof body.nombre === 'string' ? body.nombre.trim() : '';
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const telefono = typeof body.telefono === 'string' ? body.telefono.trim() : '';
    const mensaje = typeof body.mensaje === 'string' ? body.mensaje.trim() : '';
    const origen = body.origen ?? 'sitio';

    if (body.consentimiento !== true) return bad(res, 'Debes aceptar que guardemos tus datos para contactarte (consentimiento).');
    if (nombre.length < 2 || nombre.length > 100) return bad(res, 'El nombre debe tener entre 2 y 100 caracteres (nombre).');
    if (!EMAIL.test(email) || email.length > 255) return bad(res, 'Ingresa un correo válido (email).');
    if (telefono && !PHONE.test(telefono)) return bad(res, 'Ingresa un teléfono válido (telefono).');
    if (mensaje.length > 1000) return bad(res, 'El mensaje no puede superar los 1000 caracteres (mensaje).');
    if (!PUBLIC_ORIGINS.includes(origen)) return bad(res, `El origen no es válido (origen). Opciones: ${PUBLIC_ORIGINS.join(', ')}.`);

    try {
        if (body.sede_id != null && !(await exists(req.db, 'sedes', body.sede_id, true))) return bad(res, 'sede_id no existe.');
        if (body.disciplina_id != null && !(await exists(req.db, 'disciplinas', body.disciplina_id, true))) return bad(res, 'disciplina_id no existe.');

        // The same person asking again is not a new person: leave a note instead.
        const [open] = await req.db.execute(
            `SELECT id FROM interesados WHERE email = ? AND estado IN (${OPEN_ESTADOS.map(() => '?').join(', ')}) ORDER BY id DESC`,
            [email, ...OPEN_ESTADOS],
        );
        if (open.length) {
            await addNote(req.db, open[0].id, null, `Volvió a solicitar información${mensaje ? `: ${mensaje}` : '.'}`);
            return res.status(200).json({ message: 'Solicitud recibida.', id: open[0].id, repetido: true });
        }

        const [result] = await req.db.execute(
            `INSERT INTO interesados (nombre, email, telefono, sede_id, disciplina_id, mensaje, origen, consentimiento, consentimiento_fecha)
             VALUES (?, ?, ?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP)`,
            [nombre, email, telefono || null, body.sede_id ?? null, body.disciplina_id ?? null, mensaje || null, origen],
        );
        res.status(201).json({ message: 'Solicitud recibida.', id: result.insertId });
    } catch (error) {
        serverError('Error registering interesado:', error, res);
    }
};

// ---- Administration ----
const LIST = `
    SELECT i.id, i.nombre, i.email, i.telefono, i.sede_id, s.ciudad AS sede, i.disciplina_id, d.nombre AS disciplina,
           i.mensaje, i.origen, i.estado, i.consentimiento, i.fecha_creacion
    FROM interesados i
    LEFT JOIN sedes s ON s.id = i.sede_id
    LEFT JOIN disciplinas d ON d.id = i.disciplina_id
`;
const asLead = (row) => ({ ...row, consentimiento: Boolean(row.consentimiento) });

exports.getInteresados = async (req, res) => {
    const { estado } = req.query;
    if (estado && !ESTADOS.includes(estado)) return bad(res, `estado no es válido. Opciones: ${ESTADOS.join(', ')}.`);
    try {
        const [rows] = estado
            ? await req.db.execute(`${LIST} WHERE i.estado = ? ORDER BY i.fecha_creacion DESC, i.id DESC`, [estado])
            : await req.db.execute(`${LIST} ORDER BY i.fecha_creacion DESC, i.id DESC`);
        res.json(rows.map(asLead));
    } catch (error) {
        serverError('Error fetching interesados:', error, res);
    }
};

exports.getInteresado = async (req, res) => {
    try {
        const [rows] = await req.db.execute(`${LIST} WHERE i.id = ?`, [req.params.id]);
        if (!rows.length) return notFound(res, 'Interesado no encontrado.');
        const [seguimientos] = await req.db.execute(
            `SELECT s.id, s.nota, s.fecha, u.nombre AS usuario FROM seguimientos s
             LEFT JOIN usuarios u ON u.id = s.usuario_id WHERE s.interesado_id = ? ORDER BY s.id`,
            [req.params.id],
        );
        const [clasesPrueba] = await req.db.execute(
            `SELECT c.id, c.sesion_id, c.estado, se.fecha FROM clases_prueba c
             LEFT JOIN sesiones se ON se.id = c.sesion_id WHERE c.interesado_id = ? ORDER BY c.id`,
            [req.params.id],
        );
        res.json({ ...asLead(rows[0]), seguimientos, clases_prueba: clasesPrueba });
    } catch (error) {
        serverError('Error fetching interesado:', error, res);
    }
};

exports.updateEstado = async (req, res) => {
    const { estado } = req.body;
    if (!ESTADOS.includes(estado)) return bad(res, `estado no es válido. Opciones: ${ESTADOS.join(', ')}.`);
    try {
        const [rows] = await req.db.execute('SELECT estado FROM interesados WHERE id = ?', [req.params.id]);
        if (!rows.length) return notFound(res, 'Interesado no encontrado.');
        await req.db.execute('UPDATE interesados SET estado = ? WHERE id = ?', [estado, req.params.id]);
        await addNote(req.db, req.params.id, req.user.id, `Estado: ${rows[0].estado} → ${estado}.`);
        res.json({ message: 'Estado actualizado.' });
    } catch (error) {
        serverError('Error updating estado:', error, res);
    }
};

exports.addSeguimiento = async (req, res) => {
    const nota = typeof req.body.nota === 'string' ? req.body.nota.trim() : '';
    if (!nota || nota.length > 1000) return bad(res, 'La nota debe tener entre 1 y 1000 caracteres (nota).');
    try {
        if (!(await exists(req.db, 'interesados', req.params.id))) return notFound(res, 'Interesado no encontrado.');
        await addNote(req.db, req.params.id, req.user.id, nota);
        res.status(201).json({ message: 'Nota agregada.' });
    } catch (error) {
        serverError('Error adding seguimiento:', error, res);
    }
};

exports.agendarClasePrueba = async (req, res) => {
    const { sesion_id } = req.body;
    try {
        const [people] = await req.db.execute('SELECT id, estado FROM interesados WHERE id = ?', [req.params.id]);
        if (!people.length) return notFound(res, 'Interesado no encontrado.');
        if (!Number.isInteger(sesion_id)) return bad(res, 'Indica la sesión de la clase de prueba (sesion_id).');

        const [sesiones] = await req.db.execute('SELECT id, fecha, estado FROM sesiones WHERE id = ?', [sesion_id]);
        if (!sesiones.length) return notFound(res, 'Sesión no encontrada.');
        if (sesiones[0].estado === 'cancelada') return bad(res, 'La sesión está cancelada.');
        if (sesiones[0].fecha < todayInChile()) return bad(res, 'No se puede agendar una sesión pasada.');

        await req.db.execute('INSERT INTO clases_prueba (interesado_id, sesion_id) VALUES (?, ?)', [people[0].id, sesion_id]);
        if (['nuevo', 'contactado'].includes(people[0].estado)) {
            await req.db.execute("UPDATE interesados SET estado = 'clase_prueba' WHERE id = ?", [people[0].id]);
        }
        await addNote(req.db, people[0].id, req.user.id, `Clase de prueba agendada para el ${sesiones[0].fecha}.`);
        res.status(201).json({ message: 'Clase de prueba agendada.' });
    } catch (error) {
        serverError('Error scheduling clase de prueba:', error, res);
    }
};

const TRIAL_NOTES = {
    asistio: 'Asistió a la clase de prueba',
    no_asistio: 'No asistió a la clase de prueba',
    cancelada: 'Se canceló la clase de prueba',
    agendada: 'Se volvió a agendar la clase de prueba',
};

exports.updateClasePrueba = async (req, res) => {
    const { estado } = req.body;
    if (!TRIAL_ESTADOS.includes(estado)) return bad(res, `estado no es válido. Opciones: ${TRIAL_ESTADOS.join(', ')}.`);
    try {
        const [rows] = await req.db.execute(
            `SELECT c.id, c.interesado_id, se.fecha FROM clases_prueba c LEFT JOIN sesiones se ON se.id = c.sesion_id WHERE c.id = ?`,
            [req.params.id],
        );
        if (!rows.length) return notFound(res, 'Clase de prueba no encontrada.');
        await req.db.execute('UPDATE clases_prueba SET estado = ? WHERE id = ?', [estado, req.params.id]);
        await addNote(req.db, rows[0].interesado_id, req.user.id, `${TRIAL_NOTES[estado]}${rows[0].fecha ? ` del ${rows[0].fecha}` : ''}.`);
        res.json({ message: 'Clase de prueba actualizada.' });
    } catch (error) {
        serverError('Error updating clase de prueba:', error, res);
    }
};
