// Grades and exams on the Shaolin Temple Duan Pin system: each level has its
// content (defined by the head instructor), a minimum age, and an exam in three
// parts (conduct, theory, technique) plus combat for Pin, recorded with its jury.
const test = require('node:test');
const assert = require('node:assert/strict');
const { withApi } = require('./apiHarness');

const USERS = [
    ['Admin', 'admin@x.cl', ['Administrador']],
    ['Ines', 'ines@x.cl', ['Instructor']],
    ['Ana', 'ana@x.cl', ['Alumno']],
];
const BASE = '/api/intranet';
const DAY_MS = 24 * 60 * 60 * 1000;
const isoDate = (offsetDays) => new Date(Date.now() + offsetDays * DAY_MS).toISOString().slice(0, 10);
const yearsAgo = (years) => isoDate(-Math.round(years * 365.25));
const PASS = { conducta_ok: true, nota_tecnica: 8.5, evaluadores: 'Shifu Ines, Shifu Marco' };

async function setup(fn) {
    await withApi(USERS, async (ctx) => {
        const admin = await ctx.login('admin@x.cl');
        const disciplina = (await ctx.call('GET', `${BASE}/disciplinas`, admin)).body[0];
        const ana = await ctx.idOf('ana@x.cl');
        await fn({ ...ctx, admin, disciplina, ana });
    });
}

const grade = (ctx, body) => ctx.call('POST', `${BASE}/grados`, ctx.admin, { disciplina_id: ctx.disciplina.id, ...body });

test('a grade keeps its Duan Pin place, minimum age and content, and the head instructor edits the content', async () => {
    await setup(async (ctx) => {
        const { call, login, admin, disciplina } = ctx;
        const created = await grade(ctx, {
            orden: 1, nombre: '1.º Duan', serie: 'duan', nivel: 1, etapa: 'inicial', edad_minima: 7,
            formas: 'Shi San Quan', tecnicas: 'Golpes', requiere_teoria: false,
        });
        assert.equal(created.status, 201);
        const edit = await call('PUT', `${BASE}/grados/${created.body.id}`, admin, {
            formas: 'Shi San Quan; Lian Huan Quan', tecnicas: 'Golpes y posturas', clases_minimas: 24, meses_minimos: 3, edad_minima: 8, requiere_teoria: true,
        });
        assert.equal(edit.status, 200);
        const [g] = (await call('GET', `${BASE}/grados?disciplina_id=${disciplina.id}`, admin)).body;
        assert.deepEqual(
            [g.serie, g.nivel, g.etapa, g.grado_pin, g.edad_minima, g.formas, g.tecnicas, g.clases_minimas, g.meses_minimos, g.requiere_teoria, g.requiere_combate],
            ['duan', 1, 'inicial', null, 8, 'Shi San Quan; Lian Huan Quan', 'Golpes y posturas', 24, 3, true, false],
        );

        assert.equal((await call('PUT', `${BASE}/grados/${g.id}`, await login('ines@x.cl'), { formas: 'x' })).status, 403);
        assert.equal((await call('PUT', `${BASE}/grados/99999`, admin, { formas: 'x' })).status, 404);
        for (const [body, error] of [
            [{ edad_minima: -1 }, 'edad_minima debe ser un número entero, 0 o más.'],
            [{ requiere_teoria: 'si' }, 'requiere_teoria debe ser true o false.'],
            [{ nombre: ' ' }, 'El nombre del grado es obligatorio (nombre).'],
            [{ formas: 'x'.repeat(5001) }, 'formas admite hasta 5000 caracteres.'],
            [{}, 'No hay nada que actualizar.'],
        ]) {
            const res = await call('PUT', `${BASE}/grados/${g.id}`, admin, body);
            assert.deepEqual([res.status, res.body.error], [400, error], JSON.stringify(body));
        }
        const badSerie = await grade(ctx, { orden: 2, nombre: 'X', serie: 'cinturon' });
        assert.deepEqual([badSerie.status, badSerie.body.error], [400, 'serie debe ser duan o pin.']);
    });
});

test('a student is eligible only from the minimum age of the next level, which needs a date of birth', async () => {
    await setup(async (ctx) => {
        const { call, admin, knex, ana } = ctx;
        await grade(ctx, { orden: 1, nombre: '4.º Duan', serie: 'duan', nivel: 4, etapa: 'media', edad_minima: 10 });
        const progress = async () => (await call('GET', `${BASE}/progreso/mio?alumno_id=${ana}`, admin)).body.disciplinas[0];

        let p = await progress();
        assert.deepEqual([p.requisitos.edad, p.habilitado], [{ minima: 10, actual: null, cumple: false }, false], 'no date of birth');

        assert.equal((await call('PUT', `${BASE}/alumnos/${ana}/fecha-nacimiento`, admin, { fecha_nacimiento: yearsAgo(8.5) })).status, 200);
        p = await progress();
        assert.deepEqual([p.requisitos.edad, p.habilitado], [{ minima: 10, actual: 8, cumple: false }, false]);

        const [examId] = await knex('examenes').insert({ nombre: 'Examen', fecha: isoDate(10) });
        const refused = await call('POST', `${BASE}/examenes/${examId}/nominaciones`, admin, { alumno_id: ana, disciplina_id: ctx.disciplina.id });
        assert.deepEqual([refused.status, refused.body.error], [400, 'No cumple los requisitos del grado 4.º Duan: edad 8 de 10 años.']);

        assert.equal((await call('PUT', `${BASE}/alumnos/${ana}/fecha-nacimiento`, admin, { fecha_nacimiento: yearsAgo(10.2) })).status, 200);
        p = await progress();
        assert.deepEqual([p.requisitos.edad, p.habilitado], [{ minima: 10, actual: 10, cumple: true }, true]);
    });
});

test('a level without a minimum age does not ask for the date of birth', async () => {
    await setup(async (ctx) => {
        await grade(ctx, { orden: 1, nombre: 'Blanco' });
        const p = (await ctx.call('GET', `${BASE}/progreso/mio?alumno_id=${ctx.ana}`, ctx.admin)).body.disciplinas[0];
        assert.deepEqual([p.requisitos.edad.cumple, p.habilitado], [true, true]);
    });
});

// A confirmed nomination of Ana to a past exam for the given grade.
async function confirmed(ctx, gradeBody) {
    const { body: { id: gradoId } } = await grade(ctx, { orden: 1, nombre: 'Nivel', ...gradeBody });
    const [examId] = await ctx.knex('examenes').insert({ nombre: 'Examen Duan Pin', fecha: isoDate(-1) });
    await ctx.knex('inscripciones_examen').insert({ examen_id: examId, alumno_id: ctx.ana, grado_id: gradoId, estado: 'confirmado' });
    return examId;
}
const results = (ctx, examId, item) => ctx.call('PUT', `${BASE}/examenes/${examId}/resultados`, ctx.admin, { resultados: [{ alumno_id: ctx.ana, ...item }] });

test('a pass records conduct, technique and the jury, and the exam shows them', async () => {
    await setup(async (ctx) => {
        const examId = await confirmed(ctx, { serie: 'duan', nivel: 1 });
        const saved = await results(ctx, examId, { resultado: 'aprobado', ...PASS, observaciones: 'Buena postura.' });
        assert.equal(saved.status, 200);
        const [inscripcion] = (await ctx.call('GET', `${BASE}/examenes/${examId}`, ctx.admin)).body.inscripciones;
        assert.deepEqual(
            [inscripcion.estado, inscripcion.conducta_ok, inscripcion.nota_tecnica, inscripcion.nota_teoria, inscripcion.combate_ok, inscripcion.evaluadores, inscripcion.observaciones],
            ['aprobado', true, 8.5, null, null, 'Shifu Ines, Shifu Marco', 'Buena postura.'],
        );
        assert.equal(Number((await ctx.knex('historial_grados').count({ n: '*' }).first()).n), 1);
    });
});

test('a pass needs conduct accepted, a technique score from 0 to 10 and the jury', async () => {
    await setup(async (ctx) => {
        const examId = await confirmed(ctx, { serie: 'duan', nivel: 1 });
        for (const [item, error] of [
            [{ ...PASS, conducta_ok: false }, 'Para aprobar, la conducta y los preceptos deben estar cumplidos (conducta_ok).'],
            [{ ...PASS, conducta_ok: undefined }, 'Para aprobar, la conducta y los preceptos deben estar cumplidos (conducta_ok).'],
            [{ ...PASS, nota_tecnica: undefined }, 'Para aprobar indica la nota técnica, de 0 a 10 (nota_tecnica).'],
            [{ ...PASS, nota_tecnica: 10.5 }, 'nota_tecnica debe ser un número de 0 a 10.'],
            [{ ...PASS, evaluadores: ' ' }, 'Para aprobar indica quiénes evaluaron (evaluadores).'],
        ]) {
            const res = await results(ctx, examId, { resultado: 'aprobado', ...item });
            assert.deepEqual([res.status, res.body.error], [400, error], JSON.stringify(item));
        }
        assert.equal(Number((await ctx.knex('historial_grados').count({ n: '*' }).first()).n), 0);
    });
});

test('levels that require theory or combat need them to pass; a fail may carry its scores', async () => {
    await setup(async (ctx) => {
        const examId = await confirmed(ctx, { serie: 'pin', nivel: 1, grado_pin: 1, requiere_teoria: true, requiere_combate: true });
        const noTheory = await results(ctx, examId, { resultado: 'aprobado', ...PASS, combate_ok: true });
        assert.deepEqual([noTheory.status, noTheory.body.error], [400, 'Este nivel exige teoría: indica la nota de 0 a 100 (nota_teoria).']);
        const badTheory = await results(ctx, examId, { resultado: 'aprobado', ...PASS, combate_ok: true, nota_teoria: 101 });
        assert.deepEqual([badTheory.status, badTheory.body.error], [400, 'nota_teoria debe ser un número entero de 0 a 100.']);
        const noCombat = await results(ctx, examId, { resultado: 'aprobado', ...PASS, nota_teoria: 90 });
        assert.deepEqual([noCombat.status, noCombat.body.error], [400, 'Este nivel exige combate aprobado (combate_ok).']);

        const failed = await results(ctx, examId, { resultado: 'reprobado', conducta_ok: true, nota_tecnica: 5, nota_teoria: 60, combate_ok: false, evaluadores: 'Shifu Ines' });
        assert.equal(failed.status, 200);
        const [inscripcion] = (await ctx.call('GET', `${BASE}/examenes/${examId}`, ctx.admin)).body.inscripciones;
        assert.deepEqual([inscripcion.estado, inscripcion.nota_tecnica, inscripcion.nota_teoria, inscripcion.combate_ok], ['reprobado', 5, 60, false]);
    });
});

test('administration records a student date of birth, needed for the minimum ages', async () => {
    await setup(async ({ call, login, admin, knex, ana }) => {
        const url = `${BASE}/alumnos/${ana}/fecha-nacimiento`;
        assert.equal((await call('PUT', url, admin, { fecha_nacimiento: '2015-03-20' })).status, 200);
        assert.equal((await call('PUT', url, admin, { fecha_nacimiento: '2014-03-20' })).status, 200, 'it can be corrected');
        assert.equal(String((await knex('detalles_alumno').where({ usuario_id: ana }).first()).fecha_nacimiento).slice(0, 10), '2014-03-20');
        for (const value of ['20-03-2014', '2014-02-30', isoDate(1), null]) {
            const res = await call('PUT', url, admin, { fecha_nacimiento: value });
            assert.deepEqual([res.status, res.body.error], [400, 'fecha_nacimiento debe ser una fecha real pasada con el formato YYYY-MM-DD.'], String(value));
        }
        assert.equal((await call('PUT', url, await login('ines@x.cl'), { fecha_nacimiento: '2014-03-20' })).status, 403);
        assert.equal((await call('PUT', `${BASE}/alumnos/99999/fecha-nacimiento`, admin, { fecha_nacimiento: '2014-03-20' })).status, 404);
    });
});

test('the progress says what to prepare for the next level', async () => {
    await setup(async (ctx) => {
        await grade(ctx, { orden: 1, nombre: '4.º Duan', serie: 'duan', nivel: 4, etapa: 'media', formas: 'Xiao Hong Quan', tecnicas: 'Llaves', requiere_teoria: true });
        const { siguiente } = (await ctx.call('GET', `${BASE}/progreso/mio?alumno_id=${ctx.ana}`, ctx.admin)).body.disciplinas[0];
        assert.deepEqual(siguiente, { id: siguiente.id, nombre: '4.º Duan', orden: 1, serie: 'duan', etapa: 'media', formas: 'Xiao Hong Quan', tecnicas: 'Llaves', requiere_teoria: true, requiere_combate: false });
    });
});

test('administration loads the Duan Pin ladder from the portal, once', async () => {
    await setup(async ({ call, login, admin, knex }) => {
        assert.equal((await call('POST', `${BASE}/grados/duan-pin`, await login('ines@x.cl'))).status, 403);
        const loaded = await call('POST', `${BASE}/grados/duan-pin`, admin);
        assert.deepEqual([loaded.status, loaded.body.creados, loaded.body.message], [201, 36, 'Se cargaron 36 niveles Duan Pin en Kung Fu Tradicional.']);
        const again = await call('POST', `${BASE}/grados/duan-pin`, admin);
        assert.deepEqual([again.status, again.body.error], [409, 'Kung Fu Tradicional ya tiene grados: no se cambió nada.']);
        assert.equal(Number((await knex('grados').count({ n: '*' }).first()).n), 36);
    });
});
