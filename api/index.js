// Vercel serverless entry: the same Express app as index.js, without listen().
// The database pool is created once per warm instance and reused.
const { loadConfig } = require('../backend/src/config');
const { createApp } = require('../backend/src/app');
const { createDatabase } = require('../backend/src/db');

let appPromise;

function getApp() {
    appPromise ??= (async () => {
        const config = loadConfig(process.env);
        const database = await createDatabase(config);
        return createApp({ config, db: database.db });
    })().catch((error) => {
        appPromise = undefined; // let the next request retry instead of failing forever
        throw error;
    });
    return appPromise;
}

module.exports = async (req, res) => {
    try {
        const app = await getApp();
        return app(req, res);
    } catch (error) {
        console.error('Startup failed:', error);
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'Server is not configured' }));
    }
};
