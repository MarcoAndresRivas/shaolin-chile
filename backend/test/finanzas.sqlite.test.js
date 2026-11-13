// Fase 2, T6: plans, subscriptions, monthly charges, payments by transfer that
// administration validates, account statements and overdue students.
// Amounts are whole Chilean pesos.
const test = require('node:test');
const assert = require('node:assert/strict');
const { withApi } = require('./apiHarness');

const USERS = [
    ['Admin', 'admin@x.cl', ['Administrador']],
    ['Ana', 'ana@x.cl', ['Alumno']],
    ['Marta', 'marta@x.cl', ['Alumno']],
    ['Luis', 'luis@x.cl', ['Alumno']],
    ['Pepe', 'pepe@x.cl', ['Alumno']],
];
const BASE = '/api/intranet';

const DAY_MS = 24 * 60 * 60 * 1000;
const isoDate = (offsetDays) => new Date(Date.now() + offsetDays * DAY_MS).toISOString().slice(0, 10);

async function setup(fn) {
    await withApi(USERS, async (ctx) => {
        const { call, login, idOf } = ctx;
        const admin = await login('admin@x.cl');
        const ids = { ana: await idOf('ana@x.cl'), marta: await idOf('marta@x.cl'), luis: await idOf('luis@x.cl'), pepe: await idOf('pepe@x.cl') };
        // Marta is the guardian of Luis.
        const familia = (await call('POST', `${BASE}/familias`, admin, { nombre: 'Soto' })).body;
        await call('POST', `${BASE}/familias/${familia.id}/miembros`, admin, { usuario_id: ids.marta, rol_en_familia: 'apoderado' });
        await call('POST', `${BASE}/familias/${familia.id}/miembros`, admin, { usuario_id: ids.luis, rol_en_familia: 'alumno' });
        await fn({ ...ctx, admin, ids });
    });
}

const charge = (ctx, alumno_id, overrides = {}) =>
    ctx.call('POST', `${BASE}/cargos`, ctx.admin, { alumno_id, concepto: 'Mensualidad', monto: 30000, fecha_vencimiento: isoDate(10), ...overrides });

test('administration creates plans with whole-peso prices; anyone logged in can read the active ones', async () => {
    await setup(async ({ call, login, admin }) => {
        const created = await call('POST', `${BASE}/planes`, admin, { nombre: 'Mensual', monto: 30000, periodicidad: 'mensual' });
        assert.equal(created.status, 201);
        await call('POST', `${BASE}/planes`, admin, { nombre: 'Antiguo', monto: 20000, periodicidad: 'mensual' });
        await call('PUT', `${BASE}/planes/${created.body.id + 1}`, admin, { activa: false });

        const ana = await login('ana@x.cl');
        const plans = (await call('GET', `${BASE}/planes`, ana)).body;
        assert.deepEqual(plans.map((p) => [p.nombre, p.monto, p.periodicidad]), [['Mensual', 30000, 'mensual']]);
        assert.equal((await call('GET', `${BASE}/planes?todos=1`, admin)).body.length, 2, 'admin can list inactive ones');

        for (const body of [{ nombre: ' ', monto: 1, periodicidad: 'mensual' }, { nombre: 'x', monto: -5, periodicidad: 'mensual' }, { nombre: 'x', monto: 10.5, periodicidad: 'mensual' }, { nombre: 'x', monto: 1, periodicidad: 'semanal' }]) {
            assert.equal((await call('POST', `${BASE}/planes`, admin, body)).status, 400, JSON.stringify(body));
        }
        assert.equal((await call('POST', `${BASE}/planes`, ana, { nombre: 'x', monto: 1, periodicidad: 'mensual' })).status, 403);
        assert.equal((await call('PUT', `${BASE}/planes/999`, admin, { activa: true })).status, 404);
    });
});

test('subscribing a student to a plan validates both and can be paused or cancelled', async () => {
    await setup(async ({ call, admin, ids }) => {
        const plan = (await call('POST', `${BASE}/planes`, admin, { nombre: 'Mensual', monto: 30000, periodicidad: 'mensual' })).body;
        const created = await call('POST', `${BASE}/suscripciones`, admin, { alumno_id: ids.ana, plan_id: plan.id, fecha_inicio: '2026-11-01' });
        assert.equal(created.status, 201);
        assert.equal((await call('POST', `${BASE}/suscripciones`, admin, { alumno_id: 999, plan_id: plan.id, fecha_inicio: '2026-11-01' })).status, 404);
        assert.equal((await call('POST', `${BASE}/suscripciones`, admin, { alumno_id: ids.ana, plan_id: 999, fecha_inicio: '2026-11-01' })).status, 404);
        assert.equal((await call('POST', `${BASE}/suscripciones`, admin, { alumno_id: ids.ana, plan_id: plan.id, fecha_inicio: 'mañana' })).status, 400);

        const list = (await call('GET', `${BASE}/suscripciones?alumno_id=${ids.ana}`, admin)).body;
        assert.deepEqual(list.map((s) => [s.alumno, s.plan, s.estado, s.fecha_inicio]), [['Ana', 'Mensual', 'activa', '2026-11-01']]);
        assert.equal((await call('PUT', `${BASE}/suscripciones/${created.body.id}`, admin, { estado: 'pausada' })).status, 200);
        assert.equal((await call('PUT', `${BASE}/suscripciones/${created.body.id}`, admin, { estado: 'rara' })).status, 400);
        assert.equal((await call('PUT', `${BASE}/suscripciones/999`, admin, { estado: 'activa' })).status, 404);
    });
});

test('generating a month creates one charge per active monthly subscription and can be repeated', async () => {
    await setup(async ({ call, admin, ids }) => {
        const mensual = (await call('POST', `${BASE}/planes`, admin, { nombre: 'Mensual', monto: 30000, periodicidad: 'mensual' })).body;
        const unico = (await call('POST', `${BASE}/planes`, admin, { nombre: 'Matrícula', monto: 15000, periodicidad: 'unico' })).body;
        const sub = async (alumno_id, plan_id, fecha_inicio) => (await call('POST', `${BASE}/suscripciones`, admin, { alumno_id, plan_id, fecha_inicio })).body.id;
        await sub(ids.ana, mensual.id, '2026-10-01');
        await sub(ids.luis, mensual.id, '2026-12-01'); // starts after the month
        const paused = await sub(ids.pepe, mensual.id, '2026-10-01');
        await call('PUT', `${BASE}/suscripciones/${paused}`, admin, { estado: 'pausada' });
        await sub(ids.marta, unico.id, '2026-10-01'); // not monthly

        const first = await call('POST', `${BASE}/cargos/generar`, admin, { periodo: '2026-11', dia_vencimiento: 10 });
        assert.equal(first.status, 201);
        assert.deepEqual(first.body, { creados: 1, omitidos: 0 });

        const again = await call('POST', `${BASE}/cargos/generar`, admin, { periodo: '2026-11', dia_vencimiento: 10 });
        assert.deepEqual(again.body, { creados: 0, omitidos: 1 });

        const ana = (await call('GET', `${BASE}/cuenta/mia?alumno_id=${ids.ana}`, admin)).body;
        assert.deepEqual(ana.cargos.map((c) => [c.concepto, c.monto, c.fecha_vencimiento, c.estado]), [['Mensual 2026-11', 30000, '2026-11-10', 'pendiente']]);

        for (const body of [{ periodo: 'noviembre', dia_vencimiento: 10 }, { periodo: '2026-11', dia_vencimiento: 31 }, { periodo: '2026-11' }]) {
            assert.equal((await call('POST', `${BASE}/cargos/generar`, admin, body)).status, 400, JSON.stringify(body));
        }
    });
});

test('a manual charge validates its fields', async () => {
    await setup(async ({ call, admin, ids }) => {
        assert.equal((await charge({ call, admin }, ids.ana)).status, 201);
        for (const overrides of [{ concepto: ' ' }, { monto: 0 }, { monto: 99.5 }, { fecha_vencimiento: 'pronto' }]) {
            assert.equal((await charge({ call, admin }, ids.ana, overrides)).status, 400, JSON.stringify(overrides));
        }
        assert.equal((await charge({ call, admin }, 999)).status, 404);
    });
});

test('an account statement is charges minus validated payments, and only the owner, their guardian or admin read it', async () => {
    await setup(async ({ call, login, admin, ids }) => {
        const ana = await login('ana@x.cl');
        const { body: { id } } = await charge({ call, admin }, ids.ana);
        await call('POST', `${BASE}/cargos/${id}/pagos`, admin, { monto: 10000, referencia: 'TR-1' });

        const own = (await call('GET', `${BASE}/cuenta/mia`, ana)).body;
        assert.deepEqual(own.resumen, { cargado: 30000, pagado: 10000, saldo: 20000, moroso: false });
        assert.deepEqual({ monto: own.cargos[0].monto, pagado: own.cargos[0].pagado, saldo: own.cargos[0].saldo }, { monto: 30000, pagado: 10000, saldo: 20000 });

        assert.equal((await call('GET', `${BASE}/cuenta/mia?alumno_id=${ids.ana}`, await login('pepe@x.cl'))).status, 403, 'a stranger');
        assert.equal((await call('GET', `${BASE}/cuenta/mia?alumno_id=${ids.ana}`, await login('marta@x.cl'))).status, 403, 'a guardian of someone else');
        await charge({ call, admin }, ids.luis, { monto: 25000 });
        const asGuardian = await call('GET', `${BASE}/cuenta/mia?alumno_id=${ids.luis}`, await login('marta@x.cl'));
        assert.equal(asGuardian.status, 200);
        assert.equal(asGuardian.body.resumen.cargado, 25000);
    });
});

test('a student reports a payment; it only counts once administration validates it', async () => {
    await setup(async ({ call, login, admin, ids }) => {
        const ana = await login('ana@x.cl');
        const { body: { id } } = await charge({ call, admin }, ids.ana);

        const reported = await call('POST', `${BASE}/cargos/${id}/pagos`, ana, { monto: 30000, referencia: 'Transferencia 123' });
        assert.equal(reported.status, 201);
        assert.equal((await call('GET', `${BASE}/cuenta/mia`, ana)).body.resumen.pagado, 0, 'not counted yet');

        const pending = (await call('GET', `${BASE}/pagos?estado=por_validar`, admin)).body;
        assert.deepEqual(pending.map((p) => [p.alumno, p.concepto, p.monto, p.referencia]), [['Ana', 'Mensualidad', 30000, 'Transferencia 123']]);
        assert.equal((await call('PUT', `${BASE}/pagos/${reported.body.id}/validar`, ana)).status, 403, 'a student cannot validate');

        assert.equal((await call('PUT', `${BASE}/pagos/${reported.body.id}/validar`, admin)).status, 200);
        const account = (await call('GET', `${BASE}/cuenta/mia`, ana)).body;
        assert.deepEqual(account.resumen, { cargado: 30000, pagado: 30000, saldo: 0, moroso: false });
        assert.equal(account.cargos[0].estado, 'pagado', 'a fully paid charge is closed');
        assert.deepEqual((await call('GET', `${BASE}/pagos?estado=por_validar`, admin)).body, []);
    });
});

test('a rejected payment never counts, and a payment cannot exceed what is owed', async () => {
    await setup(async ({ call, login, admin, ids }) => {
        const ana = await login('ana@x.cl');
        const { body: { id } } = await charge({ call, admin }, ids.ana);
        const url = `${BASE}/cargos/${id}/pagos`;

        assert.equal((await call('POST', url, ana, { monto: 0 })).status, 400);
        assert.equal((await call('POST', url, ana, { monto: 5.5 })).status, 400);
        assert.equal((await call('POST', url, ana, { monto: 30001 })).status, 400, 'more than the charge');

        const bad = (await call('POST', url, ana, { monto: 30000, referencia: 'sin fondos' })).body;
        assert.equal((await call('PUT', `${BASE}/pagos/${bad.id}/rechazar`, admin)).status, 200);
        assert.equal((await call('GET', `${BASE}/cuenta/mia`, ana)).body.resumen.pagado, 0);

        // Two reports of the full amount: only one can be validated.
        const first = (await call('POST', url, ana, { monto: 30000 })).body;
        const second = (await call('POST', url, ana, { monto: 30000 })).body;
        assert.equal((await call('PUT', `${BASE}/pagos/${first.id}/validar`, admin)).status, 200);
        const over = await call('PUT', `${BASE}/pagos/${second.id}/validar`, admin);
        assert.equal(over.status, 409);
        assert.match(over.body.error, /saldo/);
        assert.equal((await call('PUT', `${BASE}/pagos/${first.id}/validar`, admin)).status, 409, 'already validated');
        assert.equal((await call('PUT', `${BASE}/pagos/999/validar`, admin)).status, 404);
        assert.equal((await call('POST', url, ana, { monto: 1 })).status, 409, 'the charge is already paid');
    });
});

test('administration registering a payment it has verified validates it at once', async () => {
    await setup(async ({ call, login, admin, ids }) => {
        const { body: { id } } = await charge({ call, admin }, ids.ana);
        const paid = await call('POST', `${BASE}/cargos/${id}/pagos`, admin, { monto: 12000, referencia: 'Efectivo en sede' });
        assert.equal(paid.status, 201);
        const account = (await call('GET', `${BASE}/cuenta/mia`, await login('ana@x.cl'))).body;
        assert.equal(account.resumen.pagado, 12000);
        assert.deepEqual(account.cargos[0].pagos.map((p) => [p.monto, p.estado, p.referencia]), [[12000, 'validado', 'Efectivo en sede']]);
    });
});

test('a guardian reports a payment for a student in their care, a stranger cannot', async () => {
    await setup(async ({ call, login, admin, ids }) => {
        const { body: { id } } = await charge({ call, admin }, ids.luis);
        const url = `${BASE}/cargos/${id}/pagos`;
        assert.equal((await call('POST', url, await login('pepe@x.cl'), { monto: 100 })).status, 403);
        assert.equal((await call('POST', url, await login('marta@x.cl'), { monto: 30000 })).status, 201);
        assert.equal((await call('POST', `${BASE}/cargos/999/pagos`, admin, { monto: 1 })).status, 404);
    });
});

test('overdue students: a pending charge past its due date makes the student overdue', async () => {
    await setup(async ({ call, login, admin, ids }) => {
        await charge({ call, admin }, ids.ana, { fecha_vencimiento: isoDate(-20), monto: 30000 });
        await charge({ call, admin }, ids.ana, { fecha_vencimiento: isoDate(-3), monto: 10000, concepto: 'Seminario' });
        await charge({ call, admin }, ids.luis, { fecha_vencimiento: isoDate(5) });
        const paidLate = (await charge({ call, admin }, ids.pepe, { fecha_vencimiento: isoDate(-9) })).body;
        await call('POST', `${BASE}/cargos/${paidLate.id}/pagos`, admin, { monto: 30000 });

        const ana = (await call('GET', `${BASE}/cuenta/mia`, await login('ana@x.cl'))).body;
        assert.equal(ana.resumen.moroso, true);
        assert.deepEqual(ana.cargos.map((c) => c.vencido), [true, true]);

        const report = (await call('GET', `${BASE}/morosidad`, admin)).body;
        assert.deepEqual(report.map((r) => [r.alumno, r.saldo_vencido, r.cargos_vencidos, r.dias_max_atraso]), [['Ana', 40000, 2, 20]]);

        // With a grace period, recent debts are not reported yet.
        const withGrace = (await call('GET', `${BASE}/morosidad?dias_gracia=10`, admin)).body;
        assert.deepEqual(withGrace.map((r) => [r.alumno, r.saldo_vencido, r.cargos_vencidos]), [['Ana', 30000, 1]]);
        assert.equal((await call('GET', `${BASE}/morosidad`, await login('ana@x.cl'))).status, 403);
        assert.equal((await call('GET', `${BASE}/morosidad?dias_gracia=abc`, admin)).status, 400);
    });
});

test('voiding a charge removes it from the account unless it already has validated payments', async () => {
    await setup(async ({ call, login, admin, ids }) => {
        const { body: { id } } = await charge({ call, admin }, ids.ana);
        assert.equal((await call('PUT', `${BASE}/cargos/${id}/anular`, admin)).status, 200);
        const account = (await call('GET', `${BASE}/cuenta/mia`, await login('ana@x.cl'))).body;
        assert.deepEqual(account.resumen, { cargado: 0, pagado: 0, saldo: 0, moroso: false });
        assert.equal((await call('POST', `${BASE}/cargos/${id}/pagos`, admin, { monto: 1 })).status, 409, 'a voided charge takes no payments');

        const paid = (await charge({ call, admin }, ids.ana)).body;
        await call('POST', `${BASE}/cargos/${paid.id}/pagos`, admin, { monto: 5000 });
        assert.equal((await call('PUT', `${BASE}/cargos/${paid.id}/anular`, admin)).status, 409);
        assert.equal((await call('PUT', `${BASE}/cargos/999/anular`, admin)).status, 404);
    });
});

test('deleting a student removes their charges, payments and subscriptions', async () => {
    await setup(async ({ call, admin, ids, knex }) => {
        const plan = (await call('POST', `${BASE}/planes`, admin, { nombre: 'Mensual', monto: 30000, periodicidad: 'mensual' })).body;
        await call('POST', `${BASE}/suscripciones`, admin, { alumno_id: ids.ana, plan_id: plan.id, fecha_inicio: '2026-11-01' });
        const { body: { id } } = await charge({ call, admin }, ids.ana);
        await call('POST', `${BASE}/cargos/${id}/pagos`, admin, { monto: 1000 });
        await knex('usuarios').where({ id: ids.ana }).del();
        for (const table of ['suscripciones', 'cargos', 'pagos']) assert.equal((await knex(table)).length, 0, table);
    });
});
