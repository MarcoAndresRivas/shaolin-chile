// The Duan Pin ladder loaded for Kung Fu Tradicional: Duan 1–9 in three stages,
// then Pin 1–9 with three grades each, with the official minimum ages.
const test = require('node:test');
const assert = require('node:assert/strict');
const { withApi } = require('./apiHarness');
const { seedDuanPin } = require('../src/seedDuanPin');

const USERS = [['Admin', 'admin@x.cl', ['Administrador']]];

test('the seed loads the 36 Duan Pin levels in order once, for Kung Fu Tradicional', async () => {
    await withApi(USERS, async ({ knex }) => {
        assert.deepEqual(await seedDuanPin(knex), { disciplina: 'Kung Fu Tradicional', creados: 36 });
        assert.deepEqual(await seedDuanPin(knex), { disciplina: 'Kung Fu Tradicional', creados: 0 }, 'repeating changes nothing');

        const kungFu = await knex('disciplinas').where({ slug: 'kung-fu-tradicional' }).first();
        const levels = await knex('grados').where({ disciplina_id: kungFu.id }).orderBy('orden');
        assert.equal(levels.length, 36);
        assert.deepEqual(levels.map((g) => g.orden), Array.from({ length: 36 }, (_, i) => i + 1));
        const pick = (g) => [g.nombre, g.serie, g.nivel, g.etapa, g.grado_pin, g.edad_minima, Boolean(g.requiere_teoria), Boolean(g.requiere_combate), g.meses_minimos];
        assert.deepEqual(pick(levels[0]), ['1.º Duan', 'duan', 1, 'inicial', null, 7, false, false, 0]);
        assert.deepEqual(pick(levels[3]), ['4.º Duan', 'duan', 4, 'media', null, 10, true, false, 0]);
        assert.deepEqual(pick(levels[8]), ['9.º Duan', 'duan', 9, 'alta', null, 13, true, false, 0]);
        assert.deepEqual(pick(levels[9]), ['Pin 1 · grado 1 · Quánshì (拳士)', 'pin', 1, 'inicial', 1, 16, true, true, 12]);
        assert.deepEqual(pick(levels[10]), ['Pin 1 · grado 2 · Quánshì (拳士)', 'pin', 1, 'inicial', 2, 16, true, true, 0]);
        assert.deepEqual(pick(levels[35]), ['Pin 9 · grado 3 · Zōngshī (宗师)', 'pin', 9, 'alta', 3, 16, true, true, 0]);
        assert.match(levels[0].tecnicas, /Golpes/);
        assert.match(levels[6].tecnicas, /derribos/);
        assert.ok(levels.every((g) => g.formas === null), 'the forms are left for the head instructor');
    });
});

test('the seed does not touch a discipline that already has grades', async () => {
    await withApi(USERS, async ({ knex }) => {
        const kungFu = await knex('disciplinas').where({ slug: 'kung-fu-tradicional' }).first();
        await knex('grados').insert({ disciplina_id: kungFu.id, orden: 1, nombre: 'Blanco' });
        assert.deepEqual(await seedDuanPin(knex), { disciplina: 'Kung Fu Tradicional', creados: 0 });
        assert.deepEqual((await knex('grados').where({ disciplina_id: kungFu.id })).map((g) => g.nombre), ['Blanco']);
    });
});
