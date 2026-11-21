// Fase 3: seminars by day, online courses and their purchases.
// Public: the catalog, buying, reporting the transfer and reading a purchase
// (with the course videos once it is paid). Administration: the catalog and
// the purchases to validate or cancel.

const { isClosed, priceOf, newCode, reservationMessage } = require('../src/ventas');

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE = /^[+\d][\d\s()-]{5,24}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const HOUR = /^([01]\d|2[0-3]):[0-5]\d$/;
const ORIGINS = ['sitio', 'instagram', 'whatsapp'];
const ESTADOS_OFERTA = ['borrador', 'publicado', 'cerrado'];
const ESTADOS_COMPRA = ['pendiente', 'pagada', 'anulada'];
const MAX_ITEMS = 20;
const MAX_TICKETS = 10; // tickets per day in one purchase

const bad = (res, message) => res.status(400).json({ error: message });
const notFound = (res, message) => res.status(404).json({ error: message });
const conflict = (res, message) => res.status(409).json({ error: message });
const serverError = (label, error, res) => {
    console.error(label, error);
    res.status(500).json({ error: 'Error del servidor.' });
};

const text = (value) => (typeof value === 'string' ? value.trim() : '');
const isPesos = (value) => Number.isInteger(value) && value > 0;
const isId = (value) => Number.isInteger(value) && value > 0;
const placeholders = (list) => list.map(() => '?').join(', ');

// What a person may see of a day: never how many tickets each buyer took.
const publicDay = (dia, now) => ({
    id: dia.id,
    fecha: dia.fecha,
    hora_inicio: dia.hora_inicio,
    hora_fin: dia.hora_fin,
    precio: dia.precio,
    cupo_disponible: Math.max(0, dia.cupo - dia.vendidos),
    cerrado: isClosed(dia, now),
});

// The published catalog: seminars with their days and courses with their
// lessons (titles only; the videos are for people who paid).
async function loadCatalog(db, now = new Date()) {
    const [seminarios] = await db.execute(
        "SELECT id, titulo, descripcion, sede, imagen, video_url, precio_pack, oferta FROM seminarios WHERE estado = 'publicado' ORDER BY id",
    );
    const [dias] = seminarios.length
        ? await db.execute(
            `SELECT id, seminario_id, fecha, hora_inicio, hora_fin, precio, cupo, vendidos FROM seminario_dias
             WHERE seminario_id IN (${placeholders(seminarios)}) ORDER BY fecha, hora_inicio, id`,
            seminarios.map((s) => s.id),
        )
        : [[]];
    const [cursos] = await db.execute("SELECT id, titulo, descripcion, imagen, precio FROM cursos WHERE estado = 'publicado' ORDER BY id");
    const [lecciones] = cursos.length
        ? await db.execute(
            `SELECT curso_id, orden, titulo, duracion FROM curso_lecciones WHERE curso_id IN (${placeholders(cursos)}) ORDER BY orden, id`,
            cursos.map((c) => c.id),
        )
        : [[]];

    return {
        seminarios: seminarios.map((s) => ({
            ...s,
            dias: dias.filter((d) => d.seminario_id === s.id).map((d) => publicDay(d, now)),
        })),
        cursos: cursos.map((c) => ({
            ...c,
            lecciones: lecciones.filter((l) => l.curso_id === c.id).map(({ orden, titulo, duracion }) => ({ orden, titulo, duracion })),
        })),
    };
}
exports.loadCatalog = loadCatalog;

const publicPago = (pago = {}) => ({
    banco: pago.banco || null,
    tipo_cuenta: pago.tipoCuenta || null,
    numero_cuenta: pago.numeroCuenta || null,
    titular: pago.titular || null,
    rut: pago.rut || null,
    email: pago.email || null,
    comprobante_a: pago.comprobanteA || null,
});

exports.getOfertas = async (req, res) => {
    try {
        res.json({ ...(await loadCatalog(req.db)), pago: publicPago(req.app.locals.config.pago) });
    } catch (error) {
        serverError('Error fetching ofertas:', error, res);
    }
};

// items: [{ seminario_dia_id, cantidad }] or [{ curso_id }]. The same day or
// course twice is added up. Returns { days: Map, courses: Set } or an error text.
function readItems(items) {
    if (!Array.isArray(items) || items.length < 1 || items.length > MAX_ITEMS) {
        return `Elige entre 1 y ${MAX_ITEMS} productos (items).`;
    }
    const days = new Map();
    const courses = new Set();
    for (const item of items) {
        if (item?.seminario_dia_id !== undefined) {
            const cantidad = item.cantidad ?? 1;
            if (!isId(item.seminario_dia_id)) return 'seminario_dia_id debe ser un número entero.';
            if (!Number.isInteger(cantidad) || cantidad < 1) return 'cantidad debe ser un número entero mayor que 0.';
            days.set(item.seminario_dia_id, (days.get(item.seminario_dia_id) ?? 0) + cantidad);
            if (days.get(item.seminario_dia_id) > MAX_TICKETS) return `Puedes comprar hasta ${MAX_TICKETS} entradas por día en una compra.`;
        } else if (item?.curso_id !== undefined) {
            if (!isId(item.curso_id)) return 'curso_id debe ser un número entero.';
            courses.add(item.curso_id);
        } else {
            return 'Cada producto debe indicar seminario_dia_id o curso_id.';
        }
    }
    return { days, courses };
}

const weekday = new Intl.DateTimeFormat('es-CL', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
const dayLabel = (fecha) => weekday.format(new Date(`${fecha}T12:00:00Z`)).replace(',', '');
const listOf = (parts) => (parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} y ${parts.at(-1)}`);

// What the purchase pays for, in words, with the days of each seminar together:
// "Seminario X (viernes 4 de diciembre y sábado 5 de diciembre) y Curso Y".
function conceptOf(lines) {
    const parts = [];
    const seminars = new Map();
    for (const line of lines) {
        if (line.tipo !== 'seminario_dia') {
            parts.push(line.descripcion);
            continue;
        }
        if (!seminars.has(line.titulo)) {
            seminars.set(line.titulo, []);
            parts.push(seminars.get(line.titulo));
        }
        seminars.get(line.titulo).push(line);
    }
    return listOf(parts.map((part) => {
        if (typeof part === 'string') return part;
        const people = Math.max(...part.map((line) => line.cantidad));
        return `${part[0].titulo} (${listOf(part.map((line) => dayLabel(line.fecha)))})${people > 1 ? ` para ${people} personas` : ''}`;
    }));
}

// Shared by the site and the assistant: `origen` is the channel the person bought from.
async function createPurchase(db, config, body, now = new Date()) {
    const nombre = text(body.nombre);
    const email = text(body.email).toLowerCase();
    const telefono = text(body.telefono);
    const origen = body.origen ?? 'sitio';

    if (body.consentimiento !== true) return { status: 400, error: 'Debes aceptar que guardemos tus datos para gestionar tu compra (consentimiento).' };
    if (nombre.length < 2 || nombre.length > 100) return { status: 400, error: 'Indica tu nombre completo, entre 2 y 100 caracteres (nombre).' };
    if (!EMAIL.test(email) || email.length > 255) return { status: 400, error: 'Ingresa un correo válido (email).' };
    if (telefono && !PHONE.test(telefono)) return { status: 400, error: 'Ingresa un teléfono válido (telefono).' };
    if (!ORIGINS.includes(origen)) return { status: 400, error: `El origen no es válido (origen). Opciones: ${ORIGINS.join(', ')}.` };
    const items = readItems(body.items);
    if (typeof items === 'string') return { status: 400, error: items };

    const dayIds = [...items.days.keys()];
    const courseIds = [...items.courses];
    let connection;
    try {
        connection = await db.getConnection();
        await connection.beginTransaction();

        const [dias] = dayIds.length
            ? await connection.execute(
                `SELECT d.id, d.seminario_id, d.fecha, d.hora_inicio, d.precio, d.cupo, d.vendidos, s.titulo, s.precio_pack
                 FROM seminario_dias d JOIN seminarios s ON s.id = d.seminario_id
                 WHERE d.id IN (${placeholders(dayIds)}) AND s.estado = 'publicado'
                 ORDER BY d.fecha, d.hora_inicio, d.id`,
                dayIds,
            )
            : [[]];
        const [cursos] = courseIds.length
            ? await connection.execute(`SELECT id, titulo, precio FROM cursos WHERE id IN (${placeholders(courseIds)}) AND estado = 'publicado'`, courseIds)
            : [[]];
        const fail = async (status, error) => {
            await connection.rollback();
            return { status, error };
        };
        if (dias.length !== dayIds.length || cursos.length !== courseIds.length) return fail(400, 'Uno de los productos no existe o ya no está a la venta.');

        const lines = [];
        for (const dia of dias) {
            if (isClosed(dia, now)) return fail(409, `Las inscripciones para el ${dayLabel(dia.fecha)} ya cerraron.`);
            const cantidad = items.days.get(dia.id);
            // One guarded UPDATE takes the seats: it only succeeds while there is room.
            const [taken] = await connection.execute(
                'UPDATE seminario_dias SET vendidos = vendidos + ? WHERE id = ? AND vendidos + ? <= cupo',
                [cantidad, dia.id, cantidad],
            );
            if (taken.affectedRows === 0) {
                const left = Math.max(0, dia.cupo - dia.vendidos);
                return fail(409, `No quedan cupos suficientes para el ${dayLabel(dia.fecha)}: quedan ${left}.`);
            }
            lines.push({
                tipo: 'seminario_dia', seminario_id: dia.seminario_id, seminario_dia_id: dia.id, curso_id: null,
                descripcion: `${dia.titulo} (${dayLabel(dia.fecha)})`, cantidad, precio_unitario: dia.precio, titulo: dia.titulo, fecha: dia.fecha,
            });
        }
        for (const curso of cursos) {
            lines.push({ tipo: 'curso', seminario_dia_id: null, curso_id: curso.id, descripcion: curso.titulo, cantidad: 1, precio_unitario: curso.precio });
        }

        // The pack price needs every day of the seminar, so read them all.
        const seminarIds = [...new Set(dias.filter((d) => d.precio_pack).map((d) => d.seminario_id))];
        const seminars = {};
        if (seminarIds.length) {
            const [all] = await connection.execute(`SELECT id, seminario_id FROM seminario_dias WHERE seminario_id IN (${placeholders(seminarIds)})`, seminarIds);
            for (const id of seminarIds) {
                seminars[id] = { precio_pack: dias.find((d) => d.seminario_id === id).precio_pack, dias: all.filter((d) => d.seminario_id === id).map((d) => d.id) };
            }
        }
        const { subtotal, descuento, total } = priceOf(lines, seminars);

        const codigo = newCode();
        const [created] = await connection.execute(
            `INSERT INTO compras (codigo, nombre, email, telefono, origen, consentimiento, consentimiento_fecha, subtotal, descuento, total)
             VALUES (?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP, ?, ?, ?)`,
            [codigo, nombre, email, telefono || null, origen, subtotal, descuento, total],
        );
        for (const line of lines) {
            await connection.execute(
                'INSERT INTO compra_items (compra_id, tipo, seminario_dia_id, curso_id, descripcion, cantidad, precio_unitario) VALUES (?, ?, ?, ?, ?, ?, ?)',
                [created.insertId, line.tipo, line.seminario_dia_id, line.curso_id, line.descripcion, line.cantidad, line.precio_unitario],
            );
        }
        await connection.commit();

        const concepto = conceptOf(lines);
        return {
            status: 201,
            body: {
                codigo,
                estado: 'pendiente',
                subtotal,
                descuento,
                total,
                items: lines.map(({ descripcion, cantidad, precio_unitario: precio }) => ({ descripcion, cantidad, precio })),
                mensaje: reservationMessage({ codigo, total, concepto, canal: origen, pago: config.pago }),
                pago: publicPago(config.pago),
            },
        };
    } catch (error) {
        if (connection) await connection.rollback().catch(() => {});
        throw error;
    } finally {
        if (connection) connection.release();
    }
}
exports.createPurchase = createPurchase;

exports.crearCompra = async (req, res) => {
    const body = req.body ?? {};
    // A hidden field that people leave empty and bots fill in.
    if (body.website) return res.status(201).json({ message: 'Solicitud recibida.' });
    try {
        const result = await createPurchase(req.db, req.app.locals.config, body);
        if (result.error) return res.status(result.status).json({ error: result.error });
        res.status(201).json(result.body);
    } catch (error) {
        serverError('Error creating compra:', error, res);
    }
};

// The buyer is identified by the code and the email together.
async function findOwnPurchase(db, codigo, email) {
    const [rows] = await db.execute(
        'SELECT id, codigo, nombre, estado, subtotal, descuento, total, referencia_pago, fecha_creacion FROM compras WHERE codigo = ? AND email = ?',
        [text(codigo).toUpperCase(), text(email).toLowerCase()],
    );
    return rows[0] ?? null;
}

exports.getCompra = async (req, res) => {
    try {
        const compra = await findOwnPurchase(req.db, req.params.codigo, req.query.email);
        if (!compra) return notFound(res, 'No encontramos una compra con ese código y correo.');
        const [items] = await req.db.execute('SELECT tipo, curso_id, descripcion, cantidad, precio_unitario AS precio FROM compra_items WHERE compra_id = ?', [compra.id]);

        // The videos of a course, only once the purchase is paid.
        const courseIds = items.filter((i) => i.tipo === 'curso').map((i) => i.curso_id);
        let cursos = [];
        if (compra.estado === 'pagada' && courseIds.length) {
            const [lecciones] = await req.db.execute(
                `SELECT curso_id, orden, titulo, duracion, video_url, descargable FROM curso_lecciones
                 WHERE curso_id IN (${placeholders(courseIds)}) ORDER BY orden, id`,
                courseIds,
            );
            cursos = courseIds.map((id) => ({
                curso_id: id,
                titulo: items.find((i) => i.curso_id === id).descripcion,
                lecciones: lecciones.filter((l) => l.curso_id === id).map(({ curso_id: _, descargable, ...l }) => ({ ...l, descargable: Boolean(descargable) })),
            }));
        }
        const { id: _, ...visible } = compra;
        res.json({ ...visible, items: items.map(({ curso_id: __, tipo, ...i }) => i), cursos });
    } catch (error) {
        serverError('Error fetching compra:', error, res);
    }
};

exports.informarPago = async (req, res) => {
    const referencia = text(req.body?.referencia);
    if (!referencia || referencia.length > 255) return bad(res, 'Cuéntanos cómo identificar tu transferencia, hasta 255 caracteres (referencia).');
    try {
        const compra = await findOwnPurchase(req.db, req.params.codigo, req.body?.email);
        if (!compra) return notFound(res, 'No encontramos una compra con ese código y correo.');
        if (compra.estado !== 'pendiente') return conflict(res, `Esta compra ya está ${compra.estado}.`);
        await req.db.execute('UPDATE compras SET referencia_pago = ?, fecha_informe = CURRENT_TIMESTAMP WHERE id = ?', [referencia, compra.id]);
        res.json({ message: 'Recibimos tu aviso. Validaremos la transferencia y te confirmaremos la inscripción.' });
    } catch (error) {
        serverError('Error reporting payment:', error, res);
    }
};

// ---- Administration: purchases ----
exports.getCompras = async (req, res) => {
    const { estado } = req.query;
    if (estado && !ESTADOS_COMPRA.includes(estado)) return bad(res, `estado no es válido. Opciones: ${ESTADOS_COMPRA.join(', ')}.`);
    try {
        const [compras] = await req.db.execute(
            `SELECT id, codigo, nombre, email, telefono, origen, subtotal, descuento, total, estado, referencia_pago, fecha_informe, fecha_creacion, fecha_validacion
             FROM compras ${estado ? 'WHERE estado = ?' : ''} ORDER BY fecha_creacion DESC, id DESC LIMIT 200`,
            estado ? [estado] : [],
        );
        const [items] = compras.length
            ? await req.db.execute(
                `SELECT compra_id, descripcion, cantidad, precio_unitario AS precio FROM compra_items WHERE compra_id IN (${placeholders(compras)}) ORDER BY id`,
                compras.map((c) => c.id),
            )
            : [[]];
        res.json(compras.map((c) => ({ ...c, items: items.filter((i) => i.compra_id === c.id).map(({ compra_id: _, ...i }) => i) })));
    } catch (error) {
        serverError('Error fetching compras:', error, res);
    }
};

exports.validarCompra = async (req, res) => {
    try {
        const [result] = await req.db.execute(
            "UPDATE compras SET estado = 'pagada', validado_por = ?, fecha_validacion = CURRENT_TIMESTAMP WHERE id = ? AND estado = 'pendiente'",
            [req.user.id, req.params.id],
        );
        if (result.affectedRows === 0) return conflict(res, 'Solo se puede validar una compra pendiente.');
        res.json({ message: 'Pago validado. La compra quedó pagada.' });
    } catch (error) {
        serverError('Error validating compra:', error, res);
    }
};

// Cancelling gives the seats back.
exports.anularCompra = async (req, res) => {
    let connection;
    try {
        connection = await req.db.getConnection();
        await connection.beginTransaction();
        const [result] = await connection.execute("UPDATE compras SET estado = 'anulada' WHERE id = ? AND estado <> 'anulada'", [req.params.id]);
        if (result.affectedRows === 0) {
            await connection.rollback();
            return conflict(res, 'La compra no existe o ya está anulada.');
        }
        const [items] = await connection.execute("SELECT seminario_dia_id, cantidad FROM compra_items WHERE compra_id = ? AND tipo = 'seminario_dia'", [req.params.id]);
        for (const item of items) {
            await connection.execute('UPDATE seminario_dias SET vendidos = vendidos - ? WHERE id = ? AND vendidos >= ?', [item.cantidad, item.seminario_dia_id, item.cantidad]);
        }
        await connection.commit();
        res.json({ message: 'Compra anulada. Los cupos quedaron libres.' });
    } catch (error) {
        if (connection) await connection.rollback().catch(() => {});
        serverError('Error cancelling compra:', error, res);
    } finally {
        if (connection) connection.release();
    }
};

// ---- Administration: the catalog ----
exports.getCatalogoAdmin = async (req, res) => {
    try {
        const [seminarios] = await req.db.execute('SELECT * FROM seminarios ORDER BY id DESC');
        const [dias] = await req.db.execute('SELECT * FROM seminario_dias ORDER BY fecha, hora_inicio, id');
        const [cursos] = await req.db.execute('SELECT * FROM cursos ORDER BY id DESC');
        const [lecciones] = await req.db.execute('SELECT * FROM curso_lecciones ORDER BY orden, id');
        res.json({
            seminarios: seminarios.map((s) => ({ ...s, dias: dias.filter((d) => d.seminario_id === s.id) })),
            cursos: cursos.map((c) => ({ ...c, lecciones: lecciones.filter((l) => l.curso_id === c.id).map((l) => ({ ...l, descargable: Boolean(l.descargable) })) })),
        });
    } catch (error) {
        serverError('Error fetching the sales catalog:', error, res);
    }
};

// Optional text fields: undefined keeps the value, '' or null clears it.
function optionalText(body, name, max, out) {
    if (body[name] === undefined) return null;
    if (body[name] !== null && typeof body[name] !== 'string') return `${name} debe ser texto.`;
    const value = text(body[name]);
    if (value.length > max) return `${name} admite hasta ${max} caracteres.`;
    out[name] = value || null;
    return null;
}

function readOffer(body, { creating, priceField }) {
    const out = {};
    if (creating || body.titulo !== undefined) {
        const titulo = text(body.titulo);
        if (titulo.length < 3 || titulo.length > 150) return { error: 'El título debe tener entre 3 y 150 caracteres (titulo).' };
        out.titulo = titulo;
    }
    for (const [name, max] of [['descripcion', 5000], ['imagen', 255], ...(priceField === 'precio_pack' ? [['sede', 150], ['video_url', 255], ['oferta', 255]] : [])]) {
        const error = optionalText(body, name, max, out);
        if (error) return { error };
    }
    if (out.imagen && /^(javascript|data):/i.test(out.imagen)) return { error: 'imagen debe ser un archivo o una dirección https.' };
    if (body[priceField] !== undefined) {
        const value = body[priceField];
        if (priceField === 'precio_pack' ? value !== null && !isPesos(value) : !isPesos(value)) {
            return { error: `${priceField} debe ser un número entero de pesos, sin decimales.` };
        }
        out[priceField] = value;
    } else if (creating && priceField === 'precio') {
        return { error: 'precio debe ser un número entero de pesos, sin decimales.' };
    }
    if (body.estado !== undefined) {
        if (!ESTADOS_OFERTA.includes(body.estado)) return { error: `estado no es válido. Opciones: ${ESTADOS_OFERTA.join(', ')}.` };
        out.estado = body.estado;
    }
    return { out };
}

async function insertRow(db, table, values) {
    const keys = Object.keys(values);
    const [result] = await db.execute(`INSERT INTO ${table} (${keys.join(', ')}) VALUES (${placeholders(keys)})`, keys.map((k) => values[k]));
    return result.insertId;
}

async function updateRow(db, table, id, values) {
    const keys = Object.keys(values);
    if (!keys.length) return true;
    const [result] = await db.execute(`UPDATE ${table} SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`, [...keys.map((k) => values[k]), id]);
    return result.affectedRows > 0;
}

const saveOffer = (table, priceField) => async (req, res) => {
    const creating = req.method === 'POST';
    const { out, error } = readOffer(req.body ?? {}, { creating, priceField });
    if (error) return bad(res, error);
    try {
        if (creating) return res.status(201).json({ message: 'Creado.', id: await insertRow(req.db, table, out) });
        if (!(await updateRow(req.db, table, req.params.id, out))) return notFound(res, 'No encontrado.');
        res.json({ message: 'Guardado.' });
    } catch (failure) {
        serverError(`Error saving ${table}:`, failure, res);
    }
};
exports.saveSeminario = saveOffer('seminarios', 'precio_pack');
exports.saveCurso = saveOffer('cursos', 'precio');

exports.addDia = async (req, res) => {
    const { fecha, hora_inicio: inicio = null, hora_fin: fin = null, precio, cupo } = req.body ?? {};
    if (typeof fecha !== 'string' || !DATE.test(fecha)) return bad(res, 'fecha debe tener el formato AAAA-MM-DD.');
    if ((inicio !== null && !HOUR.test(inicio)) || (fin !== null && !HOUR.test(fin))) return bad(res, 'Las horas deben tener el formato HH:MM (hora_inicio, hora_fin).');
    if (inicio && fin && fin <= inicio) return bad(res, 'hora_fin debe ser posterior a hora_inicio.');
    if (!isPesos(precio)) return bad(res, 'precio debe ser un número entero de pesos, sin decimales.');
    if (!Number.isInteger(cupo) || cupo < 1) return bad(res, 'cupo debe ser un número entero mayor que 0.');
    try {
        const [seminar] = await req.db.execute('SELECT id FROM seminarios WHERE id = ?', [req.params.id]);
        if (!seminar.length) return notFound(res, 'Seminario no encontrado.');
        const id = await insertRow(req.db, 'seminario_dias', { seminario_id: seminar[0].id, fecha, hora_inicio: inicio, hora_fin: fin, precio, cupo });
        res.status(201).json({ message: 'Día agregado.', id });
    } catch (error) {
        serverError('Error adding seminario dia:', error, res);
    }
};

exports.addLeccion = async (req, res) => {
    const titulo = text(req.body?.titulo);
    const { orden, duracion = null, video_url: videoUrl = null, descargable = true } = req.body ?? {};
    if (titulo.length < 2 || titulo.length > 150) return bad(res, 'El título debe tener entre 2 y 150 caracteres (titulo).');
    if (!Number.isInteger(orden) || orden < 1) return bad(res, 'orden debe ser un número entero mayor que 0.');
    if (duracion !== null && (typeof duracion !== 'string' || duracion.length > 20)) return bad(res, 'duracion admite hasta 20 caracteres.');
    if (videoUrl !== null && (typeof videoUrl !== 'string' || !/^https:\/\//.test(videoUrl) || videoUrl.length > 500)) return bad(res, 'video_url debe ser una dirección https.');
    try {
        const [course] = await req.db.execute('SELECT id FROM cursos WHERE id = ?', [req.params.id]);
        if (!course.length) return notFound(res, 'Curso no encontrado.');
        const id = await insertRow(req.db, 'curso_lecciones', { curso_id: course[0].id, orden, titulo, duracion, video_url: videoUrl, descargable: descargable ? 1 : 0 });
        res.status(201).json({ message: 'Lección agregada.', id });
    } catch (error) {
        serverError('Error adding leccion:', error, res);
    }
};
