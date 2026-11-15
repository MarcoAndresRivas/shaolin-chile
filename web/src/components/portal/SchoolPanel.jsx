import { useCallback, useState } from 'react';
import { api } from '../../lib/client.js';
import { todayInChile, monthRange } from '../../lib/dates.js';
import AttendanceList from './AttendanceList.jsx';
import { formatTime, useApi } from './useApi.js';

const DAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

export default function SchoolPanel({ onUnauthorized }) {
  const sedes = useApi(useCallback(() => api.sedes(), []), onUnauthorized);
  const disciplinas = useApi(useCallback(() => api.disciplinas(), []), onUnauthorized);
  const clases = useApi(useCallback(() => api.clases(), []), onUnauthorized);
  const range = monthRange(todayInChile());
  const usuarios = useApi(useCallback(() => api.usuarios(), []), onUnauthorized);
  const [attendanceOf, setAttendanceOf] = useState(null);
  const sesiones = useApi(useCallback(() => api.sesiones(range), [range.desde, range.hasta]), onUnauthorized); // eslint-disable-line react-hooks/exhaustive-deps

  const [form, setForm] = useState({ sede_id: '', disciplina_id: '', dia_semana: '1', instructor_id: '', hora_inicio: '', hora_fin: '', cupo: '20' });
  const [notice, setNotice] = useState({ text: '', error: false });

  const run = async (action, success) => {
    setNotice({ text: '', error: false });
    try {
      const result = await action();
      setNotice({ text: typeof success === 'function' ? success(result) : success, error: false });
      clases.reload();
      sesiones.reload();
      return true;
    } catch (failure) {
      if (failure.status === 401) onUnauthorized();
      else setNotice({ text: failure.message, error: true });
      return false;
    }
  };

  const create = async (event) => {
    event.preventDefault();
    if (!form.sede_id || !form.disciplina_id || !form.hora_inicio || !form.hora_fin) {
      setNotice({ text: 'Elige sede y disciplina, y completa las horas.', error: true });
      return;
    }
    const payload = {
      sede_id: Number(form.sede_id),
      disciplina_id: Number(form.disciplina_id),
      dia_semana: Number(form.dia_semana),
      hora_inicio: form.hora_inicio,
      hora_fin: form.hora_fin,
      cupo: Number(form.cupo) || 20,
      ...(form.instructor_id && { instructor_id: Number(form.instructor_id) }),
    };
    await run(() => api.crearClase(payload), 'Clase creada.');
  };

  const generate = (item) =>
    run(
      () => api.generarSesiones(item.id, range.desde, range.hasta),
      ({ creadas }) => (creadas ? `Se crearon ${creadas} sesiones de este mes.` : 'Este mes ya tiene todas sus sesiones.'),
    );

  const remove = (item) => {
    const question = `¿Eliminar la clase de ${item.disciplina} del ${DAYS[item.dia_semana - 1]} en ${item.sede}? También se eliminan sus sesiones.`;
    if (window.confirm(question)) run(() => api.eliminarClase(item.id), 'Clase eliminada.');
  };

  const cancel = (item) => {
    const motivo = window.prompt(`Motivo para cancelar la sesión del ${item.fecha} (opcional):`);
    if (motivo !== null) run(() => api.cancelarSesion(item.id, motivo), 'Sesión cancelada.');
  };

  const field = (name) => ({
    id: `school-${name}`,
    value: form[name],
    onChange: (event) => setForm((current) => ({ ...current, [name]: event.target.value })),
  });

  return (
    <section className="panel panel--wide">
      <h2>Escuela: clases semanales y sesiones</h2>
      {notice.text && (
        <p className={notice.error ? 'alert' : 'success'} role="status">
          {notice.text}
        </p>
      )}

      <form className="schedule-form" onSubmit={create} noValidate>
        <div className="field">
          <label htmlFor="school-sede_id">Sede</label>
          <select {...field('sede_id')}>
            <option value="">Elige una</option>
            {sedes.data?.filter((s) => s.activa).map((s) => (
              <option key={s.id} value={s.id}>
                {s.ciudad}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="school-disciplina_id">Disciplina</label>
          <select {...field('disciplina_id')}>
            <option value="">Elige una</option>
            {disciplinas.data?.filter((d) => d.activa).map((d) => (
              <option key={d.id} value={d.id}>
                {d.nombre}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="school-instructor_id">Instructor (opcional)</label>
          <select {...field('instructor_id')}>
            <option value="">Sin asignar</option>
            {usuarios.data?.filter((u) => u.roles?.includes('Instructor')).map((u) => (
              <option key={u.id} value={u.id}>
                {u.nombre}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="school-dia_semana">Día</label>
          <select {...field('dia_semana')}>
            {DAYS.map((day, index) => (
              <option key={day} value={index + 1}>
                {day}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="school-cupo">Cupo</label>
          <input type="number" min="1" {...field('cupo')} />
        </div>
        <div className="field">
          <label htmlFor="school-hora_inicio">Inicio</label>
          <input type="time" {...field('hora_inicio')} />
        </div>
        <div className="field">
          <label htmlFor="school-hora_fin">Término</label>
          <input type="time" {...field('hora_fin')} />
        </div>
        <button className="btn btn--gold field--wide" type="submit">
          Crear clase semanal
        </button>
      </form>

      <h3>Clases semanales</h3>
      {clases.loading && <p className="muted">Cargando…</p>}
      {clases.error && <p className="alert">{clases.error}</p>}
      {clases.data?.length === 0 && <p className="muted">Aún no hay clases semanales.</p>}
      <ul className="list">
        {clases.data?.map((item) => (
          <li key={item.id} className="list__item">
            <div>
              <p className="list__title">
                {item.disciplina} · {item.sede}
              </p>
              <p className="muted">
                {DAYS[item.dia_semana - 1]} · {formatTime(item.hora_inicio)} – {formatTime(item.hora_fin)} · cupo {item.cupo}
                {item.instructor ? ` · ${item.instructor}` : ' · sin instructor'}
              </p>
            </div>
            <div className="list__actions">
              <button className="btn btn--gold btn--small" type="button" onClick={() => generate(item)}>
                Crear sesiones del mes
              </button>
              <button className="btn btn--ghost btn--small" type="button" onClick={() => remove(item)}>
                Eliminar
              </button>
            </div>
          </li>
        ))}
      </ul>

      <h3>Sesiones de {range.desde.slice(0, 7)}</h3>
      {sesiones.loading && <p className="muted">Cargando…</p>}
      {sesiones.error && <p className="alert">{sesiones.error}</p>}
      {sesiones.data?.length === 0 && <p className="muted">No hay sesiones este mes. Usa "Crear sesiones del mes" en una clase.</p>}
      <ul className="list">
        {sesiones.data?.map((item) => (
          <li key={item.id} className="list__item list__item--stack">
            <div className="list__row">
              <div>
                <p className="list__title">
                  {item.fecha} · {item.disciplina} · {item.sede}
                </p>
                <p className="muted">
                  {formatTime(item.hora_inicio)} – {formatTime(item.hora_fin)} · {item.reservas} de {item.cupo} cupos
                  {item.estado === 'cancelada' ? ` · cancelada${item.motivo ? `: ${item.motivo}` : ''}` : ''}
                </p>
              </div>
              {item.estado === 'cancelada' ? (
                <span className="tag">Cancelada</span>
              ) : (
                <div className="list__actions">
                  <button className="btn btn--gold btn--small" type="button" onClick={() => setAttendanceOf(attendanceOf === item.id ? null : item.id)}>
                    {attendanceOf === item.id ? 'Cerrar' : 'Asistencia'}
                  </button>
                  <button className="btn btn--ghost btn--small" type="button" onClick={() => cancel(item)}>
                    Cancelar
                  </button>
                </div>
              )}
            </div>
            {attendanceOf === item.id && <AttendanceList sesionId={item.id} onUnauthorized={onUnauthorized} />}
          </li>
        ))}
      </ul>
    </section>
  );
}
