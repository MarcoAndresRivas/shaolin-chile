// Loads the Duan Pin ladder for Kung Fu Tradicional. Usage: `npm run seed:duanpin`.
require('dotenv').config({ quiet: true });
const knexFactory = require('knex');
const { loadDbConfig } = require('./src/config');
const { buildKnexConfig } = require('./src/db');
const { seedDuanPin } = require('./src/seedDuanPin');

(async () => {
    const knex = knexFactory(buildKnexConfig(loadDbConfig()));
    try {
        const { disciplina, creados } = await seedDuanPin(knex);
        console.log(creados ? `Creados ${creados} niveles Duan Pin en ${disciplina}.` : `${disciplina} ya tenía grados: no se cambió nada.`);
    } catch (error) {
        console.error('No se pudieron crear los niveles:', error.message);
        process.exitCode = 1;
    } finally {
        await knex.destroy();
    }
})();
