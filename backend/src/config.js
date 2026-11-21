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

    // Optional: without it the assistant routes stay off. A short key could be guessed.
    const asistenteApiKey = env.ASISTENTE_API_KEY || '';
    if (asistenteApiKey && asistenteApiKey.trim().length < 32) {
        throw new ConfigError('ASISTENTE_API_KEY must have at least 32 characters.');
    }

    return {
        port: Number(env.PORT) || 3000,
        jwtSecret,
        asistenteApiKey,
        // The AI model of the site's chat: any provider with the OpenAI chat format.
        asistenteModelo: {
            url: env.ASISTENTE_MODELO_URL || '',
            model: env.ASISTENTE_MODELO || '',
            key: env.ASISTENTE_MODELO_KEY || '',
            reasoning: env.ASISTENTE_MODELO_RAZONAMIENTO || '',
        },
        // Bank transfer details shown when someone buys a seminar or a course.
        // Each one is optional: the message leaves out what is not set.
        pago: {
            banco: env.PAGO_BANCO || '',
            tipoCuenta: env.PAGO_TIPO_CUENTA || '',
            numeroCuenta: env.PAGO_NUMERO_CUENTA || '',
            titular: env.PAGO_TITULAR || '',
            rut: env.PAGO_RUT || '',
            email: env.PAGO_EMAIL || '',
            // Where people send the receipt from the site, e.g. "por WhatsApp al +56 9 8615 7545".
            comprobanteA: env.PAGO_COMPROBANTE_A || '',
        },
        corsOrigins: parseOrigins(env.CORS_ORIGINS),
        ...loadDbConfig(env),
    };
}

module.exports = { loadConfig, loadDbConfig, buildDbConfig, ConfigError, DEFAULT_CORS_ORIGINS };
