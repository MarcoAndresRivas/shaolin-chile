require('dotenv').config({ quiet: true });
const { loadConfig } = require('./src/config');
const { createApp } = require('./src/app');
const { createDatabase } = require('./src/db');

async function main() {
    let config;
    try {
        config = loadConfig(process.env);
    } catch (error) {
        console.error(`Configuration error: ${error.message}`);
        process.exit(1);
    }

    const database = await createDatabase(config);
    const app = createApp({ config, db: database.db });

    app.listen(config.port, async () => {
        console.log(`Server is running on port ${config.port}`);
        const target = config.dbClient === 'sqlite' ? `SQLite file ${config.sqliteFile}` : 'the MySQL database';
        try {
            await database.ping();
            console.log(`Connected to ${target}.`);
        } catch (err) {
            console.error(`Error connecting to ${target}:`, err.message);
        }
    });
}

main().catch((error) => {
    console.error('Startup failed:', error);
    process.exit(1);
});
