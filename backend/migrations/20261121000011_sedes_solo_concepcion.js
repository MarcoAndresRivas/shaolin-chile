// The school trains only in Concepción: the Santiago and Talca sedes stop being
// offered in the public trial class form. They are deactivated, not deleted, so
// classes, leads and history that point at them stay intact.
//
// Safe to repeat.

const CITIES = ['Santiago', 'Talca'];

exports.up = async function up(knex) {
    await knex('sedes').whereIn('ciudad', CITIES).update({ activa: false });
};

exports.down = async function down(knex) {
    await knex('sedes').whereIn('ciudad', CITIES).update({ activa: true });
};
