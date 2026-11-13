const express = require('express');
const cors = require('cors');
const { createRateLimiter } = require('./rateLimit');

// Builds the Express app. `db` is a mysql2 pool (or any object with the same
// `execute` method), so tests can pass a stub instead of a real database.
function createApp({ config, db }) {
    const app = express();
    app.locals.config = config;
    // Render puts one proxy in front of the app: take the client IP from it, so
    // the form limit is per visitor and not for everyone behind the proxy.
    app.set('trust proxy', 1);

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

    // Interested people register from the public site: at most 5 requests per IP per hour.
    const rateLimit = createRateLimiter({ max: 5, windowMs: 60 * 60 * 1000 });
    app.use('/api', require('../routes/public')({ rateLimit }));
    app.use('/api', require('../routes/auth'));
    app.use('/api/intranet', require('../routes/intranet'));

    return app;
}

module.exports = { createApp };
