import { useCallback, useState } from 'react';
import { api } from '../../lib/client.js';
import { addDays, todayInChile } from '../../lib/dates.js';
import AccountPanel from './AccountPanel.jsx';
import { formatTime, useApi } from './useApi.js';

export default function StudentPanel({ onUnauthorized }) {
  const today = todayInChile();
  const range = { desde: today, hasta: addDays(today, 21) };
  const sesiones = useApi(useCallback(() => api.sesiones(range), [range.desde, range.hasta]), onUnauthorized); // eslint-disable-line react-hooks/exhaustive-deps
  const attendance = useApi(useCallback(() => api.miAsistencia(), []), onUnauthorized);
  // Schedules of the previous system, kept until the school moves to sessions.
  const schedules = useApi(useCallback(() => api.horarios(), []), onUnauthorized);
  const bookings = useApi(useCallback(() => api.misReservas(), []), onUnauthorized);
  const [notice, setNotice] = useState({ text: '', error: false });

  const act = async (action, success) => {
    setNotice({ text: '', error: false });
    try {
      await action();
      setNotice({ text: success, error: false });
      sesiones.reload();
    } catch (failure) {
      if (failure.status === 401) return onUnauthorized();
      setNotice({ text: failure.message, error: true });
    }
  };

  const bookLegacy = async (id) => {
    setNotice({ text: '', error: false });
    try {
      const { message } = await api.reservar(id);
      setNotice({ text: message, error: false });
      bookings.reload();
    } catch (failure) {
      if (failure.status === 401) return onUnauthorized();
      setNotice({ text: failure.message, error: true });
    }
  };

  const upcoming = sesiones.data?.filter((s) => s.estado === 'programada') ?? [];

  return (
    <div className="portal__grid">
      <section className="panel panel--wide">
        <h2>Próximas clases</h2>
        {notice.text && (
          <p className={notice.error ? 'alert' : 'success'} role="status">
            {notice.text}
          </p>
        )}
        {sesiones.loading && <p className="muted">Cargando…</p>}
        {sesiones.error && <p className="alert">{sesiones.error}</p>}
        {sesiones.data && upcoming.length === 0 && <p className="muted">Todavía no hay clases publicadas para las próximas semanas.</p>}
        <ul className="list">
          {upcoming.map((item) => {
            const full = item.reservas >= item.cupo;
            return (
              <li key={item.id} className="list__item">
                <div>
                  <p className="list__title">
                    {item.fecha} · {item.disciplina} · {item.sede}
                  </p>
                  <p className="muted">
                    {formatTime(item.hora_inicio)} – {formatTime(item.hora_fin)} · {item.reservas} de {item.cupo} cupos
                    {item.instructor ? ` · ${item.instructor}` : ''}
                  </p>
                </div>
                {item.reservada ? (
                  <button className="btn btn--ghost btn--small" type="button" onClick={() => act(() => api.cancelarReservaSesion(item.id), 'Reserva cancelada.')}>
                    Cancelar reserva
                  </button>
                ) : (
                  <button
                    className="btn btn--gold btn--small"
                    type="button"
                    disabled={full}
                    onClick={() => act(() => api.reservarSesion(item.id), 'Reserva confirmada.')}
                  >
                    {full ? 'Llena' : 'Reservar'}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <AccountPanel onUnauthorized={onUnauthorized} />

      <section className="panel">
        <h2>Mi asistencia</h2>
        {attendance.loading && <p className="muted">Cargando…</p>}
        {attendance.error && <p className="alert">{attendance.error}</p>}
        {attendance.data && (
          <>
            <p className="portal__hello">
              {attendance.data.resumen.asistidas} de {attendance.data.resumen.clases}
            </p>
            <p className="muted">clases registradas con asistencia</p>
            <ul className="list">
              {attendance.data.detalle.slice(0, 8).map((item) => (
                <li key={`${item.fecha}-${item.disciplina}`} className="list__item">
                  <p className="list__title">
                    {item.fecha} · {item.disciplina}
                  </p>
                  <span className="tag">{item.presente ? 'Presente' : 'Ausente'}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      {schedules.data?.length > 0 && (
        <section className="panel">
          <h2>Horarios anteriores</h2>
          <p className="muted">Sistema previo de reservas, mientras la escuela pasa a las clases nuevas.</p>
          <ul className="list">
            {schedules.data.map((item) => (
              <li key={item.id} className="list__item">
                <div>
                  <p className="list__title">{item.titulo}</p>
                  <p className="muted">
                    {item.dia_semana} · {formatTime(item.hora_inicio)} – {formatTime(item.hora_fin)}
                  </p>
                </div>
                <button className="btn btn--gold btn--small" type="button" onClick={() => bookLegacy(item.id)}>
                  Reservar
                </button>
              </li>
            ))}
          </ul>
          {bookings.data?.length > 0 && (
            <>
              <h3>Mis reservas anteriores</h3>
              <ul className="list">
                {bookings.data.map((item, index) => (
                  <li key={`${item.titulo}-${item.dia_semana}-${index}`} className="list__item">
                    <p className="list__title">{item.titulo}</p>
                    <span className="tag">{item.estado}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}
    </div>
  );
}
