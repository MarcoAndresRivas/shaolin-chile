// Fase 3: selling seminar days and courses, paid by transfer and validated by administration.
const test = require('node:test');
const assert = require('node:assert/strict');
const { withApi } = require('./apiHarness');
const { seedOfertas } = require('../src/seedOfertas');

const USERS = [
    ['Admin', 'admin@x.cl', ['Administrador']],
    ['Ana', 'ana@x.cl', ['Alumno']],
];
const KEY = 'k'.repeat(40);
const DAY_MS = 24 * 60 * 60 * 1000;
const isoDate = (offsetDays) => new Date(Date.now() + offsetDays * DAY_MS).toISOString().slice(0, 10);

const buyer = (items, overrides = {}) => ({ nombre: 'Juana Pérez', email: 'Juana@Example.com', consentimiento: true, items, ...overrides });

// A published two-day seminar (in 10 and 11 days), a draft one and a course with two lessons.
async function catalog(knex, { cupo = 50 } = {}) {
    const [seminarioId] = await knex('seminarios').insert({ titulo: 'Seminario de prueba', precio_pack: 59000, oferta: 'Los dos días por $59.000', estado: 'publicado' });
    const [dia1] = await knex('seminario_dias').insert({ seminario_id: seminarioId, fecha: isoDate(10), hora_inicio: '10:00', precio: 35000, cupo });
    const [dia2] = await knex('seminario_dias').insert({ seminario_id: seminarioId, fecha: isoDate(11), hora_inicio: '10:00', precio: 35000, cupo });
    const [draftId] = await knex('seminarios').insert({ titulo: 'Borrador', estado: 'borrador' });
    const [draftDay] = await knex('seminario_dias').insert({ seminario_id: draftId, fecha: isoDate(12), precio: 1000, cupo: 5 });
    const [cursoId] = await knex('cursos').insert({ titulo: 'Curso de prueba', precio: 25000, estado: 'publicado' });
    await knex('curso_lecciones').insert([
        { curso_id: cursoId, orden: 1, titulo: 'Lección 1', video_url: 'https://videos.example/1.mp4', descargable: true },
        { curso_id: cursoId, orden: 2, titulo: 'Lección 2', video_url: 'https://videos.example/2.mp4', descargable: false },
    ]);
    return { seminarioId, dia1, dia2, draftDay, cursoId };
}

test('the catalog is public, lists only published offers and hides the course videos', async () => {
    await withApi(USERS, async ({ call, knex }) => {
        await catalog(knex);
        const { status, body } = await call('GET', '/api/ofertas', null);
        assert.equal(status, 200);
        assert.deepEqual(body.seminarios.map((s) => s.titulo), ['Seminario de prueba']);
        assert.equal(body.seminarios[0].precio_pack, 59000);
        assert.deepEqual(body.seminarios[0].dias.map((d) => [d.precio, d.cupo_disponible, d.cerrado]), [[35000, 50, false], [35000, 50, false]]);
        assert.ok(body.seminarios[0].dias.every((d) => !('vendidos' in d)));
        assert.deepEqual(body.cursos[0].lecciones.map((l) => l.titulo), ['Lección 1', 'Lección 2']);
        assert.ok(JSON.stringify(body).indexOf('videos.example') === -1, 'no video link before paying');
        assert.ok('pago' in body);
    });
});

test('buying both days of a seminar costs the offer price and holds the seats', async () => {
    await withApi(USERS, async ({ call, knex }) => {
        const { dia1, dia2 } = await catalog(knex);
        const { status, body } = await call('POST', '/api/compras', null, buyer([{ seminario_dia_id: dia1, cantidad: 1 }, { seminario_dia_id: dia2, cantidad: 1 }]));
        assert.equal(status, 201);
        assert.deepEqual([body.subtotal, body.descuento, body.total, body.estado], [70000, 11000, 59000, 'pendiente']);
        assert.match(body.codigo, /^SC-/);
        assert.match(body.mensaje, /transferencia de \$59\.000/);
        assert.match(body.mensaje, /comprobante \+ Nombre Completo/);
        assert.match(body.mensaje, /correspondiente al valor de Seminario de prueba \(\S+ \d+ de \S+ y \S+ \d+ de \S+\)\. ✨/, 'the days of one seminar are named together');

        const [compra] = await knex('compras');
        assert.deepEqual([compra.email, compra.origen, Boolean(compra.consentimiento)], ['juana@example.com', 'sitio', true]);
        assert.deepEqual((await knex('seminario_dias').orderBy('id')).slice(0, 2).map((d) => d.vendidos), [1, 1]);
    });
});

test('one day for two people is two day prices, and a course adds its price', async () => {
    await withApi(USERS, async ({ call, knex }) => {
        const { dia1, cursoId } = await catalog(knex);
        const { body } = await call('POST', '/api/compras', null, buyer([{ seminario_dia_id: dia1, cantidad: 2 }, { curso_id: cursoId }]));
        assert.deepEqual([body.subtotal, body.descuento, body.total], [95000, 0, 95000]);
        assert.deepEqual(body.items.map((i) => i.cantidad), [2, 1]);
    });
});

test('a purchase is refused when there are not enough seats, and takes nothing', async () => {
    await withApi(USERS, async ({ call, knex }) => {
        const { dia1, dia2 } = await catalog(knex, { cupo: 2 });
        assert.equal((await call('POST', '/api/compras', null, buyer([{ seminario_dia_id: dia1, cantidad: 2 }]))).status, 201);
        const refused = await call('POST', '/api/compras', null, buyer([{ seminario_dia_id: dia2, cantidad: 1 }, { seminario_dia_id: dia1, cantidad: 1 }]));
        assert.equal(refused.status, 409);
        assert.match(refused.body.error, /quedan 0/);
        assert.equal(await knex('compras').count({ n: '*' }).first().then((r) => Number(r.n)), 1);
        assert.deepEqual((await knex('seminario_dias').orderBy('id')).slice(0, 2).map((d) => d.vendidos), [2, 0], 'the other day keeps its seats');
    });
});

test('a day closes for sales 12 hours before it starts', async () => {
    await withApi(USERS, async ({ call, knex }) => {
        const [id] = await knex('seminarios').insert({ titulo: 'Mañana', estado: 'publicado' });
        const [dia] = await knex('seminario_dias').insert({ seminario_id: id, fecha: isoDate(0), hora_inicio: '00:00', precio: 1000, cupo: 5 });
        const listed = (await call('GET', '/api/ofertas', null)).body.seminarios[0].dias[0];
        assert.equal(listed.cerrado, true);
        const { status, body } = await call('POST', '/api/compras', null, buyer([{ seminario_dia_id: dia }]));
        assert.equal(status, 409);
        assert.match(body.error, /cerraron/);
    });
});

test('invalid purchases are refused and nothing is stored', async () => {
    await withApi(USERS, async ({ call, knex }) => {
        const { dia1, draftDay } = await catalog(knex);
        const cases = [
            [buyer([{ seminario_dia_id: dia1 }], { consentimiento: false }), 'consentimiento'],
            [buyer([{ seminario_dia_id: dia1 }], { nombre: 'J' }), 'nombre'],
            [buyer([{ seminario_dia_id: dia1 }], { email: 'juana@' }), 'email'],
            [buyer([]), 'items'],
            [buyer([{ seminario_dia_id: dia1, cantidad: 0 }]), 'cantidad'],
            [buyer([{ seminario_dia_id: dia1, cantidad: 11 }]), 'hasta 10'],
            [buyer([{ seminario_dia_id: 999 }]), 'no existe'],
            [buyer([{ seminario_dia_id: draftDay }]), 'no existe'],
            [buyer([{ algo: 1 }]), 'seminario_dia_id, curso_id o producto_talla_id'],
        ];
        for (const [body, hint] of cases) {
            const { status, body: answer } = await call('POST', '/api/compras', null, body);
            assert.equal(status, 400, hint);
            assert.ok(answer.error.includes(hint), `${hint}: ${answer.error}`);
        }
        assert.equal(await knex('compras').count({ n: '*' }).first().then((r) => Number(r.n)), 0);
    });
});

test('the buyer reads the purchase with code and email, reports the transfer, and gets the videos once it is paid', async () => {
    await withApi(USERS, async ({ call, knex, login }) => {
        const { cursoId } = await catalog(knex);
        const { body: compra } = await call('POST', '/api/compras', null, buyer([{ curso_id: cursoId }]));
        const own = `/api/compras/${compra.codigo}?email=juana@example.com`;

        assert.equal((await call('GET', `/api/compras/${compra.codigo}?email=otra@example.com`, null)).status, 404, 'another email cannot read it');
        const pending = (await call('GET', own, null)).body;
        assert.equal(pending.estado, 'pendiente');
        assert.deepEqual(pending.cursos, [], 'no videos while it is pending');

        const reported = await call('POST', `/api/compras/${compra.codigo}/pago`, null, { email: 'juana@example.com', referencia: 'Transferencia de Juana Pérez, 20/11' });
        assert.equal(reported.status, 200);

        const admin = await login('admin@x.cl');
        const [list] = (await call('GET', '/api/intranet/ventas/compras?estado=pendiente', admin)).body;
        assert.equal(list.referencia_pago, 'Transferencia de Juana Pérez, 20/11');
        assert.equal((await call('PUT', `/api/intranet/ventas/compras/${list.id}/validar`, admin)).status, 200);
        assert.equal((await call('PUT', `/api/intranet/ventas/compras/${list.id}/validar`, admin)).status, 409, 'validated once');

        const paid = (await call('GET', own, null)).body;
        assert.equal(paid.estado, 'pagada');
        assert.deepEqual(paid.cursos[0].lecciones.map((l) => [l.titulo, l.video_url, l.descargable]), [
            ['Lección 1', 'https://videos.example/1.mp4', true],
            ['Lección 2', 'https://videos.example/2.mp4', false],
        ]);
        assert.equal((await call('POST', `/api/compras/${compra.codigo}/pago`, null, { email: 'juana@example.com', referencia: 'x' })).status, 409);
    });
});

test('cancelling a purchase gives the seats back; only administration manages sales', async () => {
    await withApi(USERS, async ({ call, knex, login }) => {
        const { dia1 } = await catalog(knex);
        await call('POST', '/api/compras', null, buyer([{ seminario_dia_id: dia1, cantidad: 3 }]));
        const [{ id }] = await knex('compras');

        const student = await login('ana@x.cl');
        assert.equal((await call('GET', '/api/intranet/ventas/compras', student)).status, 403);
        assert.equal((await call('PUT', `/api/intranet/ventas/compras/${id}/anular`, student)).status, 403);

        const admin = await login('admin@x.cl');
        assert.equal((await call('PUT', `/api/intranet/ventas/compras/${id}/anular`, admin)).status, 200);
        assert.equal((await knex('seminario_dias').where({ id: dia1 }).first()).vendidos, 0);
        assert.equal((await call('PUT', `/api/intranet/ventas/compras/${id}/anular`, admin)).status, 409, 'cancelled once');
        assert.equal((await call('PUT', `/api/intranet/ventas/compras/${id}/validar`, admin)).status, 409, 'a cancelled purchase cannot be paid');
    });
});

test('administration creates a seminar with days and a course with lessons', async () => {
    await withApi(USERS, async ({ call, login }) => {
        const admin = await login('admin@x.cl');
        const seminar = await call('POST', '/api/intranet/ventas/seminarios', admin, { titulo: 'Seminario de enero', precio_pack: 59000, imagen: 'seminario.jpg', estado: 'publicado' });
        assert.equal(seminar.status, 201);
        assert.equal((await call('POST', `/api/intranet/ventas/seminarios/${seminar.body.id}/dias`, admin, { fecha: isoDate(30), hora_inicio: '10:00', hora_fin: '13:00', precio: 35000, cupo: 50 })).status, 201);
        assert.equal((await call('POST', `/api/intranet/ventas/seminarios/${seminar.body.id}/dias`, admin, { fecha: '30-12-2026', precio: 35000, cupo: 50 })).status, 400);
        assert.equal((await call('POST', '/api/intranet/ventas/seminarios', admin, { titulo: 'X', estado: 'publicado' })).status, 400);
        assert.equal((await call('POST', '/api/intranet/ventas/seminarios', admin, { titulo: 'Malo', imagen: 'javascript:alert(1)' })).status, 400);

        const course = await call('POST', '/api/intranet/ventas/cursos', admin, { titulo: 'Curso de enero', precio: 25000 });
        assert.equal(course.status, 201);
        assert.equal((await call('POST', `/api/intranet/ventas/cursos/${course.body.id}/lecciones`, admin, { orden: 1, titulo: 'Intro', video_url: 'https://v.example/1' })).status, 201);
        assert.equal((await call('POST', `/api/intranet/ventas/cursos/${course.body.id}/lecciones`, admin, { orden: 2, titulo: 'Mala', video_url: 'http://v.example/2' })).status, 400);
        assert.equal((await call('PUT', `/api/intranet/ventas/cursos/${course.body.id}`, admin, { estado: 'publicado' })).status, 200);

        const { body } = await call('GET', '/api/ofertas', null);
        assert.deepEqual(body.seminarios.map((s) => s.titulo), ['Seminario de enero']);
        assert.deepEqual(body.cursos.map((c) => c.titulo), ['Curso de enero']);
    });
});

test('the assistant reads the offers and books with the key, recording its channel', async () => {
    await withApi(USERS, async ({ call, knex }) => {
        const { dia1 } = await catalog(knex);
        const headers = { 'X-Asistente-Key': KEY };
        assert.equal((await call('GET', '/api/asistente/ofertas', null, undefined, headers)).body.seminarios.length, 1);
        const booked = await call('POST', '/api/asistente/compras', null, buyer([{ seminario_dia_id: dia1 }], { origen: 'instagram' }), headers);
        assert.equal(booked.status, 201);
        assert.match(booked.body.mensaje, /\*\$35\.000\*/, 'bold amount for Instagram');
        assert.equal((await knex('compras').first()).origen, 'instagram');
        assert.equal((await call('POST', '/api/asistente/compras', null, buyer([{ seminario_dia_id: dia1 }]))).status, 401);
    }, { env: { ASISTENTE_API_KEY: KEY } });
});

test('the seed creates the December seminar and the test course once', async () => {
    await withApi(USERS, async ({ knex }) => {
        assert.equal((await seedOfertas(knex)).length, 2);
        assert.deepEqual(await seedOfertas(knex), [], 'repeating changes nothing');
        const dias = await knex('seminario_dias');
        assert.deepEqual(dias.map((d) => [d.fecha, d.hora_inicio, d.hora_fin, d.precio, d.cupo]), [
            ['2026-12-04', '09:00', '17:00', 35000, 50],
            ['2026-12-05', '09:00', '17:00', 35000, 50],
        ]);
        const seminario = await knex('seminarios').first();
        assert.deepEqual([seminario.precio_pack, seminario.sede], [59000, 'SECPLAN Municipalidad de Hualpén']);
        assert.equal(await knex('curso_lecciones').count({ n: '*' }).first().then((r) => Number(r.n)), 4);
    });
});
