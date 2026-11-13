// Client for the Express API (backend/). Every function returns the parsed
// JSON body or throws ApiError with the server's message.

const PRODUCTION_API = 'https://shaolin-chile-backend.onrender.com';
const LOCAL_API = 'http://localhost:3000';

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export function apiBaseUrl({ configured, hostname }) {
  if (configured) return configured.replace(/\/+$/, '');
  return hostname === 'localhost' || hostname === '127.0.0.1' ? LOCAL_API : PRODUCTION_API;
}

export function createApi({ baseUrl, fetchImpl = globalThis.fetch, getToken = () => null }) {
  // Intranet routes need a token. Without one the backend answers 403, so
  // fail early as 401 and let the portal send the user back to the login.
  async function request(method, path, body, { auth = true } = {}) {
    const headers = {};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    else if (auth) throw new ApiError('Tu sesión expiró. Ingresa de nuevo.', 401);

    let response;
    try {
      response = await fetchImpl(`${baseUrl}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      throw new ApiError('No se pudo conectar con el servidor.', 0);
    }

    let data = null;
    try {
      data = await response.json();
    } catch {
      data = null;
    }
    if (!response.ok) {
      throw new ApiError(data?.error ?? `Error del servidor (${response.status}).`, response.status);
    }
    return data;
  }

  return {
    login: (email, password) => request('POST', '/api/login', { email, password }, { auth: false }),
    usuarios: () => request('GET', '/api/intranet/usuarios'),
    horarios: () => request('GET', '/api/intranet/horarios'),
    misReservas: () => request('GET', '/api/intranet/mis-reservas'),
    reservar: (horarioId) => request('POST', '/api/intranet/reservar', { horario_id: horarioId }),
    crearHorario: (horario) => request('POST', '/api/intranet/horarios', horario),
    eliminarHorario: (id) => request('DELETE', `/api/intranet/horarios/${id}`),
  };
}
