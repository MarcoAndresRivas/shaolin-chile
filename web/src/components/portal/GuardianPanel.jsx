import { useCallback, useState } from 'react';
import { api } from '../../lib/client.js';
import { addDays, todayInChile } from '../../lib/dates.js';
import AccountPanel from './AccountPanel.jsx';
import { formatTime, useApi } from './useApi.js';

// The students in the guardian's care: their next bookings and attendance, and
// booking or cancelling on their behalf.
export default function GuardianPanel({ onUnauthorized }) {
  const family = useApi(useCallback(() => api.miFamilia(), []), onUnauthorized);
  const today = todayInChile();
  const range = { desde: today, hasta: addDays(today, 21) };
  const sesiones = useApi(useCallback(() => api.sesiones(range), [range.desde, range.hasta]), onUnauthorized); // eslint-disable-line react-hooks/exhaustive-deps
  const [choice, setChoice] = useState({}); // student id -> sesion id
  const [notice, setNotice] = useState({ text: '', error: false });

  const act = async (action, success) => {
    setNotice({ text: '', error: false });
    try {
      await action();
      setNotice({ text: success, error: false });
      family.reload();
      sesiones.reload();
    } catch (failure) {
      if (failure.status === 401) onUnauthorized();
      else setNotice({ text: failure.message, error: true });
    }
  };

  const upcoming = sesiones.data?.filter((s) => s.estado === 'programada' && s.reservas < s.cupo) ?? [];

  return (
    <section className="panel panel--wide">
      <h2>Mi familia</h2>
      {notice.text && (
        <p className={notice.error ? 'alert' : 'success'} role="status">
          {notice.text}
        </p>
      )}
      {family.loading && !family.data && <p className="muted">Cargando…</p>}
      {family.error && <p className="alert">{family.error}</p>}
      {family.data?.length === 0 && <p className="muted">Todavía no tienes alumnos a tu cargo. La administración los asocia a tu cuenta.</p>}

      {family.data?.map((group) => (
        <div key={group.id}>
          <h3>{group.nombre}</h3>
          {group.representados.length === 0 && <p className="muted">Esta familia aún no tiene alumnos.</p>}
          {group.representados.map((student) => (
            <div key={student.usuario_id} className="panel panel--nested">
              <div className="list__row">
                <p className="list__title">{student.nombre}</p>
                <span className="tag">
                  {student.asistencia.asistidas} de {student.asistencia.clases} clases asistidas
                </span>
              </div>

              {student.proximas_reservas.length === 0 && <p className="muted">Sin reservas próximas.</p>}
              <ul className="list">
                {student.proximas_reservas.map((r) => (
                  <li key={r.sesion_id} className="list__item">
                    <div>
                      <p className="list__title">
                        {r.fecha} · {r.disciplina} · {r.sede}
                      </p>
                      <p className="muted">
                        {formatTime(r.hora_inicio)} – {formatTime(r.hora_fin)}
                      </p>
                    </div>
                    <button className="btn btn--ghost btn--small" type="button" onClick={() => act(() => api.cancelarReservaSesion(r.sesion_id, student.usuario_id), 'Reserva cancelada.')}>
                      Cancelar
                    </button>
                  </li>
                ))}
              </ul>

              <div className="availability-row availability-row--two">
                <select
                  aria-label={`Clase para ${student.nombre}`}
                  value={choice[student.usuario_id] ?? ''}
                  onChange={(e) => setChoice((current) => ({ ...current, [student.usuario_id]: e.target.value }))}
                >
                  <option value="">Elige una clase</option>
                  {upcoming.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.fecha} · {s.disciplina} · {s.sede} · {formatTime(s.hora_inicio)}
                    </option>
                  ))}
                </select>
                <button
                  className="btn btn--gold btn--small"
                  type="button"
                  disabled={!choice[student.usuario_id]}
                  onClick={() => act(() => api.reservarSesion(Number(choice[student.usuario_id]), student.usuario_id), `Reserva confirmada para ${student.nombre}.`)}
                >
                  Reservar
                </button>
              </div>
              <AccountPanel alumnoId={student.usuario_id} title={`Cuenta de ${student.nombre}`} onUnauthorized={onUnauthorized} />
            </div>
          ))}
        </div>
      ))}
    </section>
  );
}
