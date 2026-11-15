// Fase 2, T7: grades with their requirements, who is eligible to take the next
// one, exams, nominations, results and the grade history of each student.
// The content of each grade (classes, months, techniques) comes from the
// instructor principal; nothing is preloaded.
const test = require('node:test');
const assert = require('node:assert/strict');
const { withApi } = require('./apiHarness');

const USERS = [
    ['Admin', 'admin@x.cl', ['Administrador']],
    ['Ines', 'ines@x.cl', ['Instructor']],
    ['Ana', 'ana@x.cl', ['Alumno']],
    ['Pepe', 'pepe@x.cl', ['Alumno']],
    ['Marta', 'marta@x.cl', ['Alumno']],
];
const BASE = '/api/intranet';

const DAY_MS = 24 * 60 * 60 * 1000;
const isoDate = (offsetDays) => new Date(Date.now() + offsetDays * DAY_MS).toISOString().slice(0, 10);

// Three grades of the first discipline: white (entry), yellow (3 classes, 2 months), green (10 classes, 4 months).
async function setup(fn) {
    await withApi(USERS, async (ctx) => {
        const { call, login, idOf } = ctx;
        const admin = await login('admin@x.cl');
        const disciplina = (await call('GET', `${BASE}/disciplinas`, admin)).body[0];
        const mk = async (orden, nombre, clases_minimas, meses_minimos) =>
            (await call('POST', `${BASE}/grados`, admin, { disciplina_id: disciplina.id, orden, nombre, clases_minimas, meses_minimos, tecnicas: `Técnicas de ${nombre}` })).body.id;
        const grados = { blanco: await mk(1, 'Blanco', 0, 0), amarillo: await mk(2, 'Amarillo', 3, 2), verde: await mk(3, 'Verde', 10, 4) };
        const ids = { ana: await idOf('ana@x.cl'), pepe: await idOf('pepe@x.cl'), marta: await idOf('marta@x.cl') };
        await fn({ ...ctx, admin, disciplina, grados, ids });
    });
}

// A clase of the discipline and `n` attended sessions on the given dates.
async function attend({ call, admin, knex, disciplina }, alumnoId, fechas) {
    const sede = (await call('GET', `${BASE}/sedes`, admin)).body[0];
    const clase = (await call('POST', `${BASE}/clases`, admin, { sede_id: sede.id, disciplina_id: disciplina.id, dia_semana: 1, hora_inicio: '19:00', hora_fin: '20:30' })).body;
    for (const fecha of fechas) {
        const [sesionId] = await knex('sesiones').insert({ clase_id: clase.id, fecha });
        await knex('asistencias').insert({ sesion_id: sesionId, alumno_id: alumnoId, presente: true });
    }
}

const place = (ctx, alumno_id, grado_id, fecha) => ctx.call('POST', `${BASE}/alumnos/${alumno_id}/grados`, ctx.admin, { grado_id, fecha });

test('administration defines grades with their requirements; everyone logged in can read them in order', async () => {
    await setup(async ({ call, login, admin, disciplina, grados }) => {
        const ana = await login('ana@x.cl');
        const list = (await call('GET', `${BASE}/grados?disciplina_id=${disciplina.id}`, ana)).body;
        assert.deepEqual(list.map((g) => [g.orden, g.nombre, g.clases_minimas, g.meses_minimos]), [[1, 'Blanco', 0, 0], [2, 'Amarillo', 3, 2], [3, 'Verde', 10, 4]]);
        assert.equal(list[1].tecnicas, 'Técnicas de Amarillo');
        assert.equal(grados.blanco, list[0].id);

        const base = { disciplina_id: disciplina.id, orden: 4, nombre: 'Café', clases_minimas: 20, meses_minimos: 6 };
        assert.equal((await call('POST', `${BASE}/grados`, ana, base)).status, 403);
        assert.equal((await call('POST', `${BASE}/grados`, admin, { ...base, orden: 3 })).status, 409, 'two grades cannot share a position');
        for (const bad of [{ nombre: ' ' }, { orden: 0 }, { clases_minimas: -1 }, { meses_minimos: 1.5 }, { disciplina_id: 999 }]) {
            assert.ok([400, 404].includes((await call('POST', `${BASE}/grados`, admin, { ...base, ...bad })).status), JSON.stringify(bad));
        }
        assert.equal((await call('POST', `${BASE}/grados`, admin, base)).status, 201);
    });
});

test('placing a student in a grade builds their history, newest placement is the current one', async () => {
    await setup(async (ctx) => {
        const { call, login, ids, grados } = ctx;
        assert.equal((await place(ctx, ids.ana, grados.blanco, isoDate(-300))).status, 201);
        assert.equal((await place(ctx, ids.ana, grados.amarillo, isoDate(-100))).status, 201);
        assert.equal((await place(ctx, 999, grados.blanco, isoDate(-1))).status, 404);
        assert.equal((await place(ctx, ids.ana, 999, isoDate(-1))).status, 404);
        assert.equal((await place(ctx, ids.ana, grados.verde, 'ayer')).status, 400);

        const progress = (await call('GET', `${BASE}/progreso/mio`, await login('ana@x.cl'))).body;
        assert.equal(progress.disciplinas[0].actual.nombre, 'Amarillo');
        assert.deepEqual(progress.historial.map((h) => h.grado), ['Blanco', 'Amarillo']);
    });
});

test('eligibility compares attended classes and months in the grade with the next grade requirements', async () => {
    await setup(async (ctx) => {
        const { call, login, ids, grados } = ctx;
        // Ana: yellow for ~3 months, 3 classes attended since -> ready for green? green needs 10 classes, so no.
        await place(ctx, ids.ana, grados.amarillo, isoDate(-100));
        await attend(ctx, ids.ana, [isoDate(-50), isoDate(-40), isoDate(-30)]);
        // Attendance before the grade date does not count.
        await attend(ctx, ids.ana, [isoDate(-200), isoDate(-190)]);
        const ana = (await call('GET', `${BASE}/progreso/mio`, await login('ana@x.cl'))).body.disciplinas[0];
        assert.equal(ana.siguiente.nombre, 'Verde');
        assert.deepEqual(ana.requisitos.clases, { minimas: 10, asistidas: 3, cumple: false });
        assert.deepEqual({ minimos: ana.requisitos.meses.minimos, cumple: ana.requisitos.meses.cumple }, { minimos: 4, cumple: false });
        assert.equal(ana.habilitado, false);

        // Pepe: white for a year, 12 classes: ready for yellow (3 classes, 2 months).
        await place(ctx, ids.pepe, grados.blanco, isoDate(-400));
        await attend(ctx, ids.pepe, Array.from({ length: 12 }, (_, i) => isoDate(-300 + i)));
        const pepe = (await call('GET', `${BASE}/progreso/mio`, await login('pepe@x.cl'))).body.disciplinas[0];
        assert.equal(pepe.siguiente.nombre, 'Amarillo');
        assert.equal(pepe.requisitos.clases.asistidas, 12);
        assert.ok(pepe.requisitos.meses.transcurridos >= 12);
        assert.equal(pepe.habilitado, true);
    });
});

test('enough classes but too little time in the grade is not eligible; the last grade has no next one', async () => {
    await setup(async (ctx) => {
        const { call, login, ids, grados } = ctx;
        await place(ctx, ids.ana, grados.blanco, isoDate(-15));
        await attend(ctx, ids.ana, [isoDate(-10), isoDate(-8), isoDate(-6)]);
        const early = (await call('GET', `${BASE}/progreso/mio`, await login('ana@x.cl'))).body.disciplinas[0];
        assert.equal(early.requisitos.clases.cumple, true);
        assert.equal(early.requisitos.meses.cumple, false);
        assert.equal(early.habilitado, false);

        await place(ctx, ids.pepe, grados.verde, isoDate(-500));
        const top = (await call('GET', `${BASE}/progreso/mio`, await login('pepe@x.cl'))).body.disciplinas[0];
        assert.equal(top.siguiente, null);
        assert.equal(top.habilitado, false);
    });
});

test('a student without a placed grade starts from the first one', async () => {
    await setup(async ({ call, login }) => {
        const marta = (await call('GET', `${BASE}/progreso/mio`, await login('marta@x.cl'))).body.disciplinas[0];
        assert.equal(marta.actual, null);
        assert.equal(marta.siguiente.nombre, 'Blanco');
        assert.equal(marta.habilitado, true, 'the first grade has no requirements');
    });
});

test('progress is visible to the student, their guardian, instructors and administration only', async () => {
    await setup(async ({ call, login, admin, ids }) => {
        const familia = (await call('POST', `${BASE}/familias`, admin, { nombre: 'F' })).body;
        await call('POST', `${BASE}/familias/${familia.id}/miembros`, admin, { usuario_id: ids.marta, rol_en_familia: 'apoderado' });
        await call('POST', `${BASE}/familias/${familia.id}/miembros`, admin, { usuario_id: ids.ana, rol_en_familia: 'alumno' });
        const url = `${BASE}/progreso/mio?alumno_id=${ids.ana}`;
        assert.equal((await call('GET', url, await login('marta@x.cl'))).status, 200, 'guardian');
        assert.equal((await call('GET', url, await login('ines@x.cl'))).status, 200, 'instructor');
        assert.equal((await call('GET', url, admin)).status, 200, 'admin');
        assert.equal((await call('GET', url, await login('pepe@x.cl'))).status, 403, 'stranger');
    });
});

async function readyForYellow(ctx) {
    const { ids, grados } = ctx;
    await place(ctx, ids.pepe, grados.blanco, isoDate(-400));
    await attend(ctx, ids.pepe, Array.from({ length: 5 }, (_, i) => isoDate(-300 + i)));
}
const exam = (ctx, overrides = {}) => ctx.call('POST', `${BASE}/examenes`, ctx.admin, { fecha: isoDate(7), nombre: 'Examen de diciembre', ...overrides });

test('an instructor nominates an eligible student; an ineligible one, a duplicate or a student cannot', async () => {
    await setup(async (ctx) => {
        const { call, login, ids, disciplina } = ctx;
        await readyForYellow(ctx);
        const { body: { id } } = await exam(ctx);
        const ines = await login('ines@x.cl');
        const url = `${BASE}/examenes/${id}/nominaciones`;

        assert.equal((await call('POST', url, await login('pepe@x.cl'), { alumno_id: ids.pepe, disciplina_id: disciplina.id })).status, 403, 'a student cannot nominate');
        // Ana reached white two weeks ago: she lacks the months and the classes for yellow.
        await place(ctx, ids.ana, ctx.grados.blanco, isoDate(-15));
        const notReady = await call('POST', url, ines, { alumno_id: ids.ana, disciplina_id: disciplina.id });
        assert.equal(notReady.status, 400);
        assert.match(notReady.body.error, /requisitos/);

        assert.equal((await call('POST', url, ines, { alumno_id: ids.pepe, disciplina_id: disciplina.id })).status, 201);
        assert.equal((await call('POST', url, ines, { alumno_id: ids.pepe, disciplina_id: disciplina.id })).status, 409);
        assert.equal((await call('POST', `${BASE}/examenes/999/nominaciones`, ines, { alumno_id: ids.pepe, disciplina_id: disciplina.id })).status, 404);

        const detail = (await call('GET', `${BASE}/examenes/${id}`, ctx.admin)).body;
        assert.deepEqual(detail.inscripciones.map((i) => [i.alumno, i.grado, i.estado]), [['Pepe', 'Amarillo', 'nominado']]);
    });
});

test('confirming a nomination charges the exam fee when the exam has one', async () => {
    await setup(async (ctx) => {
        const { call, login, ids, disciplina, admin } = ctx;
        await readyForYellow(ctx);
        const paid = (await exam(ctx, { monto_derecho: 15000 })).body.id;
        const free = (await exam(ctx, { nombre: 'Sin costo' })).body.id;
        const ines = await login('ines@x.cl');
        await call('POST', `${BASE}/examenes/${paid}/nominaciones`, ines, { alumno_id: ids.pepe, disciplina_id: disciplina.id });

        assert.equal((await call('PUT', `${BASE}/examenes/${paid}/nominaciones/${ids.pepe}/confirmar`, ines)).status, 403, 'an instructor nominates but does not approve');
        assert.equal((await call('PUT', `${BASE}/examenes/${paid}/nominaciones/${ids.pepe}/confirmar`, admin)).status, 200);
        assert.equal((await call('PUT', `${BASE}/examenes/${paid}/nominaciones/${ids.pepe}/confirmar`, admin)).status, 409, 'already confirmed');
        assert.equal((await call('PUT', `${BASE}/examenes/${paid}/nominaciones/${ids.ana}/confirmar`, admin)).status, 404);

        const account = (await call('GET', `${BASE}/cuenta/mia?alumno_id=${ids.pepe}`, admin)).body;
        assert.deepEqual(account.cargos.map((c) => [c.concepto, c.monto]), [['Derecho a examen: Amarillo', 15000]]);

        // The same student can be nominated to another exam; with no fee there is no charge.
        assert.equal((await call('POST', `${BASE}/examenes/${free}/nominaciones`, ines, { alumno_id: ids.pepe, disciplina_id: disciplina.id })).status, 201);
        await call('PUT', `${BASE}/examenes/${free}/nominaciones/${ids.pepe}/confirmar`, admin);
        assert.equal((await call('GET', `${BASE}/cuenta/mia?alumno_id=${ids.pepe}`, admin)).body.cargos.length, 1);
    });
});

test('results: only confirmed students, only once the exam date has come; passing records the new grade', async () => {
    await setup(async (ctx) => {
        const { call, login, ids, disciplina, admin } = ctx;
        await readyForYellow(ctx);
        const future = (await exam(ctx)).body.id;
        const ines = await login('ines@x.cl');
        await call('POST', `${BASE}/examenes/${future}/nominaciones`, ines, { alumno_id: ids.pepe, disciplina_id: disciplina.id });
        await call('PUT', `${BASE}/examenes/${future}/nominaciones/${ids.pepe}/confirmar`, admin);

        const early = await call('PUT', `${BASE}/examenes/${future}/resultados`, admin, { resultados: [{ alumno_id: ids.pepe, resultado: 'aprobado' }] });
        assert.equal(early.status, 400);
        assert.match(early.body.error, /fecha/);

        // The same flow for an exam that has already happened (dated yesterday).
        const past = (await exam(ctx, { fecha: isoDate(-1), nombre: 'Examen de ayer' })).body.id;
        await call('POST', `${BASE}/examenes/${past}/nominaciones`, ines, { alumno_id: ids.pepe, disciplina_id: disciplina.id });
        const unconfirmed = await call('PUT', `${BASE}/examenes/${past}/resultados`, admin, { resultados: [{ alumno_id: ids.pepe, resultado: 'aprobado' }] });
        assert.equal(unconfirmed.status, 400, 'not confirmed yet');
        await call('PUT', `${BASE}/examenes/${past}/nominaciones/${ids.pepe}/confirmar`, admin);

        assert.equal((await call('PUT', `${BASE}/examenes/${past}/resultados`, admin, { resultados: [{ alumno_id: ids.pepe, resultado: 'quizas' }] })).status, 400);
        assert.equal((await call('PUT', `${BASE}/examenes/${past}/resultados`, await login('pepe@x.cl'), { resultados: [] })).status, 403);
        const saved = await call('PUT', `${BASE}/examenes/${past}/resultados`, admin, { resultados: [{ alumno_id: ids.pepe, resultado: 'aprobado' }] });
        assert.equal(saved.status, 200);

        const progress = (await call('GET', `${BASE}/progreso/mio`, await login('pepe@x.cl'))).body;
        assert.equal(progress.disciplinas[0].actual.nombre, 'Amarillo');
        assert.deepEqual(progress.historial.map((h) => h.grado), ['Blanco', 'Amarillo']);
        assert.equal(progress.historial[1].fecha, isoDate(-1), 'the grade is dated on the exam day');
        assert.equal((await call('GET', `${BASE}/examenes/${past}`, admin)).body.estado, 'realizado');
        // Recording the result twice is refused: the student was already graded.
        assert.equal((await call('PUT', `${BASE}/examenes/${past}/resultados`, admin, { resultados: [{ alumno_id: ids.pepe, resultado: 'reprobado' }] })).status, 400);
    });
});

test('a failed or absent student keeps their grade and can be nominated again later', async () => {
    await setup(async (ctx) => {
        const { call, login, ids, disciplina, admin } = ctx;
        await readyForYellow(ctx);
        const past = (await exam(ctx, { fecha: isoDate(-1) })).body.id;
        const ines = await login('ines@x.cl');
        await call('POST', `${BASE}/examenes/${past}/nominaciones`, ines, { alumno_id: ids.pepe, disciplina_id: disciplina.id });
        await call('PUT', `${BASE}/examenes/${past}/nominaciones/${ids.pepe}/confirmar`, admin);
        await call('PUT', `${BASE}/examenes/${past}/resultados`, admin, { resultados: [{ alumno_id: ids.pepe, resultado: 'reprobado' }] });

        const progress = (await call('GET', `${BASE}/progreso/mio`, await login('pepe@x.cl'))).body;
        assert.equal(progress.disciplinas[0].actual.nombre, 'Blanco');
        assert.equal(progress.disciplinas[0].habilitado, true);
        const next = (await exam(ctx, { nombre: 'Otro examen' })).body.id;
        assert.equal((await call('POST', `${BASE}/examenes/${next}/nominaciones`, ines, { alumno_id: ids.pepe, disciplina_id: disciplina.id })).status, 201);
    });
});

test('exams validate their data and are listed with their nominations count', async () => {
    await setup(async (ctx) => {
        const { call, login, admin, ids, disciplina } = ctx;
        assert.equal((await exam(ctx, { fecha: 'pronto' })).status, 400);
        assert.equal((await exam(ctx, { monto_derecho: -5 })).status, 400);
        assert.equal((await exam(ctx, { sede_id: 999 })).status, 404);
        assert.equal((await call('POST', `${BASE}/examenes`, await login('ines@x.cl'), { fecha: isoDate(5) })).status, 403, 'only administration schedules exams');

        await readyForYellow(ctx);
        const { body: { id } } = await exam(ctx);
        await call('POST', `${BASE}/examenes/${id}/nominaciones`, await login('ines@x.cl'), { alumno_id: ids.pepe, disciplina_id: disciplina.id });
        const list = (await call('GET', `${BASE}/examenes`, await login('ines@x.cl'))).body;
        assert.deepEqual(list.map((e) => [e.nombre, e.estado, e.nominados]), [['Examen de diciembre', 'programado', 1]]);
        assert.equal((await call('GET', `${BASE}/examenes`, await login('ana@x.cl'))).status, 403);
        assert.equal((await call('GET', `${BASE}/examenes/999`, admin)).status, 404);
    });
});

test('a cancelled exam takes no nominations', async () => {
    await setup(async (ctx) => {
        const { call, login, ids, disciplina, admin } = ctx;
        await readyForYellow(ctx);
        const { body: { id } } = await exam(ctx);
        assert.equal((await call('PUT', `${BASE}/examenes/${id}`, admin, { estado: 'cancelado' })).status, 200);
        assert.equal((await call('PUT', `${BASE}/examenes/${id}`, admin, { estado: 'raro' })).status, 400);
        assert.equal((await call('PUT', `${BASE}/examenes/999`, admin, { estado: 'cancelado' })).status, 404);
        const res = await call('POST', `${BASE}/examenes/${id}/nominaciones`, await login('ines@x.cl'), { alumno_id: ids.pepe, disciplina_id: disciplina.id });
        assert.equal(res.status, 409);
    });
});

test('instructors and administration list the students eligible for their next grade', async () => {
    await setup(async (ctx) => {
        const { call, login, ids, grados } = ctx;
        await readyForYellow(ctx); // Pepe: eligible for yellow
        await place(ctx, ids.ana, grados.blanco, isoDate(-15)); // Ana: not yet
        // Marta has no grade placed: she is eligible for the first one.
        const list = (await call('GET', `${BASE}/habilitados`, await login('ines@x.cl'))).body;
        assert.deepEqual(list.map((h) => [h.alumno, h.actual?.nombre ?? null, h.siguiente.nombre]).sort(), [['Marta', null, 'Blanco'], ['Pepe', 'Blanco', 'Amarillo']]);
        assert.equal((await call('GET', `${BASE}/habilitados`, await login('ana@x.cl'))).status, 403);
    });
});
