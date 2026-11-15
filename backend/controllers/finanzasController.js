// Fase 2, T6: plans, subscriptions, charges, payments, statements and overdue students.
// Amounts are whole Chilean pesos. Payments are bank transfers that administration validates.

const { hasAnyRole, ADMIN_ROLES } = require('../middleware/authMiddleware');
const { isGuardianOf } = require('../src/familia');
const { todayInChile } = require('../src/dates');

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const PERIOD = /^\d{4}-(0[1-9]|1[0-2])$/;
const PERIODICITIES = ['mensual', 'unico'];
const SUBSCRIPTION_STATES = ['activa', 'pausada', 'cancelada'];
const PAYMENT_STATES = ['por_validar', 'validado', 'rechazado'];
const DAY_MS = 24 * 60 * 60 * 1000;

const bad = (res, message) => res.status(400).json({ error: message });
const notFound = (res, message) => res.status(404).json({ error: message });
const conflict = (res, message) => res.status(409).json({ error: message });
const forbidden = (res, message) => res.status(403).json({ error: message });
const serverError = (label, error, res) => {
    console.error(label, error);
    res.status(500).json({ error: 'Error del servidor.' });
};

const isAdmin = (user) => hasAnyRole(user, ADMIN_ROLES);
const isPesos = (value) => Number.isInteger(value) && value > 0;
const isDate = (value) => typeof value === 'string' && DATE.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`))
    && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;

const daysBetween = (from, to) => Math.round((new Date(`${to}T00:00:00Z`) - new Date(`${from}T00:00:00Z`)) / DAY_MS);

async function exists(db, table, id) {
    const [rows] = await db.execute(`SELECT id FROM ${table} WHERE id = ?`, [id]);
    return rows.length > 0;
}

// The student, their guardian or administration.
async function mayViewAccount(req, alumnoId) {
    return alumnoId === req.user.id || isAdmin(req.user) || (await isGuardianOf(req.db, req.user.id, alumnoId));
}

const VALIDATED = "COALESCE((SELECT SUM(p.monto) FROM pagos p WHERE p.cargo_id = c.id AND p.estado = 'validado'), 0)";

// ---- Plans ----
exports.getPlanes = async (req, res) => {
    try {
        const all = req.query.todos && isAdmin(req.user);
        const [rows] = await req.db.execute(`SELECT id, nombre, monto, periodicidad, activa FROM planes ${all ? '' : 'WHERE activa = 1'} ORDER BY id`);
        res.json(rows.map((row) => ({ ...row, activa: Boolean(row.activa) })));
    } catch (error) {
        serverError('Error fetching planes:', error, res);
    }
};

exports.createPlan = async (req, res) => {
    const nombre = typeof req.body.nombre === 'string' ? req.body.nombre.trim() : '';
    const { monto, periodicidad } = req.body;
    if (!nombre || nombre.length > 120) return bad(res, 'El nombre del plan es obligatorio (nombre).');
    if (!Number.isInteger(monto) || monto < 0) return bad(res, 'monto debe ser un número entero de pesos, sin decimales.');
    if (!PERIODICITIES.includes(periodicidad)) return bad(res, `periodicidad debe ser una de: ${PERIODICITIES.join(', ')}.`);
    try {
        const [result] = await req.db.execute('INSERT INTO planes (nombre, monto, periodicidad) VALUES (?, ?, ?)', [nombre, monto, periodicidad]);
        res.status(201).json({ message: 'Plan creado.', id: result.insertId });
    } catch (error) {
        serverError('Error creating plan:', error, res);
    }
};

exports.updatePlan = async (req, res) => {
    const { nombre, monto, activa } = req.body;
    const fields = [];
    const values = [];
    if (nombre !== undefined) {
        if (typeof nombre !== 'string' || !nombre.trim()) return bad(res, 'El nombre no puede quedar vacío (nombre).');
        fields.push('nombre = ?'); values.push(nombre.trim());
    }
    if (monto !== undefined) {
        if (!Number.isInteger(monto) || monto < 0) return bad(res, 'monto debe ser un número entero de pesos, sin decimales.');
        fields.push('monto = ?'); values.push(monto);
    }
    if (activa !== undefined) { fields.push('activa = ?'); values.push(activa ? 1 : 0); }
    if (!fields.length) return bad(res, 'No hay nada que actualizar.');
    try {
        const [result] = await req.db.execute(`UPDATE planes SET ${fields.join(', ')} WHERE id = ?`, [...values, req.params.id]);
        if (result.affectedRows === 0) return notFound(res, 'Plan no encontrado.');
        res.json({ message: 'Plan actualizado.' });
    } catch (error) {
        serverError('Error updating plan:', error, res);
    }
};

// ---- Subscriptions ----
exports.createSuscripcion = async (req, res) => {
    const { alumno_id, plan_id, fecha_inicio, fecha_fin } = req.body;
    if (!isDate(fecha_inicio)) return bad(res, 'fecha_inicio debe ser una fecha real con el formato YYYY-MM-DD.');
    if (fecha_fin != null && !isDate(fecha_fin)) return bad(res, 'fecha_fin debe ser una fecha real con el formato YYYY-MM-DD.');
    try {
        if (!Number.isInteger(alumno_id) || !(await exists(req.db, 'usuarios', alumno_id))) return notFound(res, 'Alumno no encontrado.');
        if (!Number.isInteger(plan_id) || !(await exists(req.db, 'planes', plan_id))) return notFound(res, 'Plan no encontrado.');
        const [result] = await req.db.execute(
            'INSERT INTO suscripciones (alumno_id, plan_id, fecha_inicio, fecha_fin) VALUES (?, ?, ?, ?)',
            [alumno_id, plan_id, fecha_inicio, fecha_fin ?? null],
        );
        res.status(201).json({ message: 'Suscripción creada.', id: result.insertId });
    } catch (error) {
        serverError('Error creating suscripcion:', error, res);
    }
};

exports.getSuscripciones = async (req, res) => {
    try {
        const alumno = req.query.alumno_id;
        const [rows] = await req.db.execute(
            `SELECT s.id, s.alumno_id, u.nombre AS alumno, s.plan_id, p.nombre AS plan, p.monto, s.fecha_inicio, s.fecha_fin, s.estado
             FROM suscripciones s JOIN usuarios u ON u.id = s.alumno_id JOIN planes p ON p.id = s.plan_id
             ${alumno ? 'WHERE s.alumno_id = ?' : ''} ORDER BY s.id`,
            alumno ? [alumno] : [],
        );
        res.json(rows);
    } catch (error) {
        serverError('Error fetching suscripciones:', error, res);
    }
};

exports.updateSuscripcion = async (req, res) => {
    const { estado, fecha_fin } = req.body;
    if (estado !== undefined && !SUBSCRIPTION_STATES.includes(estado)) return bad(res, `estado debe ser uno de: ${SUBSCRIPTION_STATES.join(', ')}.`);
    if (fecha_fin != null && !isDate(fecha_fin)) return bad(res, 'fecha_fin debe ser una fecha real con el formato YYYY-MM-DD.');
    const fields = [];
    const values = [];
    if (estado !== undefined) { fields.push('estado = ?'); values.push(estado); }
    if (fecha_fin !== undefined) { fields.push('fecha_fin = ?'); values.push(fecha_fin); }
    if (!fields.length) return bad(res, 'No hay nada que actualizar.');
    try {
        const [result] = await req.db.execute(`UPDATE suscripciones SET ${fields.join(', ')} WHERE id = ?`, [...values, req.params.id]);
        if (result.affectedRows === 0) return notFound(res, 'Suscripción no encontrada.');
        res.json({ message: 'Suscripción actualizada.' });
    } catch (error) {
        serverError('Error updating suscripcion:', error, res);
    }
};

// ---- Charges ----
exports.createCargo = async (req, res) => {
    const { alumno_id, plan_id, monto, fecha_vencimiento } = req.body;
    const concepto = typeof req.body.concepto === 'string' ? req.body.concepto.trim() : '';
    if (!concepto || concepto.length > 255) return bad(res, 'El concepto es obligatorio (concepto).');
    if (!isPesos(monto)) return bad(res, 'monto debe ser un número entero de pesos mayor que 0.');
    if (!isDate(fecha_vencimiento)) return bad(res, 'fecha_vencimiento debe ser una fecha real con el formato YYYY-MM-DD.');
    try {
        if (!Number.isInteger(alumno_id) || !(await exists(req.db, 'usuarios', alumno_id))) return notFound(res, 'Alumno no encontrado.');
        const [result] = await req.db.execute(
            'INSERT INTO cargos (alumno_id, plan_id, concepto, monto, fecha_emision, fecha_vencimiento) VALUES (?, ?, ?, ?, ?, ?)',
            [alumno_id, plan_id ?? null, concepto, monto, todayInChile(), fecha_vencimiento],
        );
        res.status(201).json({ message: 'Cargo creado.', id: result.insertId });
    } catch (error) {
        serverError('Error creating cargo:', error, res);
    }
};

// One charge per active monthly subscription for the period; safe to repeat.
exports.generarCargos = async (req, res) => {
    const { periodo, dia_vencimiento } = req.body;
    if (typeof periodo !== 'string' || !PERIOD.test(periodo)) return bad(res, 'periodo debe tener el formato YYYY-MM (periodo).');
    if (!Number.isInteger(dia_vencimiento) || dia_vencimiento < 1 || dia_vencimiento > 28) return bad(res, 'dia_vencimiento debe ser un día del 1 al 28 (dia_vencimiento).');
    try {
        const [subs] = await req.db.execute(
            `SELECT s.id, s.alumno_id, p.id AS plan_id, p.nombre, p.monto
             FROM suscripciones s JOIN planes p ON p.id = s.plan_id
             WHERE s.estado = 'activa' AND p.periodicidad = 'mensual'
               AND s.fecha_inicio <= ? AND (s.fecha_fin IS NULL OR s.fecha_fin >= ?)
             ORDER BY s.id`,
            [`${periodo}-31`, `${periodo}-01`],
        );
        let creados = 0;
        let omitidos = 0;
        for (const sub of subs) {
            const [already] = await req.db.execute('SELECT id FROM cargos WHERE suscripcion_id = ? AND periodo = ?', [sub.id, periodo]);
            if (already.length) { omitidos += 1; continue; }
            await req.db.execute(
                `INSERT INTO cargos (alumno_id, plan_id, suscripcion_id, concepto, monto, periodo, fecha_emision, fecha_vencimiento)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [sub.alumno_id, sub.plan_id, sub.id, `${sub.nombre} ${periodo}`, sub.monto, periodo, todayInChile(), `${periodo}-${String(dia_vencimiento).padStart(2, '0')}`],
            );
            creados += 1;
        }
        res.status(201).json({ creados, omitidos });
    } catch (error) {
        serverError('Error generating cargos:', error, res);
    }
};

exports.anularCargo = async (req, res) => {
    try {
        const [rows] = await req.db.execute(`SELECT c.id, c.estado, ${VALIDATED} AS pagado FROM cargos c WHERE c.id = ?`, [req.params.id]);
        if (!rows.length) return notFound(res, 'Cargo no encontrado.');
        if (Number(rows[0].pagado) > 0) return conflict(res, 'El cargo ya tiene pagos validados: no se puede anular.');
        await req.db.execute("UPDATE cargos SET estado = 'anulado' WHERE id = ?", [req.params.id]);
        res.json({ message: 'Cargo anulado.' });
    } catch (error) {
        serverError('Error voiding cargo:', error, res);
    }
};

// ---- Payments ----
async function closeIfPaid(db, cargoId) {
    const [[row]] = await db.execute(`SELECT c.monto, ${VALIDATED} AS pagado FROM cargos c WHERE c.id = ?`, [cargoId]);
    if (Number(row.pagado) >= row.monto) await db.execute("UPDATE cargos SET estado = 'pagado' WHERE id = ?", [cargoId]);
}

exports.createPago = async (req, res) => {
    const { monto } = req.body;
    const referencia = typeof req.body.referencia === 'string' ? req.body.referencia.trim().slice(0, 255) : null;
    if (!isPesos(monto)) return bad(res, 'monto debe ser un número entero de pesos mayor que 0.');

    let connection;
    try {
        const [rows] = await req.db.execute(`SELECT c.id, c.alumno_id, c.monto, c.estado, ${VALIDATED} AS pagado FROM cargos c WHERE c.id = ?`, [req.params.id]);
        if (!rows.length) return notFound(res, 'Cargo no encontrado.');
        const cargo = rows[0];
        if (!(await mayViewAccount(req, cargo.alumno_id))) return forbidden(res, 'No puedes registrar pagos de este cargo.');
        if (cargo.estado !== 'pendiente') return conflict(res, `El cargo está ${cargo.estado}: no recibe pagos.`);
        if (monto > cargo.monto - Number(cargo.pagado)) return bad(res, 'El monto supera el saldo del cargo.');

        // Administration records a transfer it has already verified; anyone else reports one to be validated.
        const validated = isAdmin(req.user);
        connection = await req.db.getConnection();
        await connection.beginTransaction();
        const [result] = await connection.execute(
            `INSERT INTO pagos (cargo_id, monto, referencia, estado, registrado_por, validado_por, fecha_validacion)
             VALUES (?, ?, ?, ?, ?, ?, ${validated ? 'CURRENT_TIMESTAMP' : 'NULL'})`,
            [cargo.id, monto, referencia || null, validated ? 'validado' : 'por_validar', req.user.id, validated ? req.user.id : null],
        );
        if (validated) await closeIfPaid(connection, cargo.id);
        await connection.commit();
        res.status(201).json({ message: validated ? 'Pago registrado.' : 'Pago informado: queda por validar.', id: result.insertId });
    } catch (error) {
        if (connection) await connection.rollback().catch(() => {});
        serverError('Error creating pago:', error, res);
    } finally {
        if (connection) connection.release();
    }
};

exports.validarPago = async (req, res) => {
    let connection;
    try {
        const [rows] = await req.db.execute(
            `SELECT p.id, p.monto, p.estado, p.cargo_id, c.monto AS cargo_monto, c.estado AS cargo_estado, ${VALIDATED} AS pagado
             FROM pagos p JOIN cargos c ON c.id = p.cargo_id WHERE p.id = ?`,
            [req.params.id],
        );
        if (!rows.length) return notFound(res, 'Pago no encontrado.');
        const pago = rows[0];
        if (pago.estado !== 'por_validar') return conflict(res, `El pago ya está ${pago.estado}.`);
        if (pago.cargo_estado !== 'pendiente') return conflict(res, `El cargo está ${pago.cargo_estado}: no queda saldo para este pago.`);
        if (pago.monto > pago.cargo_monto - Number(pago.pagado)) return conflict(res, 'El pago supera el saldo del cargo.');

        connection = await req.db.getConnection();
        await connection.beginTransaction();
        await connection.execute("UPDATE pagos SET estado = 'validado', validado_por = ?, fecha_validacion = CURRENT_TIMESTAMP WHERE id = ?", [req.user.id, pago.id]);
        await closeIfPaid(connection, pago.cargo_id);
        await connection.commit();
        res.json({ message: 'Pago validado.' });
    } catch (error) {
        if (connection) await connection.rollback().catch(() => {});
        serverError('Error validating pago:', error, res);
    } finally {
        if (connection) connection.release();
    }
};

exports.rechazarPago = async (req, res) => {
    try {
        const [rows] = await req.db.execute('SELECT id, estado FROM pagos WHERE id = ?', [req.params.id]);
        if (!rows.length) return notFound(res, 'Pago no encontrado.');
        if (rows[0].estado !== 'por_validar') return conflict(res, `El pago ya está ${rows[0].estado}.`);
        await req.db.execute("UPDATE pagos SET estado = 'rechazado', validado_por = ?, fecha_validacion = CURRENT_TIMESTAMP WHERE id = ?", [req.user.id, rows[0].id]);
        res.json({ message: 'Pago rechazado.' });
    } catch (error) {
        serverError('Error rejecting pago:', error, res);
    }
};

exports.getPagos = async (req, res) => {
    const { estado } = req.query;
    if (estado && !PAYMENT_STATES.includes(estado)) return bad(res, `estado debe ser uno de: ${PAYMENT_STATES.join(', ')}.`);
    try {
        const [rows] = await req.db.execute(
            `SELECT p.id, p.cargo_id, u.nombre AS alumno, c.concepto, p.monto, p.referencia, p.estado, p.fecha_creacion
             FROM pagos p JOIN cargos c ON c.id = p.cargo_id JOIN usuarios u ON u.id = c.alumno_id
             ${estado ? 'WHERE p.estado = ?' : ''} ORDER BY p.id`,
            estado ? [estado] : [],
        );
        res.json(rows);
    } catch (error) {
        serverError('Error fetching pagos:', error, res);
    }
};

// ---- Statements ----
exports.miCuenta = async (req, res) => {
    const alumnoId = req.query.alumno_id ? Number(req.query.alumno_id) : req.user.id;
    if (!Number.isInteger(alumnoId)) return bad(res, 'alumno_id no es válido.');
    try {
        if (!(await mayViewAccount(req, alumnoId))) return forbidden(res, 'No puedes ver la cuenta de esta persona.');
        const today = todayInChile();
        const [cargos] = await req.db.execute(
            `SELECT c.id, c.concepto, c.monto, c.periodo, c.fecha_emision, c.fecha_vencimiento, c.estado
             FROM cargos c WHERE c.alumno_id = ? AND c.estado <> 'anulado' ORDER BY c.fecha_vencimiento, c.id`,
            [alumnoId],
        );
        const [pagos] = cargos.length
            ? await req.db.execute(
                `SELECT id, cargo_id, monto, estado, referencia, fecha_creacion FROM pagos WHERE cargo_id IN (${cargos.map(() => '?').join(', ')}) ORDER BY id`,
                cargos.map((c) => c.id),
            )
            : [[]];

        const detail = cargos.map((cargo) => {
            const own = pagos.filter((p) => p.cargo_id === cargo.id);
            const pagado = own.filter((p) => p.estado === 'validado').reduce((sum, p) => sum + p.monto, 0);
            const saldo = cargo.monto - pagado;
            return { ...cargo, pagado, saldo, vencido: cargo.estado === 'pendiente' && saldo > 0 && cargo.fecha_vencimiento < today, pagos: own };
        });
        const cargado = detail.reduce((sum, c) => sum + c.monto, 0);
        const pagado = detail.reduce((sum, c) => sum + c.pagado, 0);
        res.json({ cargos: detail, resumen: { cargado, pagado, saldo: cargado - pagado, moroso: detail.some((c) => c.vencido) } });
    } catch (error) {
        serverError('Error fetching cuenta:', error, res);
    }
};

// Students with a pending charge past its due date. The grace period (days
// after the due date before a student counts as overdue) is still a decision of
// the direction, so it is a parameter and defaults to none.
exports.getMorosidad = async (req, res) => {
    const grace = req.query.dias_gracia === undefined ? 0 : Number(req.query.dias_gracia);
    if (!Number.isInteger(grace) || grace < 0) return bad(res, 'dias_gracia debe ser un número entero de días, 0 o más.');
    try {
        const today = todayInChile();
        const [rows] = await req.db.execute(
            `SELECT c.id, c.alumno_id, u.nombre AS alumno, u.email, c.monto, c.fecha_vencimiento, ${VALIDATED} AS pagado
             FROM cargos c JOIN usuarios u ON u.id = c.alumno_id
             WHERE c.estado = 'pendiente' AND c.fecha_vencimiento < ?`,
            [today],
        );
        const byStudent = new Map();
        for (const row of rows) {
            const saldo = row.monto - Number(row.pagado);
            const days = daysBetween(row.fecha_vencimiento, today);
            if (saldo <= 0 || days <= grace) continue;
            const entry = byStudent.get(row.alumno_id) ?? { alumno_id: row.alumno_id, alumno: row.alumno, email: row.email, saldo_vencido: 0, cargos_vencidos: 0, dias_max_atraso: 0 };
            entry.saldo_vencido += saldo;
            entry.cargos_vencidos += 1;
            entry.dias_max_atraso = Math.max(entry.dias_max_atraso, days);
            byStudent.set(row.alumno_id, entry);
        }
        res.json([...byStudent.values()].sort((a, b) => b.saldo_vencido - a.saldo_vencido));
    } catch (error) {
        serverError('Error fetching morosidad:', error, res);
    }
};
