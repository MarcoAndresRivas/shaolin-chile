// Central configuration. Every setting the server needs is read here, once,
// so a missing or unsafe value stops the server at startup instead of later.

const path = require('node:path');

const DEFAULT_CORS_ORIGINS = ['https://marcoandresrivas.github.io'];

// The secret the old code used when JWT_SECRET was missing. It is public
// (it was committed to the repository), so it must never be accepted.
const KNOWN_INSECURE_SECRETS = new Set(['fallback_secret']);

class ConfigError extends Error {
    constructor(message) {
        super(message);
        this.name = 'ConfigError';
    }
}

function parseOrigins(value) {
    if (!value || !value.trim()) return [...DEFAULT_CORS_ORIGINS];
    return value
        .split(',')
        .map((origin) => origin.trim().replace(/\/+$/, ''))
        .filter(Boolean);
}

function buildDbConfig(env) {
    const db = {
        host: env.DB_SERVER || 'localhost',
        user: env.DB_USER || 'root',
        password: env.DB_PASSWORD || '',
        database: env.DB_DATABASE || 'shaolin_chile',
        port: Number(env.DB_PORT) || 3306,
    };
    if (env.DB_SSL === 'true' || (env.DB_SERVER && env.DB_SERVER.includes('aivencloud'))) {
        db.ssl = { rejectUnauthorized: false };
    }
    return db;
}

const DB_CLIENTS = ['sqlite', 'mysql'];
const DEFAULT_SQLITE_FILE = path.join(__dirname, '..', 'data', 'shaolin.db');

// Database settings only (no JWT_SECRET needed), shared by the server,
// the migrations and the seed scripts. Without DB_SERVER the backend uses a
// local SQLite file; DB_CLIENT forces either one.
function loadDbConfig(env = process.env) {
    const dbClient = env.DB_CLIENT || (env.DB_SERVER ? 'mysql' : 'sqlite');
    if (!DB_CLIENTS.includes(dbClient)) {
        throw new ConfigError(`DB_CLIENT must be one of: ${DB_CLIENTS.join(', ')}.`);
    }
    return {
        dbClient,
        sqliteFile: env.SQLITE_FILE || DEFAULT_SQLITE_FILE,
        db: buildDbConfig(env),
    };
}

function loadConfig(env = process.env) {
    // Used verbatim: trimming would change the signing key of a deployed secret.
    const jwtSecret = env.JWT_SECRET || '';
    if (!jwtSecret.trim()) {
        throw new ConfigError('JWT_SECRET is not set. The server refuses to start without it.');
    }
    if (KNOWN_INSECURE_SECRETS.has(jwtSecret.trim())) {
        throw new ConfigError('JWT_SECRET uses a known public value. Set a new random secret.');
    }

    return {
        port: Number(env.PORT) || 3000,
        jwtSecret,
        corsOrigins: parseOrigins(env.CORS_ORIGINS),
        ...loadDbConfig(env),
    };
}

module.exports = { loadConfig, loadDbConfig, buildDbConfig, ConfigError, DEFAULT_CORS_ORIGINS };
