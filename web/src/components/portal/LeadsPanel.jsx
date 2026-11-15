import { useCallback, useState } from 'react';
import { api } from '../../lib/client.js';
import { addDays, todayInChile } from '../../lib/dates.js';
import { formatTime, useApi } from './useApi.js';

const ESTADOS = [
  ['nuevo', 'Nuevo'],
  ['contactado', 'Contactado'],
  ['clase_prueba', 'Clase de prueba'],
  ['inscrito', 'Inscrito'],
  ['descartado', 'Descartado'],
];
const LABEL = Object.fromEntries(ESTADOS);
const TRIAL_RESULTS = [
  ['asistio', 'Asistió'],
  ['no_asistio', 'No asistió'],
  ['cancelada', 'Cancelada'],
];

function LeadDetail({ id, onChanged, onUnauthorized }) {
  const detail = useApi(useCallback(() => api.interesado(id), [id]), onUnauthorized);
  const today = todayInChile();
  const range = { desde: today, hasta: addDays(today, 30) };
  const sesiones = useApi(useCallback(() => api.sesiones(range), [range.desde, range.hasta]), onUnauthorized); // eslint-disable-line react-hooks/exhaustive-deps
  const [note, setNote] = useState('');
  const [sesionId, setSesionId] = useState('');
  const [notice, setNotice] = useState({ text: '', error: false });

  const run = async (action, success) => {
    setNotice({ text: '', error: false });
    try {
      await action();
      setNotice({ text: success, error: false });
      detail.reload();
      onChanged();
      return true;
    } catch (failure) {
      if (failure.status === 401) onUnauthorized();
      else setNotice({ text: failure.message, error: true });
      return false;
    }
  };

  if (detail.loading && !detail.data) return <p className="muted">Cargando…</p>;
  if (detail.error) return <p className="alert">{detail.error}</p>;
  const lead = detail.data;
  const upcoming = sesiones.data?.filter((s) => s.estado === 'programada') ?? [];

  return (
    <div className="lead">
      {notice.text && (
        <p className={notice.error ? 'alert' : 'success'} role="status">
          {notice.text}
        </p>
      )}
      <p className="muted">
        {lead.email}
        {lead.telefono ? ` · ${lead.telefono}` : ''} · origen: {lead.origen}
      </p>
      {lead.mensaje && <p>“{lead.mensaje}”</p>}

      <div className="field">
        <label htmlFor={`lead-estado-${id}`}>Estado</label>
        <select id={`lead-estado-${id}`} value={lead.estado} onChange={(e) => run(() => api.cambiarEstadoInteresado(id, e.target.value), 'Estado actualizado.')}>
          {ESTADOS.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      <h3>Clase de prueba</h3>
      <ul className="list">
        {lead.clases_prueba.map((trial) => (
          <li key={trial.id} className="list__item">
            <p className="list__title">{trial.fecha ?? 'Sesión eliminada'}</p>
            <select aria-label="Resultado de la clase de prueba" value={trial.estado} onChange={(e) => run(() => api.resultadoClasePrueba(trial.id, e.target.value), 'Resultado guardado.')}>
              <option value="agendada">Agendada</option>
              {TRIAL_RESULTS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </li>
        ))}
      </ul>
      <div className="availability-row availability-row--two">
        <select aria-label="Sesión para la clase de prueba" value={sesionId} onChange={(e) => setSesionId(e.target.value)}>
          <option value="">Elige una sesión</option>
          {upcoming.map((s) => (
            <option key={s.id} value={s.id}>
              {s.fecha} · {s.disciplina} · {s.sede} · {formatTime(s.hora_inicio)}
            </option>
          ))}
        </select>
        <button
          className="btn btn--gold btn--small"
          type="button"
          disabled={!sesionId}
          onClick={async () => {
            if (await run(() => api.agendarClasePrueba(id, Number(sesionId)), 'Clase de prueba agendada.')) setSesionId('');
          }}
        >
          Agendar
        </button>
      </div>

      <h3>Seguimiento</h3>
      <ul className="list">
        {lead.seguimientos.map((n) => (
          <li key={n.id} className="list__item">
            <div>
              <p className="list__title">{n.nota}</p>
              <p className="muted">
                {String(n.fecha).slice(0, 16).replace('T', ' ')} · {n.usuario ?? 'Sistema'}
              </p>
            </div>
          </li>
        ))}
      </ul>
      <form
        className="availability-row availability-row--two"
        onSubmit={async (event) => {
          event.preventDefault();
          if (!note.trim()) return;
          if (await run(() => api.agregarSeguimiento(id, note.trim()), 'Nota agregada.')) setNote('');
        }}
      >
        <input type="text" aria-label="Nueva nota" placeholder="Escribe una nota…" value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} />
        <button className="btn btn--ghost btn--small" type="submit">
          Agregar nota
        </button>
      </form>
    </div>
  );
}

// Interested people: who asked, where they are in the process and what was done.
export default function LeadsPanel({ onUnauthorized }) {
  const [filter, setFilter] = useState('');
  const leads = useApi(useCallback(() => api.interesados(filter), [filter]), onUnauthorized);
  const [open, setOpen] = useState(null);

  return (
    <section className="panel panel--wide">
      <h2>Interesados</h2>
      <div className="field">
        <label htmlFor="leads-filter">Filtrar por estado</label>
        <select
          id="leads-filter"
          value={filter}
          onChange={(e) => {
            setFilter(e.target.value);
            setOpen(null);
          }}
        >
          <option value="">Todos</option>
          {ESTADOS.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>
      {leads.loading && !leads.data && <p className="muted">Cargando…</p>}
      {leads.error && <p className="alert">{leads.error}</p>}
      {leads.data?.length === 0 && <p className="muted">No hay interesados con este filtro.</p>}
      <ul className="list">
        {leads.data?.map((lead) => (
          <li key={lead.id} className="list__item list__item--stack">
            <div className="list__row">
              <div>
                <p className="list__title">{lead.nombre}</p>
                <p className="muted">
                  {[lead.disciplina, lead.sede].filter(Boolean).join(' · ') || 'Sin preferencia'} · {String(lead.fecha_creacion).slice(0, 10)}
                </p>
              </div>
              <div className="list__actions">
                <span className="tag">{LABEL[lead.estado]}</span>
                <button className="btn btn--gold btn--small" type="button" onClick={() => setOpen(open === lead.id ? null : lead.id)}>
                  {open === lead.id ? 'Cerrar' : 'Abrir'}
                </button>
              </div>
            </div>
            {open === lead.id && <LeadDetail id={lead.id} onChanged={leads.reload} onUnauthorized={onUnauthorized} />}
          </li>
        ))}
      </ul>
    </section>
  );
}
