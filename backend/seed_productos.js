// Creates the products of the December seminar store. Usage: `npm run seed:productos`.
require('dotenv').config({ quiet: true });
const knexFactory = require('knex');
const { loadDbConfig } = require('./src/config');
const { buildKnexConfig } = require('./src/db');
const { seedProductos } = require('./src/seedProductos');

(async () => {
    const knex = knexFactory(buildKnexConfig(loadDbConfig()));
    try {
        const created = await seedProductos(knex);
        console.log(created.length ? `Creado: ${created.join('; ')}.` : 'Ya existían: no se cambió nada.');
    } catch (error) {
        console.error('No se pudieron crear los productos:', error.message);
        process.exitCode = 1;
    } finally {
        await knex.destroy();
    }
})();
