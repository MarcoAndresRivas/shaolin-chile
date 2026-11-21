// The Shaolin Temple Duan Pin ladder (段品制) for Kung Fu Tradicional:
// Duan 1–9 in three stages (inicial 1–3, media 4–6, alta 7–9), then Pin 1–9
// with three grades each. Minimum ages 7/10/13 for the Duan stages and 16 for
// Pin, which also needs a year with Duan 9. Theory from Duan 4; Pin adds combat.
// The techniques follow the official progression (strike, kick from Duan 2,
// lock from 4, body strike from 5, throw from 7); the forms are left empty for
// the head instructor. Sources: odd/tasks/duan-pin.md (Log).
// Safe to repeat: a discipline that already has grades is left as it is.

const SLUG = 'kung-fu-tradicional';

const STAGES = (nivel) => (nivel <= 3 ? 'inicial' : nivel <= 6 ? 'media' : 'alta');
const DUAN_AGE = (nivel) => (nivel <= 3 ? 7 : nivel <= 6 ? 10 : 13);

const TECHNIQUES = {
    1: 'Golpes (打).',
    2: 'Golpes y patadas (打, 踢).',
    3: 'Golpes y patadas (打, 踢).',
    4: 'Golpes, patadas y llaves (打, 踢, 拿).',
    5: 'Golpes, patadas, llaves y golpes con el cuerpo (打, 踢, 拿, 靠).',
    6: 'Golpes, patadas, llaves y golpes con el cuerpo (打, 踢, 拿, 靠).',
    7: 'Golpes, patadas, llaves, golpes con el cuerpo y derribos (打, 踢, 拿, 靠, 摔). Se agrega el bastón Shaolin.',
    8: 'Las cinco técnicas combinadas: golpes, patadas, llaves, golpes con el cuerpo y derribos.',
    9: 'Las cinco técnicas combinadas: golpes, patadas, llaves, golpes con el cuerpo y derribos.',
};

const PIN_TITLES = {
    1: 'Quánshì (拳士)', 2: 'Quánshì (拳士)', 3: 'Quánshì (拳士)',
    4: 'Quánshī (拳师)', 5: 'Quánshī (拳师)', 6: 'Quánshī (拳师)',
    7: 'Míngshī (名师)', 8: 'Dàshī (大师)', 9: 'Zōngshī (宗师)',
};

function ladder(disciplinaId) {
    const levels = [];
    for (let nivel = 1; nivel <= 9; nivel++) {
        levels.push({
            disciplina_id: disciplinaId, orden: nivel, nombre: `${nivel}.º Duan`, serie: 'duan', nivel, grado_pin: null, etapa: STAGES(nivel),
            edad_minima: DUAN_AGE(nivel), meses_minimos: 0, requiere_teoria: nivel >= 4, requiere_combate: false, tecnicas: TECHNIQUES[nivel],
        });
    }
    for (let nivel = 1; nivel <= 9; nivel++) {
        for (let grado = 1; grado <= 3; grado++) {
            levels.push({
                disciplina_id: disciplinaId, orden: 9 + (nivel - 1) * 3 + grado, nombre: `Pin ${nivel} · grado ${grado} · ${PIN_TITLES[nivel]}`,
                serie: 'pin', nivel, grado_pin: grado, etapa: STAGES(nivel), edad_minima: 16, requiere_teoria: true, requiere_combate: true,
                meses_minimos: nivel === 1 && grado === 1 ? 12 : 0, // a full year with Duan 9 before the first Pin
                tecnicas: 'Técnica y teoría completas del sistema, con combate real.',
            });
        }
    }
    return levels;
}

async function seedDuanPin(knex) {
    const disciplina = await knex('disciplinas').where({ slug: SLUG }).first();
    if (!disciplina) throw new Error(`No existe la disciplina ${SLUG}.`);
    const result = { disciplina: disciplina.nombre, creados: 0 };
    if (await knex('grados').where({ disciplina_id: disciplina.id }).first()) return result;
    const levels = ladder(disciplina.id);
    await knex('grados').insert(levels);
    return { ...result, creados: levels.length };
}

module.exports = { seedDuanPin, ladder };
