// Fase 2, T5: family accounts and the consents a guardian gives for a student.

const { hasAnyRole, ADMIN_ROLES } = require('../middleware/authMiddleware');
const { isGuardianOf } = require('../src/familia');
const { todayInChile } = require('../src/dates');

const FAMILY_ROLES = ['apoderado', 'alumno'];
const CONSENT_TYPES = ['datos_salud', 'uso_imagen', 'comunicaciones', 'exencion_responsabilidad'];

const bad = (res, message) => res.status(400).json({ error: message });
const notFound = (res, message) => res.status(404).json({ error: message });
const forbidden = (res, message) => res.status(403).json({ error: message });
const serverError = (label, error, res) => {
    console.error(label, error);
    res.status(500).json({ error: 'Error del servidor.' });
};

async function exists(db, table, id) {
    const [rows] = await db.execute(`SELECT id FROM ${table} WHERE id = ?`, [id]);
    return rows.length > 0;
}

const MEMBERS = `
    SELECT m.familia_id, m.usuario_id, u.nombre, u.email, m.rol_en_familia
    FROM familia_miembros m JOIN usuarios u ON u.id = m.usuario_id
`;
const MEMBER_ORDER = "ORDER BY m.familia_id, CASE m.rol_en_familia WHEN 'apoderado' THEN 0 ELSE 1 END, u.nombre";

// ---- Administration ----
exports.getFamilias = async (req, res) => {
    try {
        const [familias] = await req.db.execute('SELECT id, nombre FROM familias ORDER BY id');
        const [members] = await req.db.execute(`${MEMBERS} ${MEMBER_ORDER}`);
        res.json(familias.map((f) => ({ ...f, miembros: members.filter((m) => m.familia_id === f.id) })));
    } catch (error) {
        serverError('Error fetching familias:', error, res);
    }
};

exports.createFamilia = async (req, res) => {
    const nombre = typeof req.body.nombre === 'string' ? req.body.nombre.trim() : '';
    if (!nombre || nombre.length > 255) return bad(res, 'El nombre de la familia es obligatorio (nombre).');
    try {
        const [result] = await req.db.execute('INSERT INTO familias (nombre) VALUES (?)', [nombre]);
        res.status(201).json({ message: 'Familia creada.', id: result.insertId });
    } catch (error) {
        serverError('Error creating familia:', error, res);
    }
};

exports.deleteFamilia = async (req, res) => {
    try {
        // Its memberships are removed with it (ON DELETE CASCADE).
        const [result] = await req.db.execute('DELETE FROM familias WHERE id = ?', [req.params.id]);
        if (result.affectedRows === 0) return notFound(res, 'Familia no encontrada.');
        res.json({ message: 'Familia eliminada.' });
    } catch (error) {
        serverError('Error deleting familia:', error, res);
    }
};

exports.addMiembro = async (req, res) => {
    const { usuario_id, rol_en_familia } = req.body;
    if (!FAMILY_ROLES.includes(rol_en_familia)) return bad(res, `rol_en_familia debe ser uno de: ${FAMILY_ROLES.join(', ')}.`);

    let connection;
    try {
        if (!(await exists(req.db, 'familias', req.params.id))) return notFound(res, 'Familia no encontrada.');
        if (!Number.isInteger(usuario_id) || !(await exists(req.db, 'usuarios', usuario_id))) return notFound(res, 'Usuario no encontrado.');

        connection = await req.db.getConnection();
        await connection.beginTransaction();
        await connection.execute(
            'INSERT INTO familia_miembros (familia_id, usuario_id, rol_en_familia) VALUES (?, ?, ?)',
            [req.params.id, usuario_id, rol_en_familia],
        );
        if (rol_en_familia === 'apoderado') {
            // A guardian needs the Apoderado role for the portal to show their panel.
            await connection.execute(
                `INSERT INTO usuario_roles (usuario_id, rol_id)
                 SELECT ?, r.id FROM roles r
                 WHERE r.nombre = 'Apoderado'
                   AND NOT EXISTS (SELECT 1 FROM usuario_roles ur WHERE ur.usuario_id = ? AND ur.rol_id = r.id)`,
                [usuario_id, usuario_id],
            );
        }
        await connection.commit();
        res.status(201).json({ message: 'Miembro agregado.' });
    } catch (error) {
        if (connection) await connection.rollback().catch(() => {});
        if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'La persona ya es miembro de esta familia.' });
        serverError('Error adding miembro:', error, res);
    } finally {
        if (connection) connection.release();
    }
};

exports.removeMiembro = async (req, res) => {
    try {
        const [result] = await req.db.execute(
            'DELETE FROM familia_miembros WHERE familia_id = ? AND usuario_id = ?',
            [req.params.id, req.params.usuarioId],
        );
        if (result.affectedRows === 0) return notFound(res, 'Esa persona no es miembro de la familia.');
        res.json({ message: 'Miembro quitado.' });
    } catch (error) {
        serverError('Error removing miembro:', error, res);
    }
};

// ---- Guardian ----
// Families where the caller is apoderado, with each student's next bookings and attendance.
exports.miFamilia = async (req, res) => {
    try {
        const [familias] = await req.db.execute(
            `SELECT f.id, f.nombre FROM familias f
             JOIN familia_miembros m ON m.familia_id = f.id
             WHERE m.usuario_id = ? AND m.rol_en_familia = 'apoderado' ORDER BY f.id`,
            [req.user.id],
        );
        const today = todayInChile();
        const result = [];
        for (const familia of familias) {
            const [students] = await req.db.execute(
                `${MEMBERS} WHERE m.familia_id = ? AND m.rol_en_familia = 'alumno' ORDER BY u.nombre`,
                [familia.id],
            );
            const representados = [];
            for (const student of students) {
                const [reservas] = await req.db.execute(
                    `SELECT r.sesion_id, se.fecha, c.hora_inicio, c.hora_fin, s.ciudad AS sede, d.nombre AS disciplina
                     FROM reservas r
                     JOIN sesiones se ON se.id = r.sesion_id
                     JOIN clases c ON c.id = se.clase_id
                     JOIN sedes s ON s.id = c.sede_id
                     JOIN disciplinas d ON d.id = c.disciplina_id
                     WHERE r.alumno_id = ? AND r.estado = 'activa' AND se.estado = 'programada' AND se.fecha >= ?
                     ORDER BY se.fecha, c.hora_inicio`,
                    [student.usuario_id, today],
                );
                const [[asistencia]] = await req.db.execute(
                    'SELECT COUNT(*) AS clases, COALESCE(SUM(presente), 0) AS asistidas FROM asistencias WHERE alumno_id = ?',
                    [student.usuario_id],
                );
                representados.push({
                    usuario_id: student.usuario_id,
                    nombre: student.nombre,
                    proximas_reservas: reservas,
                    asistencia: { clases: Number(asistencia.clases), asistidas: Number(asistencia.asistidas) },
                });
            }
            result.push({ ...familia, representados });
        }
        res.json(result);
    } catch (error) {
        serverError('Error fetching mi familia:', error, res);
    }
};

// ---- Consents ----
// The person themselves, or their guardian (and administration, to read).
async function mayActFor(req, targetId, { admin = false } = {}) {
    if (targetId === req.user.id) return true;
    if (admin && hasAnyRole(req.user, ADMIN_ROLES)) return true;
    return isGuardianOf(req.db, req.user.id, targetId);
}

exports.createConsentimiento = async (req, res) => {
    const target = req.body.usuario_id ?? req.user.id;
    const { tipo, version_texto, aceptado } = req.body;
    if (!Number.isInteger(target)) return bad(res, 'usuario_id no es válido.');
    if (!CONSENT_TYPES.includes(tipo)) return bad(res, `tipo debe ser uno de: ${CONSENT_TYPES.join(', ')}.`);
    if (typeof version_texto !== 'string' || !version_texto.trim() || version_texto.length > 20) return bad(res, 'version_texto es obligatorio (hasta 20 caracteres).');
    if (typeof aceptado !== 'boolean') return bad(res, 'aceptado debe ser verdadero o falso.');
    try {
        if (!(await mayActFor(req, target))) return forbidden(res, 'Solo la persona o su apoderado pueden dar este consentimiento.');
        const [result] = await req.db.execute(
            'INSERT INTO consentimientos (usuario_id, otorgado_por_id, tipo, version_texto, aceptado) VALUES (?, ?, ?, ?, ?)',
            [target, target === req.user.id ? null : req.user.id, tipo, version_texto.trim(), aceptado ? 1 : 0],
        );
        res.status(201).json({ message: 'Consentimiento registrado.', id: result.insertId });
    } catch (error) {
        serverError('Error creating consentimiento:', error, res);
    }
};

exports.getConsentimientos = async (req, res) => {
    const target = req.query.usuario_id ? Number(req.query.usuario_id) : req.user.id;
    if (!Number.isInteger(target)) return bad(res, 'usuario_id no es válido.');
    try {
        if (!(await mayActFor(req, target, { admin: true }))) return forbidden(res, 'No puedes ver los consentimientos de esta persona.');
        const [rows] = await req.db.execute(
            `SELECT c.id, c.tipo, c.version_texto, c.aceptado, c.fecha, c.revocado_en, g.nombre AS otorgado_por
             FROM consentimientos c LEFT JOIN usuarios g ON g.id = c.otorgado_por_id
             WHERE c.usuario_id = ? ORDER BY c.id`,
            [target],
        );
        res.json(rows.map(({ revocado_en, ...c }) => ({ ...c, aceptado: Boolean(c.aceptado), revocado: Boolean(revocado_en) })));
    } catch (error) {
        serverError('Error fetching consentimientos:', error, res);
    }
};

exports.revocarConsentimiento = async (req, res) => {
    try {
        const [rows] = await req.db.execute('SELECT id, usuario_id FROM consentimientos WHERE id = ?', [req.params.id]);
        if (!rows.length) return notFound(res, 'Consentimiento no encontrado.');
        if (!(await mayActFor(req, rows[0].usuario_id))) return forbidden(res, 'Solo la persona o su apoderado pueden revocar este consentimiento.');
        // The record stays: only the revocation date is added.
        await req.db.execute('UPDATE consentimientos SET revocado_en = CURRENT_TIMESTAMP WHERE id = ? AND revocado_en IS NULL', [rows[0].id]);
        res.json({ message: 'Consentimiento revocado.' });
    } catch (error) {
        serverError('Error revoking consentimiento:', error, res);
    }
};
