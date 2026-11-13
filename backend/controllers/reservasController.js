// Fase 2, T2: bookings of sesiones (students) and attendance (instructors).

const { hasAnyRole, ADMIN_ROLES } = require('../middleware/authMiddleware');
const { todayInChile } = require('../src/dates');
const { isGuardianOf } = require('../src/familia');

const bad = (res, message) => res.status(400).json({ error: message });
const notFound = (res, message) => res.status(404).json({ error: message });
const conflict = (res, message) => res.status(409).json({ error: message });
const forbidden = (res, message) => res.status(403).json({ error: message });
const serverError = (label, error, res) => {
    console.error(label, error);
    res.status(500).json({ error: 'Error del servidor.' });
};

async function findSesion(db, id) {
    const [rows] = await db.execute(
        `SELECT se.id, se.fecha, se.estado, c.instructor_id
         FROM sesiones se JOIN clases c ON c.id = se.clase_id WHERE se.id = ?`,
        [id],
    );
    return rows[0] ?? null;
}

// Who the booking is for: the caller (a student) or, with alumno_id, a student in
// the care of the caller (a guardian). Returns the student id, or null after
// answering 403.
async function bookingTarget(req, res, verb) {
    const requested = req.body?.alumno_id;
    if (requested == null || Number(requested) === req.user.id) {
        if (hasAnyRole(req.user, ['Alumno'])) return req.user.id;
        forbidden(res, `Solo los alumnos pueden ${verb} sus reservas.`);
        return null;
    }
    if (await isGuardianOf(req.db, req.user.id, Number(requested))) return Number(requested);
    forbidden(res, `No puedes ${verb} reservas de este alumno.`);
    return null;
}

// ---- Student (or guardian): book and cancel ----
exports.reservar = async (req, res) => {
    const alumnoId = await bookingTarget(req, res, 'hacer');
    if (alumnoId === null) return;

    let connection;
    try {
        const sesion = await findSesion(req.db, req.params.id);
        if (!sesion) return notFound(res, 'Sesión no encontrada.');
        if (sesion.estado === 'cancelada') return bad(res, 'La sesión está cancelada.');
        if (sesion.fecha < todayInChile()) return bad(res, 'No se puede reservar una sesión pasada.');

        connection = await req.db.getConnection();
        await connection.beginTransaction();

        const [existing] = await connection.execute(
            'SELECT id, estado FROM reservas WHERE sesion_id = ? AND alumno_id = ?',
            [sesion.id, alumnoId],
        );
        if (existing[0]?.estado === 'activa') {
            await connection.rollback();
            return conflict(res, 'Ya tienes reservada esta sesión.');
        }

        // One guarded UPDATE takes the place: it only succeeds while there is room.
        const [taken] = await connection.execute(
            `UPDATE sesiones SET reservas_activas = reservas_activas + 1
             WHERE id = ? AND estado = 'programada'
               AND reservas_activas < (SELECT cupo FROM clases WHERE clases.id = sesiones.clase_id)`,
            [sesion.id],
        );
        if (taken.affectedRows === 0) {
            await connection.rollback();
            return conflict(res, 'La sesión está llena.');
        }

        if (existing[0]) {
            await connection.execute("UPDATE reservas SET estado = 'activa', fecha_reserva = CURRENT_TIMESTAMP WHERE id = ?", [existing[0].id]);
        } else {
            await connection.execute('INSERT INTO reservas (sesion_id, alumno_id) VALUES (?, ?)', [sesion.id, alumnoId]);
        }
        await connection.commit();
        res.status(201).json({ message: 'Reserva confirmada.' });
    } catch (error) {
        if (connection) await connection.rollback().catch(() => {});
        if (error.code === 'ER_DUP_ENTRY') return conflict(res, 'Ya tienes reservada esta sesión.');
        serverError('Error booking sesion:', error, res);
    } finally {
        if (connection) connection.release();
    }
};

exports.cancelarReserva = async (req, res) => {
    const alumnoId = await bookingTarget(req, res, 'cancelar');
    if (alumnoId === null) return;

    let connection;
    try {
        connection = await req.db.getConnection();
        await connection.beginTransaction();
        const [result] = await connection.execute(
            "UPDATE reservas SET estado = 'cancelada' WHERE sesion_id = ? AND alumno_id = ? AND estado = 'activa'",
            [req.params.id, alumnoId],
        );
        if (result.affectedRows === 0) {
            await connection.rollback();
            return notFound(res, 'No tienes una reserva activa en esta sesión.');
        }
        await connection.execute('UPDATE sesiones SET reservas_activas = reservas_activas - 1 WHERE id = ?', [req.params.id]);
        await connection.commit();
        res.json({ message: 'Reserva cancelada.' });
    } catch (error) {
        if (connection) await connection.rollback().catch(() => {});
        serverError('Error cancelling reserva:', error, res);
    } finally {
        if (connection) connection.release();
    }
};

exports.misReservas = async (req, res) => {
    try {
        const [rows] = await req.db.execute(
            `SELECT r.sesion_id, r.estado, se.fecha, se.estado AS estado_sesion, c.hora_inicio, c.hora_fin,
                    s.ciudad AS sede, d.nombre AS disciplina
             FROM reservas r
             JOIN sesiones se ON se.id = r.sesion_id
             JOIN clases c ON c.id = se.clase_id
             JOIN sedes s ON s.id = c.sede_id
             JOIN disciplinas d ON d.id = c.disciplina_id
             WHERE r.alumno_id = ?
             ORDER BY se.fecha, c.hora_inicio`,
            [req.user.id],
        );
        res.json(rows);
    } catch (error) {
        serverError('Error fetching reservas:', error, res);
    }
};

// ---- Instructor / admin: attendance ----
// The instructor of the clase, or an administration role.
const canTakeAttendance = (user, sesion) =>
    hasAnyRole(user, ADMIN_ROLES) || (hasAnyRole(user, ['Instructor']) && sesion.instructor_id === user.id);

exports.getAsistencia = async (req, res) => {
    try {
        const sesion = await findSesion(req.db, req.params.id);
        if (!sesion) return notFound(res, 'Sesión no encontrada.');
        if (!canTakeAttendance(req.user, sesion)) return forbidden(res, 'Solo el instructor de la clase o la administración pueden ver la asistencia.');

        const [rows] = await req.db.execute(
            `SELECT u.id AS alumno_id, u.nombre, a.presente
             FROM reservas r
             JOIN usuarios u ON u.id = r.alumno_id
             LEFT JOIN asistencias a ON a.sesion_id = r.sesion_id AND a.alumno_id = r.alumno_id
             WHERE r.sesion_id = ? AND r.estado = 'activa'
             ORDER BY u.nombre`,
            [sesion.id],
        );
        res.json(rows.map((row) => ({ ...row, presente: row.presente === null ? null : Boolean(row.presente) })));
    } catch (error) {
        serverError('Error fetching asistencia:', error, res);
    }
};

exports.saveAsistencia = async (req, res) => {
    const { asistencias } = req.body;
    if (!Array.isArray(asistencias)) return bad(res, 'asistencias debe ser una lista.');
    for (const item of asistencias) {
        if (!Number.isInteger(item?.alumno_id)) return bad(res, 'Cada asistencia necesita un alumno_id.');
        if (typeof item.presente !== 'boolean') return bad(res, 'presente debe ser verdadero o falso.');
    }

    let connection;
    try {
        const sesion = await findSesion(req.db, req.params.id);
        if (!sesion) return notFound(res, 'Sesión no encontrada.');
        if (!canTakeAttendance(req.user, sesion)) return forbidden(res, 'Solo el instructor de la clase o la administración pueden tomar la asistencia.');

        // Everything is validated before anything is written.
        const [booked] = await req.db.execute("SELECT alumno_id FROM reservas WHERE sesion_id = ? AND estado = 'activa'", [sesion.id]);
        const bookedIds = new Set(booked.map((row) => row.alumno_id));
        const stranger = asistencias.find((item) => !bookedIds.has(item.alumno_id));
        if (stranger) return bad(res, `El alumno ${stranger.alumno_id} no tiene una reserva activa en esta sesión.`);

        connection = await req.db.getConnection();
        await connection.beginTransaction();
        for (const { alumno_id, presente } of asistencias) {
            const [updated] = await connection.execute(
                'UPDATE asistencias SET presente = ?, registrada_por = ?, fecha_registro = CURRENT_TIMESTAMP WHERE sesion_id = ? AND alumno_id = ?',
                [presente ? 1 : 0, req.user.id, sesion.id, alumno_id],
            );
            if (updated.affectedRows === 0) {
                await connection.execute(
                    'INSERT INTO asistencias (sesion_id, alumno_id, presente, registrada_por) VALUES (?, ?, ?, ?)',
                    [sesion.id, alumno_id, presente ? 1 : 0, req.user.id],
                );
            }
        }
        await connection.commit();
        res.json({ message: 'Asistencia guardada.', guardadas: asistencias.length });
    } catch (error) {
        if (connection) await connection.rollback().catch(() => {});
        serverError('Error saving asistencia:', error, res);
    } finally {
        if (connection) connection.release();
    }
};

exports.miAsistencia = async (req, res) => {
    try {
        const [rows] = await req.db.execute(
            `SELECT se.fecha, a.presente, d.nombre AS disciplina, s.ciudad AS sede
             FROM asistencias a
             JOIN sesiones se ON se.id = a.sesion_id
             JOIN clases c ON c.id = se.clase_id
             JOIN sedes s ON s.id = c.sede_id
             JOIN disciplinas d ON d.id = c.disciplina_id
             WHERE a.alumno_id = ?
             ORDER BY se.fecha DESC`,
            [req.user.id],
        );
        const detalle = rows.map((row) => ({ ...row, presente: Boolean(row.presente) }));
        res.json({
            resumen: { clases: detalle.length, asistidas: detalle.filter((d) => d.presente).length },
            detalle,
        });
    } catch (error) {
        serverError('Error fetching mi asistencia:', error, res);
    }
};
