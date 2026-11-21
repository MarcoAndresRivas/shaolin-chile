const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { withServer } = require('./helpers');

test('Vercel handler serves the API from environment settings', async () => {
    process.env.DB_CLIENT = 'sqlite';
    process.env.SQLITE_FILE = ':memory:';
    process.env.JWT_SECRET = 'a-long-random-secret-used-only-in-tests-0123456789';
    process.env.CORS_ORIGINS = 'https://shaolin-chile.vercel.app';
    const handler = require('../../api/index.js');
    const server = express().use((req, res) => handler(req, res));

    await withServer(server, async (baseUrl) => {
        const res = await fetch(`${baseUrl}/api/login`, {
            method: 'OPTIONS',
            headers: { Origin: 'https://shaolin-chile.vercel.app', 'Access-Control-Request-Method': 'POST' },
        });
        assert.equal(res.headers.get('access-control-allow-origin'), 'https://shaolin-chile.vercel.app');
    });
});
