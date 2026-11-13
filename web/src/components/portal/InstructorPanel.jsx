import { useCallback, useState } from 'react';
import { api } from '../../lib/client.js';
import { addDays, todayInChile } from '../../lib/dates.js';
import AttendanceList from './AttendanceList.jsx';
import { formatTime, useApi } from './useApi.js';

// The instructor's own sesiones: the last week and the next two.
export default function InstructorPanel({ userId, onUnauthorized }) {
  const today = todayInChile();
  const range = { desde: addDays(today, -7), hasta: addDays(today, 14) };
  const sesiones = useApi(useCallback(() => api.sesiones(range), [range.desde, range.hasta]), onUnauthorized); // eslint-disable-line react-hooks/exhaustive-deps
  const [open, setOpen] = useState(null);

  const mine = sesiones.data?.filter((s) => s.instructor_id === userId && s.estado === 'programada') ?? [];

  return (
    <section className="panel panel--wide">
      <h2>Mis clases</h2>
      {sesiones.loading && <p className="muted">Cargando…</p>}
      {sesiones.error && <p className="alert">{sesiones.error}</p>}
      {sesiones.data && mine.length === 0 && (
        <p className="muted">No tienes sesiones asignadas en estas fechas. La administración te asigna a una clase semanal.</p>
      )}
      <ul className="list">
        {mine.map((item) => (
          <li key={item.id} className="list__item list__item--stack">
            <div className="list__row">
              <div>
                <p className="list__title">
                  {item.fecha} · {item.disciplina} · {item.sede}
                </p>
                <p className="muted">
                  {formatTime(item.hora_inicio)} – {formatTime(item.hora_fin)} · {item.reservas} de {item.cupo} cupos reservados
                </p>
              </div>
              <button className="btn btn--gold btn--small" type="button" onClick={() => setOpen(open === item.id ? null : item.id)}>
                {open === item.id ? 'Cerrar' : 'Asistencia'}
              </button>
            </div>
            {open === item.id && <AttendanceList sesionId={item.id} onUnauthorized={onUnauthorized} />}
          </li>
        ))}
      </ul>
    </section>
  );
}
