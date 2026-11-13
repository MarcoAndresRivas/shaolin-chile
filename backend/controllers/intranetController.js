const bcrypt = require('bcrypt');
const { hasAnyRole, rolesOf } = require('../middleware/authMiddleware');

// Roles per user from usuario_roles. Before the roles migration runs the table
// does not exist, and each user only has the legacy rol_id.
async function loadRolesByUser(db) {
    let rows;
    try {
        [rows] = await db.execute(
            `SELECT ur.usuario_id, r.nombre FROM usuario_roles ur
             JOIN roles r ON r.id = ur.rol_id
             ORDER BY ur.usuario_id, r.id`
        );
    } catch (error) {
        if (error.code !== 'ER_NO_SUCH_TABLE') throw error;
        rows = [];
    }
    const byUser = new Map();
    for (const row of rows) {
        if (!byUser.has(row.usuario_id)) byUser.set(row.usuario_id, []);
        byUser.get(row.usuario_id).push(row.nombre);
    }
    return (user) => byUser.get(user.id) ?? rolesOf({ rol_id: user.rol_id });
}

// ---- ADMINISTRADOR: Gestión de Usuarios ----
exports.getUsuarios = async (req, res) => {
    try {
        // LEFT JOIN so a user whose legacy rol_id has no role is still listed.
        const [users] = await req.db.execute(`
            SELECT u.id, u.nombre, u.email, u.fecha_creacion, u.rol_id, r.nombre AS rol
            FROM usuarios u
            LEFT JOIN roles r ON u.rol_id = r.id
            ORDER BY u.id
        `);
        const rolesFor = await loadRolesByUser(req.db);
        res.json(users.map(({ rol_id, ...user }) => ({ ...user, roles: rolesFor({ ...user, rol_id }) })));
    } catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).json({ error: 'Error del servidor.' });
    }
};

exports.createUsuario = async (req, res) => {
    const { nombre, email, password, rol_id } = req.body;

    if (!nombre || !email || !password || !rol_id) {
        return res.status(400).json({ error: 'Faltan datos obligatorios.' });
    }

    let connection;
    try {
        const salt = 10;
        const hash = await bcrypt.hash(password, salt);

        // The user and its role are written together, or not at all.
        connection = await req.db.getConnection();
        await connection.beginTransaction();
        const query = 'INSERT INTO usuarios (nombre, email, password_hash, rol_id) VALUES (?, ?, ?, ?)';
        const [result] = await connection.execute(query, [nombre, email, hash, rol_id]);
        await connection.execute('INSERT INTO usuario_roles (usuario_id, rol_id) VALUES (?, ?)', [result.insertId, rol_id]);
        await connection.commit();

        res.status(201).json({ message: 'Usuario creado exitosamente', id: result.insertId });
    } catch (error) {
        if (connection) await connection.rollback().catch(() => {});
        console.error('Error creating user:', error);
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ error: 'El email ya está registrado.' });
        }
        res.status(500).json({ error: 'Error del servidor.' });
    } finally {
        if (connection) connection.release();
    }
};

// ---- HORARIOS ----
exports.getHorarios = async (req, res) => {
    try {
        const query = `
            SELECT h.*, u.nombre as profesor 
            FROM horarios h
            LEFT JOIN usuarios u ON h.creador_id = u.id
            ORDER BY CASE h.dia_semana
                WHEN 'Lunes' THEN 1 WHEN 'Martes' THEN 2 WHEN 'Miércoles' THEN 3 WHEN 'Jueves' THEN 4
                WHEN 'Viernes' THEN 5 WHEN 'Sábado' THEN 6 WHEN 'Domingo' THEN 7 END, h.hora_inicio
        `;
        const [rows] = await req.db.execute(query);
        res.json(rows);
    } catch (error) {
        console.error('Error fetching horarios:', error);
        res.status(500).json({ error: 'Error del servidor.' });
    }
};

exports.createHorario = async (req, res) => {
    const { titulo, descripcion, dia_semana, hora_inicio, hora_fin, cupo_maximo } = req.body;
    // El creador es quien envia la request (req.user dictado por jwt)
    const creador_id = req.user.id;

    try {
        const query = 'INSERT INTO horarios (titulo, descripcion, dia_semana, hora_inicio, hora_fin, creador_id, cupo_maximo) VALUES (?, ?, ?, ?, ?, ?, ?)';
        const [result] = await req.db.execute(query, [titulo, descripcion, dia_semana, hora_inicio, hora_fin, creador_id, cupo_maximo || 20]);
        res.status(201).json({ message: 'Horario creado', id: result.insertId });
    } catch (error) {
        console.error('Error creating horario:', error);
        res.status(500).json({ error: 'Error del servidor.' });
    }
};

exports.updateHorario = async (req, res) => {
    res.status(501).json({ message: 'Update Horario Not Implemented Yet' });
};

exports.deleteHorario = async (req, res) => {
    const { id } = req.params;
    try {
        // Bookings of the class are removed with it (ON DELETE CASCADE).
        const [result] = await req.db.execute('DELETE FROM horarios WHERE id = ?', [id]);
        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Horario no encontrado.' });
        }
        res.json({ message: 'Horario eliminado con éxito.' });
    } catch (error) {
        res.status(500).json({ error: 'Error al eliminar el horario.' });
    }
};

// ---- ALUMNOS: Reservas ----
exports.bookHorario = async (req, res) => {
    // Un alumno agenda una clase (su id viene del token)
    if (!hasAnyRole(req.user, ['Alumno'])) {
        return res.status(403).json({ error: 'Solo los alumnos pueden reservar horarios.' });
    }

    const alumno_id = req.user.id;
    const { horario_id } = req.body;

    try {
        const query = 'INSERT INTO reservas_alumno (alumno_id, horario_id) VALUES (?, ?)';
        await req.db.execute(query, [alumno_id, horario_id]);
        res.status(201).json({ message: 'Reserva confirmada.' });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ error: 'Ya tienes reservado este horario.' });
        }
        console.error('Error booking horario:', error);
        res.status(500).json({ error: 'Error al agendar reserva.' });
    }
};

exports.getMyBookings = async (req, res) => {
    const alumno_id = req.user.id;
    try {
        const query = `
            SELECT h.titulo, h.dia_semana, h.hora_inicio, h.hora_fin, r.estado
            FROM reservas_alumno r
            JOIN horarios h ON r.horario_id = h.id
            WHERE r.alumno_id = ?
        `;
        const [rows] = await req.db.execute(query, [alumno_id]);
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: 'Error del servidor.' });
    }
};
