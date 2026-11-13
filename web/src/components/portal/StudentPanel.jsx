import { useState } from 'react';
import { api } from '../../lib/client.js';
import { formatTime, useApi } from './useApi.js';

export default function StudentPanel({ onUnauthorized }) {
  const schedules = useApi(() => api.horarios(), onUnauthorized);
  const bookings = useApi(() => api.misReservas(), onUnauthorized);
  const [notice, setNotice] = useState({ text: '', error: false });

  const book = async (id) => {
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

  return (
    <div className="portal__grid">
      <section className="panel">
        <h2>Clases disponibles</h2>
        {notice.text && (
          <p className={notice.error ? 'alert' : 'success'} role="status">
            {notice.text}
          </p>
        )}
        {schedules.loading && <p className="muted">Cargando…</p>}
        {schedules.error && <p className="alert">{schedules.error}</p>}
        {schedules.data?.length === 0 && <p className="muted">Todavía no hay clases publicadas.</p>}
        <ul className="list">
          {schedules.data?.map((item) => (
            <li key={item.id} className="list__item">
              <div>
                <p className="list__title">{item.titulo}</p>
                <p className="muted">
                  {item.dia_semana} · {formatTime(item.hora_inicio)} – {formatTime(item.hora_fin)}
                  {item.profesor ? ` · ${item.profesor}` : ''}
                </p>
              </div>
              <button className="btn btn--gold btn--small" type="button" onClick={() => book(item.id)}>
                Reservar
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="panel">
        <h2>Mis reservas</h2>
        {bookings.loading && <p className="muted">Cargando…</p>}
        {bookings.error && <p className="alert">{bookings.error}</p>}
        {bookings.data?.length === 0 && <p className="muted">Aún no tienes reservas.</p>}
        <ul className="list">
          {bookings.data?.map((item, index) => (
            <li key={`${item.titulo}-${item.dia_semana}-${index}`} className="list__item">
              <div>
                <p className="list__title">{item.titulo}</p>
                <p className="muted">
                  {item.dia_semana} · {formatTime(item.hora_inicio)} – {formatTime(item.hora_fin)}
                </p>
              </div>
              <span className="tag">{item.estado}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
