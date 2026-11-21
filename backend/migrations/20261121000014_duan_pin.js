// Grades and exams on the Shaolin Temple Duan Pin system (段品制).
//
// grados: where a level sits in the ladder (serie duan|pin, nivel 1-9, etapa,
// grado_pin 1-3 inside a Pin), its minimum age, the forms the head instructor
// sets, and whether its exam requires theory and combat.
// inscripciones_examen: the three parts of the exam (conduct, technique,
// theory), combat, the jury and notes.
//
// Safe to repeat.

const GRADOS = [
    ['serie', (t) => t.string('serie', 10).nullable()],
    ['nivel', (t) => t.integer('nivel').nullable()],
    ['etapa', (t) => t.string('etapa', 20).nullable()],
    ['grado_pin', (t) => t.integer('grado_pin').nullable()],
    ['edad_minima', (t) => t.integer('edad_minima').notNullable().defaultTo(0)],
    ['formas', (t) => t.text('formas').nullable()],
    ['requiere_teoria', (t) => t.boolean('requiere_teoria').notNullable().defaultTo(false)],
    ['requiere_combate', (t) => t.boolean('requiere_combate').notNullable().defaultTo(false)],
];

const INSCRIPCIONES = [
    ['conducta_ok', (t) => t.boolean('conducta_ok').nullable()],
    ['nota_tecnica', (t) => t.decimal('nota_tecnica', 3, 1).nullable()],
    ['nota_teoria', (t) => t.integer('nota_teoria').nullable()],
    ['combate_ok', (t) => t.boolean('combate_ok').nullable()],
    ['evaluadores', (t) => t.string('evaluadores', 255).nullable()],
    ['observaciones', (t) => t.text('observaciones').nullable()],
];

async function addMissing(knex, table, columns) {
    for (const [name, add] of columns) {
        if (!(await knex.schema.hasColumn(table, name))) await knex.schema.alterTable(table, add);
    }
}

async function dropPresent(knex, table, columns) {
    for (const [name] of columns) {
        if (await knex.schema.hasColumn(table, name)) await knex.schema.alterTable(table, (t) => t.dropColumn(name));
    }
}

exports.up = async function up(knex) {
    await addMissing(knex, 'grados', GRADOS);
    await addMissing(knex, 'inscripciones_examen', INSCRIPCIONES);
};

// Exam scores and the ladder are school records: never dropped while they exist.
exports.down = async function down(knex) {
    if ((await knex.schema.hasColumn('grados', 'serie')) && (await knex('grados').whereNotNull('serie').first())) {
        throw new Error('Refusing to roll back: grados holds Duan Pin levels.');
    }
    if ((await knex.schema.hasColumn('inscripciones_examen', 'evaluadores'))
        && (await knex('inscripciones_examen').whereNotNull('evaluadores').orWhereNotNull('nota_tecnica').first())) {
        throw new Error('Refusing to roll back: inscripciones_examen holds exam scores.');
    }
    await dropPresent(knex, 'inscripciones_examen', INSCRIPCIONES);
    await dropPresent(knex, 'grados', GRADOS);
};
