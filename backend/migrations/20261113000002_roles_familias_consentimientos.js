// Phase 0 of the master plan: users can hold several roles, guardians group
// students into families, and each consent is stored with who gave it and when.
//
// usuarios.rol_id is kept for compatibility with the current frontend; the
// source of truth for permissions is usuario_roles from now on.

const NEW_ROLES = ['Director', 'Instructor', 'Encargado de catálogo', 'Encargado de contenido', 'Apoderado'];

const CONSENT_TYPES = ['datos_salud', 'uso_imagen', 'comunicaciones', 'exencion_responsabilidad'];

exports.up = async function up(knex) {
    const existing = new Set(await knex('roles').pluck('nombre'));
    const missing = NEW_ROLES.filter((nombre) => !existing.has(nombre));
    if (missing.length) await knex('roles').insert(missing.map((nombre) => ({ nombre })));

    await knex.schema.createTable('usuario_roles', (t) => {
        t.integer('usuario_id').unsigned().notNullable().references('id').inTable('usuarios').onDelete('CASCADE');
        t.integer('rol_id').unsigned().notNullable().references('id').inTable('roles');
        t.primary(['usuario_id', 'rol_id']);
    });
    // Every existing user keeps the role they have today.
    await knex.raw('INSERT INTO usuario_roles (usuario_id, rol_id) SELECT id, rol_id FROM usuarios');

    await knex.schema.createTable('familias', (t) => {
        t.increments('id');
        t.string('nombre', 255).notNullable();
        t.datetime('fecha_creacion').defaultTo(knex.fn.now());
    });

    await knex.schema.createTable('familia_miembros', (t) => {
        t.integer('familia_id').unsigned().notNullable().references('id').inTable('familias').onDelete('CASCADE');
        t.integer('usuario_id').unsigned().notNullable().references('id').inTable('usuarios').onDelete('CASCADE');
        t.enu('rol_en_familia', ['apoderado', 'alumno']).notNullable();
        t.primary(['familia_id', 'usuario_id']);
    });

    await knex.schema.createTable('consentimientos', (t) => {
        t.increments('id');
        // The person the data belongs to.
        t.integer('usuario_id').unsigned().notNullable().references('id').inTable('usuarios').onDelete('CASCADE');
        // Who accepted: the guardian for a minor; null when the person accepted it themselves.
        t.integer('otorgado_por_id').unsigned().references('id').inTable('usuarios').onDelete('SET NULL');
        t.enu('tipo', CONSENT_TYPES).notNullable();
        // Version of the text that was accepted, so a later wording change is traceable.
        t.string('version_texto', 20).notNullable();
        t.boolean('aceptado').notNullable();
        t.datetime('fecha').notNullable().defaultTo(knex.fn.now());
        t.datetime('revocado_en');
        t.index(['usuario_id', 'tipo']);
    });
};

exports.down = async function down(knex) {
    await knex.schema.dropTableIfExists('consentimientos');
    await knex.schema.dropTableIfExists('familia_miembros');
    await knex.schema.dropTableIfExists('familias');
    await knex.schema.dropTableIfExists('usuario_roles');
    // Remove the new roles unless a user still points at one through rol_id.
    await knex('roles')
        .whereIn('nombre', NEW_ROLES)
        .whereNotIn('id', knex('usuarios').distinct('rol_id'))
        .del();
};
