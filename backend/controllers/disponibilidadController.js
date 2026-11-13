// Fase 2, T3: weekly availability of instructors.
// An instructor manages their own; administration can read everyone's and edit
// on behalf of one instructor.

const { hasAnyRole, ADMIN_ROLES } = require('../middleware/authMiddleware');

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

const bad = (res, message) => res.status(400).json({ error: message });
const serverError = (label, error, res) => {
    console.error(label, error);
    res.status(500).json({ error: 'Error del servidor.' });
};

const SELECT = `
    SELECT d.id, d.instructor_id, u.nombre AS instructor, d.dia_semana, d.hora_inicio, d.hora_fin
    FROM disponibilidad_instructor d
    JOIN usuarios u ON u.id = d.instructor_id
`;
const ORDER = 'ORDER BY d.instructor_id, d.dia_semana, d.hora_inicio';

// Returns an error message, or null when the list is valid.
function validateBloques(bloques) {
    if (!Array.isArray(bloques)) return 'bloques debe ser una lista.';
    for (const b of bloques) {
        if (!Number.isInteger(b?.dia_semana) || b.dia_semana < 1 || b.dia_semana > 7) return 'dia_semana debe ser de 1 (lunes) a 7 (domingo).';
        if (!TIME.test(b.hora_inicio ?? '')) return 'hora_inicio debe tener el formato HH:MM.';
        if (!TIME.test(b.hora_fin ?? '')) return 'hora_fin debe tener el formato HH:MM.';
        if (b.hora_fin <= b.hora_inicio) return 'hora_fin debe ser posterior a hora_inicio.';
    }
    const sorted = [...bloques].sort((a, b) => a.dia_semana - b.dia_semana || a.hora_inicio.localeCompare(b.hora_inicio));
    for (let i = 1; i < sorted.length; i += 1) {
        const prev = sorted[i - 1];
        const current = sorted[i];
        if (prev.dia_semana === current.dia_semana && current.hora_inicio < prev.hora_fin) {
            return 'Los bloques de un mismo día se superponen.';
        }
    }
    return null;
}

exports.getDisponibilidad = async (req, res) => {
    const admin = hasAnyRole(req.user, ADMIN_ROLES);
    const instructor = hasAnyRole(req.user, ['Instructor']);
    if (!admin && !instructor) return res.status(403).json({ error: 'Solo instructores y administración ven la disponibilidad.' });

    try {
        const requested = req.query.instructor_id;
        let rows;
        if (admin && requested) {
            [rows] = await req.db.execute(`${SELECT} WHERE d.instructor_id = ? ${ORDER}`, [requested]);
        } else if (instructor) {
            [rows] = await req.db.execute(`${SELECT} WHERE d.instructor_id = ? ${ORDER}`, [req.user.id]);
        } else {
            [rows] = await req.db.execute(`${SELECT} ${ORDER}`);
        }
        res.json(rows);
    } catch (error) {
        serverError('Error fetching disponibilidad:', error, res);
    }
};

exports.saveDisponibilidad = async (req, res) => {
    const admin = hasAnyRole(req.user, ADMIN_ROLES);
    const instructor = hasAnyRole(req.user, ['Instructor']);
    if (!admin && !instructor) return res.status(403).json({ error: 'Solo instructores y administración editan la disponibilidad.' });

    const problem = validateBloques(req.body.bloques);
    if (problem) return bad(res, problem);

    let target;
    if (admin && req.body.instructor_id != null) target = req.body.instructor_id;
    else if (instructor) target = req.user.id;
    else return bad(res, 'Indica de qué instructor es la disponibilidad (instructor_id).');

    let connection;
    try {
        const [users] = await req.db.execute('SELECT id FROM usuarios WHERE id = ?', [target]);
        if (!users.length) return res.status(404).json({ error: 'Instructor no encontrado.' });

        // The whole week is replaced together, or not at all.
        connection = await req.db.getConnection();
        await connection.beginTransaction();
        await connection.execute('DELETE FROM disponibilidad_instructor WHERE instructor_id = ?', [target]);
        for (const b of req.body.bloques) {
            await connection.execute(
                'INSERT INTO disponibilidad_instructor (instructor_id, dia_semana, hora_inicio, hora_fin) VALUES (?, ?, ?, ?)',
                [target, b.dia_semana, b.hora_inicio, b.hora_fin],
            );
        }
        await connection.commit();
        res.json({ message: 'Disponibilidad guardada.', guardados: req.body.bloques.length });
    } catch (error) {
        if (connection) await connection.rollback().catch(() => {});
        serverError('Error saving disponibilidad:', error, res);
    } finally {
        if (connection) connection.release();
    }
};
