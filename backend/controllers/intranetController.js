const bcrypt = require('bcrypt');

// ---- ADMINISTRADOR: Gestión de Usuarios ----
exports.getUsuarios = async (req, res) => {
    try {
        const query = `
            SELECT u.id, u.nombre, u.email, u.fecha_creacion, r.nombre as rol
            FROM usuarios u
            JOIN roles r ON u.rol_id = r.id
        `;
        const [rows] = await req.db.execute(query);
        res.json(rows);
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

    try {
        const salt = 10;
        const hash = await bcrypt.hash(password, salt);

        const query = 'INSERT INTO usuarios (nombre, email, password_hash, rol_id) VALUES (?, ?, ?, ?)';
        const [result] = await req.db.execute(query, [nombre, email, hash, rol_id]);

        res.status(201).json({ message: 'Usuario creado exitosamente', id: result.insertId });
    } catch (error) {
        console.error('Error creating user:', error);
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ error: 'El email ya está registrado.' });
        }
        res.status(500).json({ error: 'Error del servidor.' });
    }
};

// ---- HORARIOS ----
exports.getHorarios = async (req, res) => {
    try {
        const query = `
            SELECT h.*, u.nombre as profesor 
            FROM horarios h
            LEFT JOIN usuarios u ON h.creador_id = u.id
            ORDER BY FIELD(dia_semana, 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'), hora_inicio
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
        await req.db.execute('DELETE FROM horarios WHERE id = ?', [id]);
        res.json({ message: 'Horario eliminado con éxito.' });
    } catch (error) {
        res.status(500).json({ error: 'Error al eliminar el horario.' });
    }
};

// ---- ALUMNOS: Reservas ----
exports.bookHorario = async (req, res) => {
    // Un alumno agenda una clase (su id viene del token, rol 5)
    if (req.user.rol_id !== 5) {
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
