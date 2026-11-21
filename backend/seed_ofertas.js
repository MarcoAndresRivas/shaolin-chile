// Creates the first seminar and the test course. Usage: `npm run seed:ofertas`.
require('dotenv').config({ quiet: true });
const knexFactory = require('knex');
const { loadDbConfig } = require('./src/config');
const { buildKnexConfig } = require('./src/db');
const { seedOfertas } = require('./src/seedOfertas');

(async () => {
    const knex = knexFactory(buildKnexConfig(loadDbConfig()));
    try {
        const created = await seedOfertas(knex);
        console.log(created.length ? `Creado: ${created.join('; ')}.` : 'Ya existían: no se cambió nada.');
    } catch (error) {
        console.error('No se pudieron crear las ofertas:', error.message);
        process.exitCode = 1;
    } finally {
        await knex.destroy();
    }
})();
