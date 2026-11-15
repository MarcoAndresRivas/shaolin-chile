// Client-side session for the portal: the JWT from /api/login plus the
// fields the UI needs. The server still checks every request; this only
// decides what to show.

const STORAGE_KEY = 'shaolin_session';

// Must match ADMIN_ROLES in backend/middleware/authMiddleware.js.
const ADMIN_ROLES = ['Director', 'Administrador', 'Desarrollador'];

// Tokens issued before multi-role support only carry rol_id.
const LEGACY_ROLES = { 1: 'Desarrollador', 2: 'Administrador', 3: 'Colaborador', 4: 'Externo', 5: 'Alumno' };

function decodeTokenPayload(token) {
  const part = String(token).split('.')[1];
  if (!part) throw new Error('Malformed token');
  const base64 = part.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(part.length / 4) * 4, '=');
  const json = new TextDecoder().decode(Uint8Array.from(atob(base64), (c) => c.charCodeAt(0)));
  return JSON.parse(json);
}

export function createSession({ token, nombre, roles, rol_id }) {
  const { exp, id } = decodeTokenPayload(token);
  const resolvedRoles = Array.isArray(roles) ? roles : LEGACY_ROLES[rol_id] ? [LEGACY_ROLES[rol_id]] : [];
  return { token, name: nombre, roles: resolvedRoles, expiresAt: exp * 1000, ...(id !== undefined && { userId: id }) };
}

export function saveSession(session, storage = globalThis.localStorage) {
  storage.setItem(STORAGE_KEY, JSON.stringify(session));
}

export function readSession(storage = globalThis.localStorage, now = Date.now()) {
  let session;
  try {
    session = JSON.parse(storage.getItem(STORAGE_KEY));
  } catch {
    return null;
  }
  if (!session || typeof session.token !== 'string') return null;
  if (!(session.expiresAt > now)) {
    storage.removeItem(STORAGE_KEY);
    return null;
  }
  return session;
}

export function clearSession(storage = globalThis.localStorage) {
  storage.removeItem(STORAGE_KEY);
}

export const isAdmin = (session) => session.roles.some((role) => ADMIN_ROLES.includes(role));
export const isStudent = (session) => session.roles.includes('Alumno');
export const isInstructor = (session) => session.roles.includes('Instructor');
export const isGuardian = (session) => session.roles.includes('Apoderado');
