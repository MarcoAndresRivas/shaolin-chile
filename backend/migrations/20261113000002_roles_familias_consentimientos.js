// Phase 0 of the master plan: users can hold several roles, guardians group
// students into families, and each consent is stored with who gave it and when.
//
// usuarios.rol_id is kept for compatibility with the current frontend; the
// source of truth for permissions is usuario_roles from now on.
//
// MySQL commits DDL immediately, so a failed run can leave some tables or rows
// behind without recording the migration. Every step below is safe to repeat,
// so running `npm run migrate` again after a failure finishes the job.

const { isUnsignedKey, foreignId, createTableIfMissing } = require('../src/db/schemaHelpers');

const NEW_ROLES = ['Director', 'Instructor', 'Encargado de catálogo', 'Encargado de contenido', 'Apoderado'];

const CONSENT_TYPES = ['datos_salud', 'uso_imagen', 'comunicaciones', 'exencion_responsabilidad'];

exports.up = async function up(knex) {
    const existing = new Set(await knex('roles').pluck('nombre'));
    const missing = NEW_ROLES.filter((nombre) => !existing.has(nombre));
    if (missing.length) await knex('roles').insert(missing.map((nombre) => ({ nombre })));

    const usuariosUnsigned = await isUnsignedKey(knex, 'usuarios');
    const rolesUnsigned = await isUnsignedKey(knex, 'roles');

    await createTableIfMissing(knex, 'usuario_roles', (t) => {
        foreignId(t, 'usuario_id', usuariosUnsigned).notNullable().references('id').inTable('usuarios').onDelete('CASCADE');
        foreignId(t, 'rol_id', rolesUnsigned).notNullable().references('id').inTable('roles');
        t.primary(['usuario_id', 'rol_id']);
    });
    // Every existing user keeps the role they have today.
    await knex.raw(`
        INSERT INTO usuario_roles (usuario_id, rol_id)
        SELECT u.id, u.rol_id FROM usuarios u
        WHERE NOT EXISTS (
            SELECT 1 FROM usuario_roles ur WHERE ur.usuario_id = u.id AND ur.rol_id = u.rol_id
        )
    `);

    await createTableIfMissing(knex, 'familias', (t) => {
        t.increments('id');
        t.string('nombre', 255).notNullable();
        t.datetime('fecha_creacion').defaultTo(knex.fn.now());
    });
    const familiasUnsigned = await isUnsignedKey(knex, 'familias');

    await createTableIfMissing(knex, 'familia_miembros', (t) => {
        foreignId(t, 'familia_id', familiasUnsigned).notNullable().references('id').inTable('familias').onDelete('CASCADE');
        foreignId(t, 'usuario_id', usuariosUnsigned).notNullable().references('id').inTable('usuarios').onDelete('CASCADE');
        t.enu('rol_en_familia', ['apoderado', 'alumno']).notNullable();
        t.primary(['familia_id', 'usuario_id']);
    });

    await createTableIfMissing(knex, 'consentimientos', (t) => {
        t.increments('id');
        // The person the data belongs to.
        foreignId(t, 'usuario_id', usuariosUnsigned).notNullable().references('id').inTable('usuarios').onDelete('CASCADE');
        // Who accepted: the guardian for a minor; null when the person accepted it themselves.
        // RESTRICT: deleting the guardian must never make a consent look self-given.
        foreignId(t, 'otorgado_por_id', usuariosUnsigned).references('id').inTable('usuarios').onDelete('RESTRICT');
        t.enu('tipo', CONSENT_TYPES).notNullable();
        // Version of the text that was accepted, so a later wording change is traceable.
        t.string('version_texto', 20).notNullable();
        t.boolean('aceptado').notNullable();
        t.datetime('fecha').notNullable().defaultTo(knex.fn.now());
        t.datetime('revocado_en');
        t.index(['usuario_id', 'tipo']);
    });
};

// Tables whose rows are legal records or user data that a rollback would destroy.
const PROTECTED_TABLES = ['consentimientos', 'familias'];

exports.down = async function down(knex) {
    for (const table of PROTECTED_TABLES) {
        if ((await knex.schema.hasTable(table)) && (await knex(table).first())) {
            throw new Error(`Refusing to roll back: ${table} has data. Back it up and empty it by hand first.`);
        }
    }
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
