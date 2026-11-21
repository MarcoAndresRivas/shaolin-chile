// Fase 2, T7: grades, eligibility, exams, nominations and results.
//
// A student is eligible for the next grade when they have attended the classes
// of the discipline that the next grade asks for since they reached their
// current grade, have been in it for the months it asks for, and have the
// minimum age of the next level. Levels follow the Shaolin Temple Duan Pin
// system (serie duan|pin, nivel, etapa, grado_pin); the head instructor sets
// their content. An exam has three parts (conduct, technique, theory) plus
// combat where the level requires it, recorded with its jury.

const { hasAnyRole, ADMIN_ROLES } = require('../middleware/authMiddleware');
const { isGuardianOf } = require('../src/familia');
const { todayInChile } = require('../src/dates');

const RESULTS = ['aprobado', 'reprobado', 'ausente'];
const EXAM_STATES_SETTABLE = ['programado', 'cancelado'];
const SERIES = ['duan', 'pin'];

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
const isBool = (value) => typeof value === 'boolean';
const asBool = (value) => (value === null || value === undefined ? null : Boolean(value));
const text = (value) => (typeof value === 'string' ? value.trim() : '');

// Whole years of age on a date, from a YYYY-MM-DD date of birth.
function ageOn(birth, today) {
    const [y1, m1, d1] = birth.split('-').map(Number);
    const [y2, m2, d2] = today.split('-').map(Number);
    return y2 - y1 - (m2 < m1 || (m2 === m1 && d2 < d1) ? 1 : 0);
}

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
            `SELECT id, disciplina_id, orden, nombre, clases_minimas, meses_minimos, tecnicas, serie, nivel, etapa, grado_pin,
                    edad_minima, formas, requiere_teoria, requiere_combate FROM grados
             ${disciplina ? 'WHERE disciplina_id = ?' : ''} ORDER BY disciplina_id, orden`,
            disciplina ? [disciplina] : [],
        );
        res.json(rows.map((g) => ({ ...g, requiere_teoria: Boolean(g.requiere_teoria), requiere_combate: Boolean(g.requiere_combate) })));
    } catch (error) {
        serverError('Error fetching grados:', error, res);
    }
};

// The content a head instructor can set on a grade, as columns to write.
// creating: every field gets its default; editing: only the fields sent.
function readGradeContent(body, creating) {
    const out = {};
    if (creating || body.nombre !== undefined) {
        const nombre = text(body.nombre);
        if (!nombre || nombre.length > 120) return { error: 'El nombre del grado es obligatorio (nombre).' };
        out.nombre = nombre;
    }
    for (const [name, label] of [['clases_minimas', 'clases_minimas'], ['meses_minimos', 'meses_minimos'], ['edad_minima', 'edad_minima']]) {
        if (body[name] === undefined) {
            if (creating) out[name] = 0;
            continue;
        }
        if (!isCount(body[name])) return { error: `${label} debe ser un número entero, 0 o más.` };
        out[name] = body[name];
    }
    for (const name of ['tecnicas', 'formas']) {
        if (body[name] === undefined) continue;
        if (body[name] !== null && typeof body[name] !== 'string') return { error: `${name} debe ser texto.` };
        if (text(body[name]).length > 5000) return { error: `${name} admite hasta 5000 caracteres.` };
        out[name] = text(body[name]) || null;
    }
    for (const name of ['requiere_teoria', 'requiere_combate']) {
        if (body[name] === undefined) continue;
        if (!isBool(body[name])) return { error: `${name} debe ser true o false.` };
        out[name] = body[name] ? 1 : 0;
    }
    return { out };
}

exports.createGrado = async (req, res) => {
    const { disciplina_id, orden, serie = null, nivel = null, etapa = null, grado_pin: gradoPin = null } = req.body;
    if (!Number.isInteger(orden) || orden < 1) return bad(res, 'orden debe ser un número entero desde 1.');
    if (serie !== null && !SERIES.includes(serie)) return bad(res, 'serie debe ser duan o pin.');
    if (nivel !== null && !(Number.isInteger(nivel) && nivel >= 1 && nivel <= 9)) return bad(res, 'nivel debe ser un número entero de 1 a 9.');
    if (gradoPin !== null && !(Number.isInteger(gradoPin) && gradoPin >= 1 && gradoPin <= 3)) return bad(res, 'grado_pin debe ser 1, 2 o 3.');
    if (etapa !== null && (typeof etapa !== 'string' || etapa.length > 20)) return bad(res, 'etapa admite hasta 20 caracteres.');
    const { out, error } = readGradeContent(req.body, true);
    if (error) return bad(res, error);
    try {
        if (!Number.isInteger(disciplina_id) || !(await exists(req.db, 'disciplinas', disciplina_id))) return notFound(res, 'Disciplina no encontrada.');
        const row = { disciplina_id, orden, serie, nivel, etapa, grado_pin: gradoPin, ...out };
        const keys = Object.keys(row);
        const [result] = await req.db.execute(
            `INSERT INTO grados (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`,
            keys.map((k) => row[k]),
        );
        res.status(201).json({ message: 'Grado creado.', id: result.insertId });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') return conflict(res, 'Ya existe un grado en esa posición de la disciplina (orden).');
        serverError('Error creating grado:', error, res);
    }
};

// The date of birth checks the minimum age of each level. It lives in detalles_alumno.
exports.setFechaNacimiento = async (req, res) => {
    const fecha = req.body?.fecha_nacimiento;
    if (!isDate(fecha) || fecha >= todayInChile()) return bad(res, 'fecha_nacimiento debe ser una fecha real pasada con el formato YYYY-MM-DD.');
    try {
        if (!(await exists(req.db, 'usuarios', req.params.id))) return notFound(res, 'Alumno no encontrado.');
        const [rows] = await req.db.execute('SELECT usuario_id FROM detalles_alumno WHERE usuario_id = ?', [req.params.id]);
        if (rows.length) await req.db.execute('UPDATE detalles_alumno SET fecha_nacimiento = ? WHERE usuario_id = ?', [fecha, req.params.id]);
        else await req.db.execute('INSERT INTO detalles_alumno (usuario_id, fecha_nacimiento) VALUES (?, ?)', [req.params.id, fecha]);
        res.json({ message: 'Fecha de nacimiento registrada.' });
    } catch (error) {
        serverError('Error saving fecha_nacimiento:', error, res);
    }
};

// The head instructor edits a level's content; its place in the ladder does not change.
exports.updateGrado = async (req, res) => {
    const { out, error } = readGradeContent(req.body ?? {}, false);
    if (error) return bad(res, error);
    const keys = Object.keys(out);
    if (!keys.length) return bad(res, 'No hay nada que actualizar.');
    try {
        const [result] = await req.db.execute(`UPDATE grados SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`, [...keys.map((k) => out[k]), req.params.id]);
        if (result.affectedRows === 0) return notFound(res, 'Grado no encontrado.');
        res.json({ message: 'Grado actualizado.' });
    } catch (failure) {
        serverError('Error updating grado:', failure, res);
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
        `SELECT g.id, g.disciplina_id, d.nombre AS disciplina, g.orden, g.nombre, g.clases_minimas, g.meses_minimos, g.edad_minima
         FROM grados g JOIN disciplinas d ON d.id = g.disciplina_id ORDER BY g.disciplina_id, g.orden`,
    );
    const [historial] = await db.execute(
        `SELECT h.id, h.fecha, g.id AS grado_id, g.nombre AS grado, g.disciplina_id, d.nombre AS disciplina
         FROM historial_grados h JOIN grados g ON g.id = h.grado_id JOIN disciplinas d ON d.id = g.disciplina_id
         WHERE h.alumno_id = ? ORDER BY h.fecha, h.id`,
        [alumnoId],
    );

    const [[person]] = await db.execute('SELECT fecha_nacimiento FROM detalles_alumno WHERE usuario_id = ?', [alumnoId]);
    const birth = person?.fecha_nacimiento ? String(person.fecha_nacimiento).slice(0, 10) : null;
    const edad = birth ? ageOn(birth, today) : null;

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
                // A level with a minimum age needs the date of birth to check it.
                edad: { minima: siguiente.edad_minima, actual: edad, cumple: siguiente.edad_minima === 0 || (edad !== null && edad >= siguiente.edad_minima) },
            };
            habilitado = requisitos.clases.cumple && requisitos.meses.cumple && requisitos.edad.cumple;
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
            `SELECT i.alumno_id, u.nombre AS alumno, g.nombre AS grado, g.requiere_teoria, g.requiere_combate, i.estado,
                    i.conducta_ok, i.nota_tecnica, i.nota_teoria, i.combate_ok, i.evaluadores, i.observaciones
             FROM inscripciones_examen i JOIN usuarios u ON u.id = i.alumno_id JOIN grados g ON g.id = i.grado_id
             WHERE i.examen_id = ? ORDER BY u.nombre`,
            [req.params.id],
        );
        res.json({
            ...rows[0],
            inscripciones: inscripciones.map((i) => ({
                ...i,
                requiere_teoria: Boolean(i.requiere_teoria),
                requiere_combate: Boolean(i.requiere_combate),
                conducta_ok: asBool(i.conducta_ok),
                combate_ok: asBool(i.combate_ok),
                nota_tecnica: i.nota_tecnica === null ? null : Number(i.nota_tecnica),
            })),
        });
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
            const { clases, meses, edad } = progress.requisitos;
            const missing = [];
            if (!clases.cumple) missing.push(`clases asistidas ${clases.asistidas} de ${clases.minimas}`);
            if (!meses.cumple) missing.push(`meses en el grado ${meses.transcurridos ?? 'sin grado registrado'} de ${meses.minimos}`);
            if (!edad.cumple) missing.push(edad.actual === null ? `sin fecha de nacimiento registrada (edad mínima ${edad.minima} años)` : `edad ${edad.actual} de ${edad.minima} años`);
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
// The scores of one result: conduct, technique (0-10), theory (0-100), combat,
// jury and notes. A pass needs conduct accepted, a technique score and the jury;
// theory and combat are checked against the level once it is known.
function readScores(item) {
    for (const name of ['conducta_ok', 'combate_ok']) {
        if (item[name] !== undefined && item[name] !== null && !isBool(item[name])) return `${name} debe ser true o false.`;
    }
    if (item.nota_tecnica !== undefined && item.nota_tecnica !== null
        && !(typeof item.nota_tecnica === 'number' && Number.isFinite(item.nota_tecnica) && item.nota_tecnica >= 0 && item.nota_tecnica <= 10)) {
        return 'nota_tecnica debe ser un número de 0 a 10.';
    }
    if (item.nota_teoria !== undefined && item.nota_teoria !== null && !(Number.isInteger(item.nota_teoria) && item.nota_teoria >= 0 && item.nota_teoria <= 100)) {
        return 'nota_teoria debe ser un número entero de 0 a 100.';
    }
    if (item.evaluadores !== undefined && item.evaluadores !== null && (typeof item.evaluadores !== 'string' || item.evaluadores.length > 255)) return 'evaluadores admite hasta 255 caracteres.';
    if (item.observaciones !== undefined && item.observaciones !== null && (typeof item.observaciones !== 'string' || item.observaciones.length > 2000)) return 'observaciones admite hasta 2000 caracteres.';
    if (item.resultado === 'aprobado') {
        if (item.conducta_ok !== true) return 'Para aprobar, la conducta y los preceptos deben estar cumplidos (conducta_ok).';
        if (typeof item.nota_tecnica !== 'number') return 'Para aprobar indica la nota técnica, de 0 a 10 (nota_tecnica).';
        if (!text(item.evaluadores)) return 'Para aprobar indica quiénes evaluaron (evaluadores).';
    }
    return null;
}

exports.resultados = async (req, res) => {
    const { resultados } = req.body;
    if (!Array.isArray(resultados) || !resultados.length) return bad(res, 'resultados debe ser una lista con al menos un alumno.');
    for (const item of resultados) {
        if (!Number.isInteger(item?.alumno_id)) return bad(res, 'Cada resultado necesita un alumno_id.');
        if (!RESULTS.includes(item.resultado)) return bad(res, `resultado debe ser uno de: ${RESULTS.join(', ')}.`);
        const error = readScores(item);
        if (error) return bad(res, error);
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
        const gradeIds = [...new Set(nominations.map((n) => n.grado_id))];
        const [levels] = await req.db.execute(`SELECT id, requiere_teoria, requiere_combate FROM grados WHERE id IN (${gradeIds.map(() => '?').join(', ')})`, gradeIds);
        for (const item of resultados) {
            if (item.resultado !== 'aprobado') continue;
            const level = levels.find((l) => l.id === byStudent.get(item.alumno_id).grado_id);
            if (level.requiere_teoria && (item.nota_teoria === undefined || item.nota_teoria === null)) return bad(res, 'Este nivel exige teoría: indica la nota de 0 a 100 (nota_teoria).');
            if (level.requiere_combate && item.combate_ok !== true) return bad(res, 'Este nivel exige combate aprobado (combate_ok).');
        }

        connection = await req.db.getConnection();
        await connection.beginTransaction();
        for (const item of resultados) {
            const { alumno_id, resultado } = item;
            await connection.execute(
                `UPDATE inscripciones_examen SET estado = ?, conducta_ok = ?, nota_tecnica = ?, nota_teoria = ?, combate_ok = ?, evaluadores = ?, observaciones = ?
                 WHERE examen_id = ? AND alumno_id = ?`,
                [
                    resultado,
                    isBool(item.conducta_ok) ? (item.conducta_ok ? 1 : 0) : null,
                    typeof item.nota_tecnica === 'number' ? Math.round(item.nota_tecnica * 10) / 10 : null,
                    Number.isInteger(item.nota_teoria) ? item.nota_teoria : null,
                    isBool(item.combate_ok) ? (item.combate_ok ? 1 : 0) : null,
                    text(item.evaluadores) || null,
                    text(item.observaciones) || null,
                    exam.id,
                    alumno_id,
                ],
            );
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
