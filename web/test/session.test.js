import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSession, readSession, saveSession, clearSession, isAdmin, isStudent } from '../src/lib/session.js';

function memoryStorage() {
  const data = new Map();
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: (key) => data.delete(key),
  };
}

function tokenWith(payload) {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode(payload)}.signature`;
}

const NOW = 1_800_000_000_000;

test('a login response becomes a session with roles and token expiry', () => {
  const token = tokenWith({ id: 7, exp: NOW / 1000 + 3600 });
  const session = createSession({ token, nombre: 'Ana', roles: ['Alumno'], rol_id: 5 });
  assert.deepEqual(session, { token, name: 'Ana', roles: ['Alumno'], expiresAt: NOW + 3_600_000 });
});

test('a legacy response without roles maps rol_id to its role', () => {
  const token = tokenWith({ exp: NOW / 1000 + 60 });
  assert.deepEqual(createSession({ token, nombre: 'Admin', rol_id: 2 }).roles, ['Administrador']);
});

test('a saved session is read back until it expires', () => {
  const storage = memoryStorage();
  const session = createSession({ token: tokenWith({ exp: NOW / 1000 + 60 }), nombre: 'Ana', roles: ['Alumno'] });
  saveSession(session, storage);
  assert.deepEqual(readSession(storage, NOW), session);
  assert.equal(readSession(storage, NOW + 61_000), null);
  assert.equal(storage.getItem('shaolin_session'), null, 'an expired session is removed');
});

test('corrupt stored data is treated as no session', () => {
  const storage = memoryStorage();
  storage.setItem('shaolin_session', '{not json');
  assert.equal(readSession(storage, NOW), null);
});

test('clearSession removes the stored session', () => {
  const storage = memoryStorage();
  saveSession(createSession({ token: tokenWith({ exp: NOW / 1000 + 60 }), nombre: 'A', roles: [] }), storage);
  clearSession(storage);
  assert.equal(readSession(storage, NOW), null);
});

test('admin roles match the backend list; students are detected', () => {
  assert.equal(isAdmin({ roles: ['Director'] }), true);
  assert.equal(isAdmin({ roles: ['Desarrollador', 'Alumno'] }), true);
  assert.equal(isAdmin({ roles: ['Instructor'] }), false);
  assert.equal(isStudent({ roles: ['Alumno'] }), true);
  assert.equal(isStudent({ roles: ['Administrador'] }), false);
});
