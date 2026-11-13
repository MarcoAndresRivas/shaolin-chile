// Central configuration. Every setting the server needs is read here, once,
// so a missing or unsafe value stops the server at startup instead of later.

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
        db: buildDbConfig(env),
    };
}

module.exports = { loadConfig, buildDbConfig, ConfigError, DEFAULT_CORS_ORIGINS };
