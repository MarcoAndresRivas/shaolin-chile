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
    catalogo: () => request('GET', '/api/catalogo', undefined, { auth: false }),
    registrarInteresado: (data) => request('POST', '/api/interesados', data, { auth: false }),
    usuarios: () => request('GET', '/api/intranet/usuarios'),
    horarios: () => request('GET', '/api/intranet/horarios'),
    misReservas: () => request('GET', '/api/intranet/mis-reservas'),
    reservar: (horarioId) => request('POST', '/api/intranet/reservar', { horario_id: horarioId }),
    crearHorario: (horario) => request('POST', '/api/intranet/horarios', horario),
    eliminarHorario: (id) => request('DELETE', `/api/intranet/horarios/${id}`),
    sedes: () => request('GET', '/api/intranet/sedes'),
    disciplinas: () => request('GET', '/api/intranet/disciplinas'),
    clases: (sedeId) => request('GET', '/api/intranet/clases' + (sedeId ? `?sede_id=${sedeId}` : '')),
    crearClase: (clase) => request('POST', '/api/intranet/clases', clase),
    eliminarClase: (id) => request('DELETE', `/api/intranet/clases/${id}`),
    generarSesiones: (claseId, desde, hasta) => request('POST', `/api/intranet/clases/${claseId}/sesiones`, { desde, hasta }),
    sesiones: ({ desde, hasta } = {}) => {
      const query = new URLSearchParams();
      if (desde) query.set('desde', desde);
      if (hasta) query.set('hasta', hasta);
      return request('GET', '/api/intranet/sesiones' + (query.size ? `?${query}` : ''));
    },
    // With alumnoId, a guardian books or cancels for a student in their care.
    reservarSesion: (id, alumnoId) => request('POST', `/api/intranet/sesiones/${id}/reservar`, alumnoId ? { alumno_id: alumnoId } : undefined),
    cancelarReservaSesion: (id, alumnoId) => request('DELETE', `/api/intranet/sesiones/${id}/reservar`, alumnoId ? { alumno_id: alumnoId } : undefined),
    miFamilia: () => request('GET', '/api/intranet/familia/mia'),
    familias: () => request('GET', '/api/intranet/familias'),
    crearFamilia: (nombre) => request('POST', '/api/intranet/familias', { nombre }),
    eliminarFamilia: (id) => request('DELETE', `/api/intranet/familias/${id}`),
    agregarMiembro: (id, usuarioId, rol) => request('POST', `/api/intranet/familias/${id}/miembros`, { usuario_id: usuarioId, rol_en_familia: rol }),
    quitarMiembro: (id, usuarioId) => request('DELETE', `/api/intranet/familias/${id}/miembros/${usuarioId}`),
    misReservasSesiones: () => request('GET', '/api/intranet/reservas/mias'),
    asistencia: (id) => request('GET', `/api/intranet/sesiones/${id}/asistencia`),
    guardarAsistencia: (id, asistencias) => request('PUT', `/api/intranet/sesiones/${id}/asistencia`, { asistencias }),
    miAsistencia: () => request('GET', '/api/intranet/asistencia/mia'),
    disponibilidad: (instructorId) => request('GET', '/api/intranet/disponibilidad' + (instructorId ? `?instructor_id=${instructorId}` : '')),
    guardarDisponibilidad: (bloques, instructorId) =>
      request('PUT', '/api/intranet/disponibilidad', { bloques, ...(instructorId && { instructor_id: instructorId }) }),
    interesados: (estado) => request('GET', '/api/intranet/interesados' + (estado ? `?estado=${estado}` : '')),
    interesado: (id) => request('GET', `/api/intranet/interesados/${id}`),
    cambiarEstadoInteresado: (id, estado) => request('PUT', `/api/intranet/interesados/${id}`, { estado }),
    agregarSeguimiento: (id, nota) => request('POST', `/api/intranet/interesados/${id}/seguimientos`, { nota }),
    agendarClasePrueba: (id, sesionId) => request('POST', `/api/intranet/interesados/${id}/clase-prueba`, { sesion_id: sesionId }),
    resultadoClasePrueba: (id, estado) => request('PUT', `/api/intranet/clases-prueba/${id}`, { estado }),
    planes: (todos) => request('GET', '/api/intranet/planes' + (todos ? '?todos=1' : '')),
    crearPlan: (plan) => request('POST', '/api/intranet/planes', plan),
    suscribir: (suscripcion) => request('POST', '/api/intranet/suscripciones', suscripcion),
    generarCargos: (periodo, diaVencimiento) => request('POST', '/api/intranet/cargos/generar', { periodo, dia_vencimiento: diaVencimiento }),
    cuenta: (alumnoId) => request('GET', '/api/intranet/cuenta/mia' + (alumnoId ? `?alumno_id=${alumnoId}` : '')),
    informarPago: (cargoId, monto, referencia) => request('POST', `/api/intranet/cargos/${cargoId}/pagos`, { monto, referencia }),
    pagos: (estado) => request('GET', '/api/intranet/pagos' + (estado ? `?estado=${estado}` : '')),
    validarPago: (id) => request('PUT', `/api/intranet/pagos/${id}/validar`),
    rechazarPago: (id) => request('PUT', `/api/intranet/pagos/${id}/rechazar`),
    morosidad: (diasGracia) => request('GET', '/api/intranet/morosidad' + (diasGracia ? `?dias_gracia=${diasGracia}` : '')),
    grados: (disciplinaId) => request('GET', '/api/intranet/grados' + (disciplinaId ? `?disciplina_id=${disciplinaId}` : '')),
    crearGrado: (grado) => request('POST', '/api/intranet/grados', grado),
    ubicarAlumno: (alumnoId, gradoId, fecha) => request('POST', `/api/intranet/alumnos/${alumnoId}/grados`, { grado_id: gradoId, fecha }),
    progreso: (alumnoId) => request('GET', '/api/intranet/progreso/mio' + (alumnoId ? `?alumno_id=${alumnoId}` : '')),
    habilitados: () => request('GET', '/api/intranet/habilitados'),
    examenes: () => request('GET', '/api/intranet/examenes'),
    examen: (id) => request('GET', `/api/intranet/examenes/${id}`),
    crearExamen: (examen) => request('POST', '/api/intranet/examenes', examen),
    actualizarExamen: (id, estado) => request('PUT', `/api/intranet/examenes/${id}`, { estado }),
    nominar: (examenId, alumnoId, disciplinaId) => request('POST', `/api/intranet/examenes/${examenId}/nominaciones`, { alumno_id: alumnoId, disciplina_id: disciplinaId }),
    confirmarNominacion: (examenId, alumnoId) => request('PUT', `/api/intranet/examenes/${examenId}/nominaciones/${alumnoId}/confirmar`),
    guardarResultados: (examenId, resultados) => request('PUT', `/api/intranet/examenes/${examenId}/resultados`, { resultados }),
    cancelarSesion: (id, motivo) => request('POST', `/api/intranet/sesiones/${id}/cancelar`, { motivo }),
  };
}
