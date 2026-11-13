// Knex configuration used by `npm run migrate` and the seed scripts.
// It reads the same DB_* variables as the server (see env.example).
require('dotenv').config({ quiet: true });
const path = require('node:path');
const { buildDbConfig } = require('./src/config');

module.exports = {
    client: 'mysql2',
    connection: { ...buildDbConfig(process.env), charset: 'utf8mb4' },
    migrations: {
        directory: path.join(__dirname, 'migrations'),
        tableName: 'knex_migrations',
    },
};
