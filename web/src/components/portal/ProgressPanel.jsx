import { useCallback } from 'react';
import { api } from '../../lib/client.js';
import { useApi } from './useApi.js';

function Requirement({ label, done, needed, met }) {
  const percent = needed === 0 ? 100 : Math.min(100, Math.round((done / needed) * 100));
  return (
    <div className="requirement">
      <div className="list__row">
        <span>{label}</span>
        <span className="muted">
          {done} de {needed} {met ? '✓' : ''}
        </span>
      </div>
      <div className="bar" role="progressbar" aria-label={label} aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
        <div className={`bar__fill${met ? ' bar__fill--done' : ''}`} style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

// Current grade, the next one and how far the student is from taking it.
export default function ProgressPanel({ alumnoId, title = 'Mi grado', onUnauthorized }) {
  const progress = useApi(useCallback(() => api.progreso(alumnoId), [alumnoId]), onUnauthorized);
  // With alumnoId a guardian is reading about a student in their care.
  const own = !alumnoId;

  if (progress.loading && !progress.data) return <section className="panel"><h2>{title}</h2><p className="muted">Cargando…</p></section>;
  if (progress.error) return <section className="panel"><h2>{title}</h2><p className="alert">{progress.error}</p></section>;
  const { disciplinas, historial } = progress.data;

  return (
    <section className="panel">
      <h2>{title}</h2>
      {disciplinas.length === 0 && <p className="muted">Todavía no hay grados definidos. La dirección técnica los publica pronto.</p>}
      {disciplinas.map((d) => (
        <div key={d.disciplina_id} className="progress">
          <p className="list__title">{d.disciplina}</p>
          <p className="muted">{d.actual ? `Grado actual: ${d.actual.nombre} (desde ${d.actual.fecha})` : own ? 'Aún no tienes un grado registrado.' : 'Aún no tiene un grado registrado.'}</p>
          {d.siguiente ? (
            <>
              <p>Próximo grado: {d.siguiente.nombre}</p>
              <Requirement label="Clases asistidas" done={d.requisitos.clases.asistidas} needed={d.requisitos.clases.minimas} met={d.requisitos.clases.cumple} />
              <Requirement label="Meses en el grado" done={d.requisitos.meses.transcurridos ?? 0} needed={d.requisitos.meses.minimos} met={d.requisitos.meses.cumple} />
              {d.habilitado && <p className="success">{own ? 'Cumples' : 'Cumple'} los requisitos: {own ? 'tu instructor puede nominarte' : 'su instructor puede nominarlo'} al próximo examen.</p>}
            </>
          ) : (
            <p className="muted">{own ? 'Estás' : 'Está'} en el último grado definido.</p>
          )}
        </div>
      ))}
      {historial.length > 0 && (
        <>
          <h3>Historial</h3>
          <ul className="list">
            {historial.map((h) => (
              <li key={h.id} className="list__item">
                <p className="list__title">
                  {h.disciplina} · {h.grado}
                </p>
                <span className="tag">{h.fecha}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
