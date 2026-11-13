import { useState } from 'react';
import { api } from '../../lib/client.js';
import FamiliesPanel from './FamiliesPanel.jsx';
import LeadsPanel from './LeadsPanel.jsx';
import SchoolPanel from './SchoolPanel.jsx';
import { formatTime, useApi } from './useApi.js';

const DAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const EMPTY = { titulo: '', descripcion: '', dia_semana: 'Lunes', hora_inicio: '', hora_fin: '', cupo_maximo: '20' };

export default function AdminPanel({ onUnauthorized }) {
  const users = useApi(() => api.usuarios(), onUnauthorized);
  const schedules = useApi(() => api.horarios(), onUnauthorized);
  const [form, setForm] = useState(EMPTY);
  const [notice, setNotice] = useState({ text: '', error: false });

  const handle = async (action, success) => {
    setNotice({ text: '', error: false });
    try {
      await action();
      setNotice({ text: success, error: false });
      schedules.reload();
      return true;
    } catch (failure) {
      if (failure.status === 401) onUnauthorized();
      else setNotice({ text: failure.message, error: true });
      return false;
    }
  };

  const create = async (event) => {
    event.preventDefault();
    if (!form.titulo.trim() || !form.hora_inicio || !form.hora_fin) {
      setNotice({ text: 'Completa el título y las horas de inicio y término.', error: true });
      return;
    }
    if (form.hora_fin <= form.hora_inicio) {
      setNotice({ text: 'La hora de término debe ser posterior a la de inicio.', error: true });
      return;
    }
    const payload = { ...form, titulo: form.titulo.trim(), cupo_maximo: Number(form.cupo_maximo) || 20 };
    if (await handle(() => api.crearHorario(payload), 'Clase creada.')) setForm(EMPTY);
  };

  const remove = (item) => {
    const question = `¿Eliminar la clase "${item.titulo}" del ${item.dia_semana}? También se eliminarán las reservas de los alumnos.`;
    if (window.confirm(question)) {
      handle(() => api.eliminarHorario(item.id), 'Clase eliminada.');
    }
  };

  const field = (name) => ({
    id: `schedule-${name}`,
    value: form[name],
    onChange: (event) => setForm((current) => ({ ...current, [name]: event.target.value })),
  });

  return (
    <div className="portal__grid">
      <LeadsPanel onUnauthorized={onUnauthorized} />
      <SchoolPanel onUnauthorized={onUnauthorized} />
      <FamiliesPanel onUnauthorized={onUnauthorized} />
      <section className="panel">
        <h2>Clases</h2>
        {notice.text && (
          <p className={notice.error ? 'alert' : 'success'} role="status">
            {notice.text}
          </p>
        )}
        <form className="schedule-form" onSubmit={create} noValidate>
          <div className="field field--wide">
            <label htmlFor="schedule-titulo">Título</label>
            <input type="text" {...field('titulo')} />
          </div>
          <div className="field">
            <label htmlFor="schedule-dia_semana">Día</label>
            <select {...field('dia_semana')}>
              {DAYS.map((day) => (
                <option key={day}>{day}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="schedule-cupo_maximo">Cupo</label>
            <input type="number" min="1" {...field('cupo_maximo')} />
          </div>
          <div className="field">
            <label htmlFor="schedule-hora_inicio">Inicio</label>
            <input type="time" {...field('hora_inicio')} />
          </div>
          <div className="field">
            <label htmlFor="schedule-hora_fin">Término</label>
            <input type="time" {...field('hora_fin')} />
          </div>
          <div className="field field--wide">
            <label htmlFor="schedule-descripcion">Descripción (opcional)</label>
            <input type="text" {...field('descripcion')} />
          </div>
          <button className="btn btn--gold field--wide" type="submit">
            Crear clase
          </button>
        </form>

        {schedules.loading && <p className="muted">Cargando…</p>}
        {schedules.error && <p className="alert">{schedules.error}</p>}
        {schedules.data?.length === 0 && <p className="muted">No hay clases creadas.</p>}
        <ul className="list">
          {schedules.data?.map((item) => (
            <li key={item.id} className="list__item">
              <div>
                <p className="list__title">{item.titulo}</p>
                <p className="muted">
                  {item.dia_semana} · {formatTime(item.hora_inicio)} – {formatTime(item.hora_fin)} · cupo {item.cupo_maximo}
                </p>
              </div>
              <button className="btn btn--ghost btn--small" type="button" onClick={() => remove(item)}>
                Eliminar
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="panel">
        <h2>Usuarios</h2>
        {users.loading && <p className="muted">Cargando…</p>}
        {users.error && <p className="alert">{users.error}</p>}
        {users.data?.length === 0 && <p className="muted">No hay usuarios.</p>}
        <ul className="list">
          {users.data?.map((user) => (
            <li key={user.id} className="list__item">
              <div>
                <p className="list__title">{user.nombre}</p>
                <p className="muted">{user.email}</p>
              </div>
              <span className="tag">{user.roles?.length ? user.roles.join(' · ') : user.rol ?? 'Sin rol'}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
