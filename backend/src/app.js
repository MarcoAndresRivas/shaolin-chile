const express = require('express');
const cors = require('cors');

// Builds the Express app. `db` is a mysql2 pool (or any object with the same
// `execute` method), so tests can pass a stub instead of a real database.
function createApp({ config, db }) {
    const app = express();
    app.locals.config = config;

    const allowedOrigins = new Set(config.corsOrigins);
    app.use(cors({
        // Requests without an Origin header (curl, server-to-server) carry no
        // browser credentials, so CORS does not apply to them.
        origin: (origin, callback) => callback(null, !origin || allowedOrigins.has(origin)),
    }));
    app.use(express.json());

    app.use((req, res, next) => {
        req.db = db;
        next();
    });

    app.use('/api', require('../routes/auth'));
    app.use('/api/intranet', require('../routes/intranet'));

    return app;
}

module.exports = { createApp };
