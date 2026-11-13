// Fase 2, T1: sedes, disciplinas, clases (weekly template) and sesiones.
// Reading is open to any logged-in user; writing is routed behind isAdmin.

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_RANGE_DAYS = 92;
const DAY_MS = 24 * 60 * 60 * 1000;

const bad = (res, message) => res.status(400).json({ error: message });
const notFound = (res, message) => res.status(404).json({ error: message });
const serverError = (label, error, res) => {
    console.error(label, error);
    res.status(500).json({ error: 'Error del servidor.' });
};

// Parses YYYY-MM-DD as a UTC date; null when it is not a real calendar date.
function parseDate(value) {
    if (typeof value !== 'string' || !DATE.test(value)) return null;
    const date = new Date(`${value}T00:00:00Z`);
    return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? null : date;
}

// ISO weekday: 1 = Monday ... 7 = Sunday.
const isoWeekday = (date) => date.getUTCDay() || 7;

const sede = (row) => ({ ...row, activa: Boolean(row.activa) });

// ---- Sedes ----
exports.getSedes = async (req, res) => {
    try {
        const [rows] = await req.db.execute('SELECT id, nombre, ciudad, direccion, activa FROM sedes ORDER BY id');
        res.json(rows.map(sede));
    } catch (error) {
        serverError('Error fetching sedes:', error, res);
    }
};

exports.createSede = async (req, res) => {
    const { nombre, ciudad, direccion } = req.body;
    if (!nombre?.trim() || !ciudad?.trim()) return bad(res, 'Faltan nombre y ciudad.');
    try {
        const [result] = await req.db.execute(
            'INSERT INTO sedes (nombre, ciudad, direccion) VALUES (?, ?, ?)',
            [nombre.trim(), ciudad.trim(), direccion?.trim() || null],
        );
        res.status(201).json({ message: 'Sede creada.', id: result.insertId });
    } catch (error) {
        serverError('Error creating sede:', error, res);
    }
};

exports.updateSede = async (req, res) => {
    const { id } = req.params;
    const { nombre, ciudad, direccion, activa } = req.body;
    const fields = [];
    const values = [];
    if (nombre !== undefined) { fields.push('nombre = ?'); values.push(String(nombre).trim()); }
    if (ciudad !== undefined) { fields.push('ciudad = ?'); values.push(String(ciudad).trim()); }
    if (direccion !== undefined) { fields.push('direccion = ?'); values.push(direccion ? String(direccion).trim() : null); }
    if (activa !== undefined) { fields.push('activa = ?'); values.push(activa ? 1 : 0); }
    if (!fields.length) return bad(res, 'No hay nada que actualizar.');
    if ((nombre !== undefined && !String(nombre).trim()) || (ciudad !== undefined && !String(ciudad).trim())) {
        return bad(res, 'El nombre y la ciudad no pueden quedar vacíos.');
    }
    try {
        const [result] = await req.db.execute(`UPDATE sedes SET ${fields.join(', ')} WHERE id = ?`, [...values, id]);
        if (result.affectedRows === 0) return notFound(res, 'Sede no encontrada.');
        res.json({ message: 'Sede actualizada.' });
    } catch (error) {
        serverError('Error updating sede:', error, res);
    }
};

// ---- Disciplinas ----
exports.getDisciplinas = async (req, res) => {
    try {
        const [rows] = await req.db.execute('SELECT id, nombre, slug, activa FROM disciplinas ORDER BY id');
        res.json(rows.map(sede));
    } catch (error) {
        serverError('Error fetching disciplinas:', error, res);
    }
};

// ---- Clases ----
const CLASE_SELECT = `
    SELECT c.id, c.sede_id, s.ciudad AS sede, c.disciplina_id, d.nombre AS disciplina,
           c.instructor_id, u.nombre AS instructor,
           c.dia_semana, c.hora_inicio, c.hora_fin, c.cupo, c.activa
    FROM clases c
    JOIN sedes s ON s.id = c.sede_id
    JOIN disciplinas d ON d.id = c.disciplina_id
    LEFT JOIN usuarios u ON u.id = c.instructor_id
`;

exports.getClases = async (req, res) => {
    try {
        const sedeId = req.query.sede_id;
        const [rows] = sedeId
            ? await req.db.execute(`${CLASE_SELECT} WHERE c.sede_id = ? ORDER BY c.dia_semana, c.hora_inicio, c.id`, [sedeId])
            : await req.db.execute(`${CLASE_SELECT} ORDER BY c.id`);
        res.json(rows.map(sede));
    } catch (error) {
        serverError('Error fetching clases:', error, res);
    }
};

async function exists(db, table, id) {
    const [rows] = await db.execute(`SELECT id FROM ${table} WHERE id = ?`, [id]);
    return rows.length > 0;
}

exports.createClase = async (req, res) => {
    const { sede_id, disciplina_id, instructor_id, dia_semana, hora_inicio, hora_fin } = req.body;
    const cupo = req.body.cupo ?? 20;

    if (!Number.isInteger(dia_semana) || dia_semana < 1 || dia_semana > 7) return bad(res, 'dia_semana debe ser de 1 (lunes) a 7 (domingo).');
    if (!TIME.test(hora_inicio ?? '')) return bad(res, 'hora_inicio debe tener el formato HH:MM.');
    if (!TIME.test(hora_fin ?? '')) return bad(res, 'hora_fin debe tener el formato HH:MM.');
    if (hora_fin <= hora_inicio) return bad(res, 'hora_fin debe ser posterior a hora_inicio.');
    if (!Number.isInteger(cupo) || cupo < 1) return bad(res, 'cupo debe ser un número entero mayor que 0.');

    try {
        if (!(await exists(req.db, 'sedes', sede_id))) return bad(res, 'sede_id no existe.');
        if (!(await exists(req.db, 'disciplinas', disciplina_id))) return bad(res, 'disciplina_id no existe.');
        if (instructor_id != null && !(await exists(req.db, 'usuarios', instructor_id))) return bad(res, 'instructor_id no existe.');

        const [result] = await req.db.execute(
            `INSERT INTO clases (sede_id, disciplina_id, instructor_id, dia_semana, hora_inicio, hora_fin, cupo)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [sede_id, disciplina_id, instructor_id ?? null, dia_semana, hora_inicio, hora_fin, cupo],
        );
        res.status(201).json({ message: 'Clase creada.', id: result.insertId });
    } catch (error) {
        serverError('Error creating clase:', error, res);
    }
};

exports.deleteClase = async (req, res) => {
    try {
        // Its sesiones are removed with it (ON DELETE CASCADE).
        const [result] = await req.db.execute('DELETE FROM clases WHERE id = ?', [req.params.id]);
        if (result.affectedRows === 0) return notFound(res, 'Clase no encontrada.');
        res.json({ message: 'Clase eliminada.' });
    } catch (error) {
        serverError('Error deleting clase:', error, res);
    }
};

// ---- Sesiones ----
exports.generateSesiones = async (req, res) => {
    const desde = parseDate(req.body.desde);
    const hasta = parseDate(req.body.hasta);
    if (!desde || !hasta) return bad(res, 'desde y hasta deben ser fechas reales con el formato YYYY-MM-DD.');
    if (hasta < desde) return bad(res, 'hasta debe ser igual o posterior a desde.');
    if ((hasta - desde) / DAY_MS > MAX_RANGE_DAYS) return bad(res, `El rango no puede superar ${MAX_RANGE_DAYS} días.`);

    try {
        const [clases] = await req.db.execute('SELECT id, dia_semana FROM clases WHERE id = ?', [req.params.id]);
        if (!clases.length) return notFound(res, 'Clase no encontrada.');
        const { id, dia_semana } = clases[0];

        const [existing] = await req.db.execute(
            'SELECT fecha FROM sesiones WHERE clase_id = ? AND fecha >= ? AND fecha <= ?',
            [id, req.body.desde, req.body.hasta],
        );
        const taken = new Set(existing.map((row) => row.fecha));

        let creadas = 0;
        for (let day = desde; day <= hasta; day = new Date(day.getTime() + DAY_MS)) {
            const fecha = day.toISOString().slice(0, 10);
            if (isoWeekday(day) !== dia_semana || taken.has(fecha)) continue;
            await req.db.execute('INSERT INTO sesiones (clase_id, fecha) VALUES (?, ?)', [id, fecha]);
            creadas += 1;
        }
        res.status(201).json({ creadas });
    } catch (error) {
        serverError('Error generating sesiones:', error, res);
    }
};

exports.getSesiones = async (req, res) => {
    const { desde, hasta, sede_id } = req.query;
    if ((desde && !parseDate(desde)) || (hasta && !parseDate(hasta))) {
        return bad(res, 'desde y hasta deben ser fechas reales con el formato YYYY-MM-DD.');
    }
    try {
        const where = [];
        const values = [];
        if (desde) { where.push('se.fecha >= ?'); values.push(desde); }
        if (hasta) { where.push('se.fecha <= ?'); values.push(hasta); }
        if (sede_id) { where.push('c.sede_id = ?'); values.push(sede_id); }
        const [rows] = await req.db.execute(
            `SELECT se.id, se.clase_id, se.fecha, se.estado, se.motivo,
                    c.hora_inicio, c.hora_fin, c.cupo, s.ciudad AS sede, d.nombre AS disciplina, u.nombre AS instructor
             FROM sesiones se
             JOIN clases c ON c.id = se.clase_id
             JOIN sedes s ON s.id = c.sede_id
             JOIN disciplinas d ON d.id = c.disciplina_id
             LEFT JOIN usuarios u ON u.id = c.instructor_id
             ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
             ORDER BY se.fecha, c.hora_inicio, se.id`,
            values,
        );
        res.json(rows);
    } catch (error) {
        serverError('Error fetching sesiones:', error, res);
    }
};

exports.cancelSesion = async (req, res) => {
    try {
        const [result] = await req.db.execute(
            "UPDATE sesiones SET estado = 'cancelada', motivo = ? WHERE id = ?",
            [req.body.motivo?.trim() || null, req.params.id],
        );
        if (result.affectedRows === 0) return notFound(res, 'Sesión no encontrada.');
        res.json({ message: 'Sesión cancelada.' });
    } catch (error) {
        serverError('Error cancelling sesion:', error, res);
    }
};
