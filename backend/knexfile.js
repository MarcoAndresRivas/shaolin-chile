// Knex configuration used by `npm run migrate` and the seed scripts.
// It reads the same variables as the server (see .env.example): a local
// SQLite file by default, or MySQL when DB_SERVER is set.
require('dotenv').config({ quiet: true });
const { loadDbConfig } = require('./src/config');
const { buildKnexConfig } = require('./src/db');

module.exports = buildKnexConfig(loadDbConfig(process.env));
