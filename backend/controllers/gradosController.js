// Fase 2, T7: grades, eligibility, exams, nominations and results.
//
// A student is eligible for the next grade when they have attended the classes
// of the discipline that the next grade asks for since they reached their
// current grade, and have been in it for the months it asks for.

const { hasAnyRole, ADMIN_ROLES } = require('../middleware/authMiddleware');
const { isGuardianOf } = require('../src/familia');
const { todayInChile } = require('../src/dates');

const RESULTS = ['aprobado', 'reprobado', 'ausente'];
const EXAM_STATES_SETTABLE = ['programado', 'cancelado'];

const bad = (res, message) => res.status(400).json({ error: message });
const notFound = (res, message) => res.status(404).json({ error: message });
const conflict = (res, message) => res.status(409).json({ error: message });
const forbidden = (res, message) => res.status(403).json({ error: message });
const serverError = (label, error, res) => {
    console.error(label, error);
    res.status(500).json({ error: 'Error del servidor.' });
};

const isAdmin = (user) => hasAnyRole(user, ADMIN_ROLES);
const canManageExams = (user) => isAdmin(user) || hasAnyRole(user, ['Instructor']);
const isDate = (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
const isCount = (value) => Number.isInteger(value) && value >= 0;

async function exists(db, table, id) {
    const [rows] = await db.execute(`SELECT id FROM ${table} WHERE id = ?`, [id]);
    return rows.length > 0;
}

// Whole months from one YYYY-MM-DD date to another.
function monthsBetween(from, to) {
    const [y1, m1, d1] = from.split('-').map(Number);
    const [y2, m2, d2] = to.split('-').map(Number);
    return (y2 - y1) * 12 + (m2 - m1) - (d2 < d1 ? 1 : 0);
}

// ---- Grades ----
exports.getGrados = async (req, res) => {
    try {
        const disciplina = req.query.disciplina_id;
        const [rows] = await req.db.execute(
            `SELECT id, disciplina_id, orden, nombre, clases_minimas, meses_minimos, tecnicas FROM grados
             ${disciplina ? 'WHERE disciplina_id = ?' : ''} ORDER BY disciplina_id, orden`,
            disciplina ? [disciplina] : [],
        );
        res.json(rows);
    } catch (error) {
        serverError('Error fetching grados:', error, res);
    }
};

exports.createGrado = async (req, res) => {
    const { disciplina_id, orden } = req.body;
    const nombre = typeof req.body.nombre === 'string' ? req.body.nombre.trim() : '';
    const clases = req.body.clases_minimas ?? 0;
    const meses = req.body.meses_minimos ?? 0;
    if (!nombre || nombre.length > 120) return bad(res, 'El nombre del grado es obligatorio (nombre).');
    if (!Number.isInteger(orden) || orden < 1) return bad(res, 'orden debe ser un número entero desde 1.');
    if (!isCount(clases)) return bad(res, 'clases_minimas debe ser un número entero, 0 o más.');
    if (!isCount(meses)) return bad(res, 'meses_minimos debe ser un número entero, 0 o más.');
    try {
        if (!Number.isInteger(disciplina_id) || !(await exists(req.db, 'disciplinas', disciplina_id))) return notFound(res, 'Disciplina no encontrada.');
        const [result] = await req.db.execute(
            'INSERT INTO grados (disciplina_id, orden, nombre, clases_minimas, meses_minimos, tecnicas) VALUES (?, ?, ?, ?, ?, ?)',
            [disciplina_id, orden, nombre, clases, meses, req.body.tecnicas ? String(req.body.tecnicas) : null],
        );
        res.status(201).json({ message: 'Grado creado.', id: result.insertId });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') return conflict(res, 'Ya existe un grado en esa posición de la disciplina (orden).');
        serverError('Error creating grado:', error, res);
    }
};

exports.placeAlumno = async (req, res) => {
    const { grado_id, fecha } = req.body;
    if (!isDate(fecha)) return bad(res, 'fecha debe ser una fecha real con el formato YYYY-MM-DD.');
    try {
        if (!(await exists(req.db, 'usuarios', req.params.id))) return notFound(res, 'Alumno no encontrado.');
        if (!Number.isInteger(grado_id) || !(await exists(req.db, 'grados', grado_id))) return notFound(res, 'Grado no encontrado.');
        await req.db.execute('INSERT INTO historial_grados (alumno_id, grado_id, fecha) VALUES (?, ?, ?)', [req.params.id, grado_id, fecha]);
        res.status(201).json({ message: 'Grado registrado.' });
    } catch (error) {
        serverError('Error placing alumno:', error, res);
    }
};

// ---- Progress and eligibility ----
async function progressOf(db, alumnoId) {
    const today = todayInChile();
    const [grados] = await db.execute(
        `SELECT g.id, g.disciplina_id, d.nombre AS disciplina, g.orden, g.nombre, g.clases_minimas, g.meses_minimos
         FROM grados g JOIN disciplinas d ON d.id = g.disciplina_id ORDER BY g.disciplina_id, g.orden`,
    );
    const [historial] = await db.execute(
        `SELECT h.id, h.fecha, g.id AS grado_id, g.nombre AS grado, g.disciplina_id, d.nombre AS disciplina
         FROM historial_grados h JOIN grados g ON g.id = h.grado_id JOIN disciplinas d ON d.id = g.disciplina_id
         WHERE h.alumno_id = ? ORDER BY h.fecha, h.id`,
        [alumnoId],
    );

    const disciplinas = [];
    for (const disciplinaId of [...new Set(grados.map((g) => g.disciplina_id))]) {
        const ladder = grados.filter((g) => g.disciplina_id === disciplinaId);
        const placements = historial.filter((h) => h.disciplina_id === disciplinaId);
        const last = placements.at(-1) ?? null;
        const actualGrade = last ? ladder.find((g) => g.id === last.grado_id) : null;
        const siguiente = actualGrade ? ladder.find((g) => g.orden > actualGrade.orden) ?? null : ladder[0];

        let requisitos = null;
        let habilitado = false;
        if (siguiente) {
            const [[attended]] = await db.execute(
                `SELECT COUNT(*) AS n FROM asistencias a
                 JOIN sesiones se ON se.id = a.sesion_id JOIN clases c ON c.id = se.clase_id
                 WHERE a.alumno_id = ? AND a.presente = 1 AND c.disciplina_id = ? ${last ? 'AND se.fecha >= ?' : ''}`,
                last ? [alumnoId, disciplinaId, last.fecha] : [alumnoId, disciplinaId],
            );
            const asistidas = Number(attended.n);
            const transcurridos = last ? monthsBetween(last.fecha, today) : null;
            requisitos = {
                clases: { minimas: siguiente.clases_minimas, asistidas, cumple: asistidas >= siguiente.clases_minimas },
                meses: {
                    minimos: siguiente.meses_minimos,
                    transcurridos,
                    cumple: siguiente.meses_minimos === 0 || (transcurridos !== null && transcurridos >= siguiente.meses_minimos),
                },
            };
            habilitado = requisitos.clases.cumple && requisitos.meses.cumple;
        }
        disciplinas.push({
            disciplina_id: disciplinaId,
            disciplina: ladder[0].disciplina,
            actual: actualGrade ? { id: actualGrade.id, nombre: actualGrade.nombre, orden: actualGrade.orden, fecha: last.fecha } : null,
            siguiente: siguiente ? { id: siguiente.id, nombre: siguiente.nombre, orden: siguiente.orden } : null,
            requisitos,
            habilitado,
        });
    }
    return { disciplinas, historial: historial.map(({ id, fecha, grado, disciplina }) => ({ id, fecha, grado, disciplina })) };
}

exports.miProgreso = async (req, res) => {
    const alumnoId = req.query.alumno_id ? Number(req.query.alumno_id) : req.user.id;
    if (!Number.isInteger(alumnoId)) return bad(res, 'alumno_id no es válido.');
    try {
        const allowed = alumnoId === req.user.id || canManageExams(req.user) || (await isGuardianOf(req.db, req.user.id, alumnoId));
        if (!allowed) return forbidden(res, 'No puedes ver el progreso de esta persona.');
        res.json(await progressOf(req.db, alumnoId));
    } catch (error) {
        serverError('Error fetching progreso:', error, res);
    }
};

// Students (with the Alumno role) who meet the requirements of their next grade.
exports.habilitados = async (req, res) => {
    if (!canManageExams(req.user)) return forbidden(res, 'Solo instructores y administración ven a los alumnos habilitados.');
    try {
        const [students] = await req.db.execute(
            `SELECT DISTINCT u.id, u.nombre FROM usuarios u JOIN usuario_roles ur ON ur.usuario_id = u.id
             JOIN roles r ON r.id = ur.rol_id WHERE r.nombre = 'Alumno' ORDER BY u.nombre`,
        );
        const result = [];
        for (const student of students) {
            for (const d of (await progressOf(req.db, student.id)).disciplinas) {
                if (d.habilitado) result.push({ alumno_id: student.id, alumno: student.nombre, disciplina_id: d.disciplina_id, disciplina: d.disciplina, actual: d.actual, siguiente: d.siguiente });
            }
        }
        res.json(result);
    } catch (error) {
        serverError('Error fetching habilitados:', error, res);
    }
};

// ---- Exams ----
exports.createExamen = async (req, res) => {
    const { fecha, sede_id, monto_derecho } = req.body;
    const nombre = typeof req.body.nombre === 'string' ? req.body.nombre.trim().slice(0, 120) : null;
    if (!isDate(fecha)) return bad(res, 'fecha debe ser una fecha real con el formato YYYY-MM-DD.');
    if (monto_derecho != null && !(Number.isInteger(monto_derecho) && monto_derecho > 0)) return bad(res, 'monto_derecho debe ser un número entero de pesos mayor que 0.');
    try {
        if (sede_id != null && !(await exists(req.db, 'sedes', sede_id))) return notFound(res, 'Sede no encontrada.');
        const [result] = await req.db.execute(
            'INSERT INTO examenes (sede_id, nombre, fecha, monto_derecho) VALUES (?, ?, ?, ?)',
            [sede_id ?? null, nombre || null, fecha, monto_derecho ?? null],
        );
        res.status(201).json({ message: 'Examen creado.', id: result.insertId });
    } catch (error) {
        serverError('Error creating examen:', error, res);
    }
};

exports.getExamenes = async (req, res) => {
    if (!canManageExams(req.user)) return forbidden(res, 'Solo instructores y administración ven los exámenes.');
    try {
        const [rows] = await req.db.execute(
            `SELECT e.id, e.nombre, e.fecha, e.estado, e.monto_derecho, s.ciudad AS sede,
                    (SELECT COUNT(*) FROM inscripciones_examen i WHERE i.examen_id = e.id) AS nominados
             FROM examenes e LEFT JOIN sedes s ON s.id = e.sede_id ORDER BY e.fecha DESC, e.id DESC`,
        );
        res.json(rows.map((row) => ({ ...row, nominados: Number(row.nominados) })));
    } catch (error) {
        serverError('Error fetching examenes:', error, res);
    }
};

exports.getExamen = async (req, res) => {
    if (!canManageExams(req.user)) return forbidden(res, 'Solo instructores y administración ven los exámenes.');
    try {
        const [rows] = await req.db.execute(
            `SELECT e.id, e.nombre, e.fecha, e.estado, e.monto_derecho, s.ciudad AS sede
             FROM examenes e LEFT JOIN sedes s ON s.id = e.sede_id WHERE e.id = ?`,
            [req.params.id],
        );
        if (!rows.length) return notFound(res, 'Examen no encontrado.');
        const [inscripciones] = await req.db.execute(
            `SELECT i.alumno_id, u.nombre AS alumno, g.nombre AS grado, i.estado
             FROM inscripciones_examen i JOIN usuarios u ON u.id = i.alumno_id JOIN grados g ON g.id = i.grado_id
             WHERE i.examen_id = ? ORDER BY u.nombre`,
            [req.params.id],
        );
        res.json({ ...rows[0], inscripciones });
    } catch (error) {
        serverError('Error fetching examen:', error, res);
    }
};

exports.updateExamen = async (req, res) => {
    const { estado } = req.body;
    if (!EXAM_STATES_SETTABLE.includes(estado)) return bad(res, `estado debe ser uno de: ${EXAM_STATES_SETTABLE.join(', ')}.`);
    try {
        const [rows] = await req.db.execute('SELECT estado FROM examenes WHERE id = ?', [req.params.id]);
        if (!rows.length) return notFound(res, 'Examen no encontrado.');
        if (rows[0].estado === 'realizado') return conflict(res, 'El examen ya se realizó.');
        await req.db.execute('UPDATE examenes SET estado = ? WHERE id = ?', [estado, req.params.id]);
        res.json({ message: 'Examen actualizado.' });
    } catch (error) {
        serverError('Error updating examen:', error, res);
    }
};

// ---- Nominations ----
exports.nominar = async (req, res) => {
    if (!canManageExams(req.user)) return forbidden(res, 'Solo instructores y administración nominan alumnos.');
    const { alumno_id, disciplina_id } = req.body;
    try {
        const [exams] = await req.db.execute('SELECT id, estado FROM examenes WHERE id = ?', [req.params.id]);
        if (!exams.length) return notFound(res, 'Examen no encontrado.');
        if (exams[0].estado !== 'programado') return conflict(res, `El examen está ${exams[0].estado}: no recibe nominaciones.`);
        if (!Number.isInteger(alumno_id) || !(await exists(req.db, 'usuarios', alumno_id))) return notFound(res, 'Alumno no encontrado.');

        const progress = (await progressOf(req.db, alumno_id)).disciplinas.find((d) => d.disciplina_id === disciplina_id);
        if (!progress) return bad(res, 'La disciplina no tiene grados definidos (disciplina_id).');
        if (!progress.siguiente) return bad(res, 'El alumno ya está en el último grado de la disciplina.');
        if (!progress.habilitado) {
            const { clases, meses } = progress.requisitos;
            const missing = [];
            if (!clases.cumple) missing.push(`clases asistidas ${clases.asistidas} de ${clases.minimas}`);
            if (!meses.cumple) missing.push(`meses en el grado ${meses.transcurridos ?? 'sin grado registrado'} de ${meses.minimos}`);
            return bad(res, `No cumple los requisitos del grado ${progress.siguiente.nombre}: ${missing.join('; ')}.`);
        }

        await req.db.execute(
            'INSERT INTO inscripciones_examen (examen_id, alumno_id, grado_id, nominado_por) VALUES (?, ?, ?, ?)',
            [exams[0].id, alumno_id, progress.siguiente.id, req.user.id],
        );
        res.status(201).json({ message: 'Alumno nominado.' });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') return conflict(res, 'El alumno ya está nominado a este examen.');
        serverError('Error nominating:', error, res);
    }
};

// Administration approves the nomination; if the exam has a fee it is charged here.
exports.confirmar = async (req, res) => {
    let connection;
    try {
        const [rows] = await req.db.execute(
            `SELECT i.id, i.estado, e.fecha, e.monto_derecho, g.nombre AS grado
             FROM inscripciones_examen i JOIN examenes e ON e.id = i.examen_id JOIN grados g ON g.id = i.grado_id
             WHERE i.examen_id = ? AND i.alumno_id = ?`,
            [req.params.id, req.params.alumnoId],
        );
        if (!rows.length) return notFound(res, 'Ese alumno no está nominado a este examen.');
        const nomination = rows[0];
        if (nomination.estado !== 'nominado') return conflict(res, `La nominación ya está ${nomination.estado}.`);

        connection = await req.db.getConnection();
        await connection.beginTransaction();
        let cargoId = null;
        if (nomination.monto_derecho) {
            const [cargo] = await connection.execute(
                'INSERT INTO cargos (alumno_id, concepto, monto, fecha_emision, fecha_vencimiento) VALUES (?, ?, ?, ?, ?)',
                [req.params.alumnoId, `Derecho a examen: ${nomination.grado}`, nomination.monto_derecho, todayInChile(), nomination.fecha],
            );
            cargoId = cargo.insertId;
        }
        await connection.execute("UPDATE inscripciones_examen SET estado = 'confirmado', cargo_id = ? WHERE id = ?", [cargoId, nomination.id]);
        await connection.commit();
        res.json({ message: 'Nominación confirmada.' });
    } catch (error) {
        if (connection) await connection.rollback().catch(() => {});
        serverError('Error confirming nomination:', error, res);
    } finally {
        if (connection) connection.release();
    }
};

// ---- Results ----
exports.resultados = async (req, res) => {
    const { resultados } = req.body;
    if (!Array.isArray(resultados) || !resultados.length) return bad(res, 'resultados debe ser una lista con al menos un alumno.');
    for (const item of resultados) {
        if (!Number.isInteger(item?.alumno_id)) return bad(res, 'Cada resultado necesita un alumno_id.');
        if (!RESULTS.includes(item.resultado)) return bad(res, `resultado debe ser uno de: ${RESULTS.join(', ')}.`);
    }

    let connection;
    try {
        const [exams] = await req.db.execute('SELECT id, fecha, estado FROM examenes WHERE id = ?', [req.params.id]);
        if (!exams.length) return notFound(res, 'Examen no encontrado.');
        const exam = exams[0];
        if (exam.estado === 'cancelado') return conflict(res, 'El examen fue cancelado.');
        if (exam.fecha > todayInChile()) return bad(res, `El examen aún no se realiza: su fecha es ${exam.fecha}.`);

        // Everything is checked before anything is written.
        const [nominations] = await req.db.execute('SELECT alumno_id, grado_id, estado FROM inscripciones_examen WHERE examen_id = ?', [exam.id]);
        const byStudent = new Map(nominations.map((n) => [n.alumno_id, n]));
        for (const { alumno_id } of resultados) {
            if (byStudent.get(alumno_id)?.estado !== 'confirmado') return bad(res, `El alumno ${alumno_id} no tiene una nominación confirmada en este examen.`);
        }

        connection = await req.db.getConnection();
        await connection.beginTransaction();
        for (const { alumno_id, resultado } of resultados) {
            await connection.execute('UPDATE inscripciones_examen SET estado = ? WHERE examen_id = ? AND alumno_id = ?', [resultado, exam.id, alumno_id]);
            if (resultado === 'aprobado') {
                await connection.execute(
                    'INSERT INTO historial_grados (alumno_id, grado_id, fecha, examen_id) VALUES (?, ?, ?, ?)',
                    [alumno_id, byStudent.get(alumno_id).grado_id, exam.fecha, exam.id],
                );
            }
        }
        await connection.execute("UPDATE examenes SET estado = 'realizado' WHERE id = ?", [exam.id]);
        await connection.commit();
        res.json({ message: 'Resultados guardados.' });
    } catch (error) {
        if (connection) await connection.rollback().catch(() => {});
        serverError('Error saving resultados:', error, res);
    } finally {
        if (connection) connection.release();
    }
};
