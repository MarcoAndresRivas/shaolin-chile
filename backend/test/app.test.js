const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');
const { spawnSync } = require('node:child_process');
const { createApp } = require('../src/app');
const { withServer } = require('./helpers');

const config = {
    jwtSecret: 'a-long-random-secret-used-only-in-tests-0123456789',
    corsOrigins: ['https://marcoandresrivas.github.io'],
};
const stubDb = { execute: async () => [[]] };

test('CORS allows the configured site origin', async () => {
    await withServer(createApp({ config, db: stubDb }), async (baseUrl) => {
        const res = await fetch(`${baseUrl}/api/login`, {
            method: 'OPTIONS',
            headers: { Origin: 'https://marcoandresrivas.github.io', 'Access-Control-Request-Method': 'POST' },
        });
        assert.equal(res.headers.get('access-control-allow-origin'), 'https://marcoandresrivas.github.io');
    });
});

test('CORS does not allow an unknown origin', async () => {
    await withServer(createApp({ config, db: stubDb }), async (baseUrl) => {
        const res = await fetch(`${baseUrl}/api/login`, {
            method: 'OPTIONS',
            headers: { Origin: 'https://evil.example.com', 'Access-Control-Request-Method': 'POST' },
        });
        assert.equal(res.headers.get('access-control-allow-origin'), null);
    });
});

test('the server refuses to start without JWT_SECRET', () => {
    // Run from an empty directory so dotenv cannot load a local .env file.
    const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shaolin-start-'));
    try {
        const env = { ...process.env };
        delete env.JWT_SECRET;
        const result = spawnSync(process.execPath, [path.join(__dirname, '..', 'index.js')], {
            cwd: emptyDir,
            env,
            encoding: 'utf8',
            timeout: 10000,
        });
        assert.equal(result.status, 1);
        assert.match(result.stderr, /JWT_SECRET/);
        assert.doesNotMatch(result.stdout, /Server is running/);
    } finally {
        fs.rmSync(emptyDir, { recursive: true, force: true });
    }
});
