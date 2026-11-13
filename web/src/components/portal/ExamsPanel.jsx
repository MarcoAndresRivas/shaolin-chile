import { useCallback, useState } from 'react';
import { api } from '../../lib/client.js';
import { formatPesos, parsePesos } from '../../lib/money.js';
import { todayInChile } from '../../lib/dates.js';
import { useApi } from './useApi.js';

const STATE_LABEL = {
  nominado: 'Nominado',
  confirmado: 'Confirmado',
  aprobado: 'Aprobado',
  reprobado: 'Reprobado',
  ausente: 'Ausente',
};

function ExamDetail({ id, date, canApprove, onChanged, onUnauthorized }) {
  const detail = useApi(useCallback(() => api.examen(id), [id]), onUnauthorized);
  const [notice, setNotice] = useState({ text: '', error: false });

  const run = async (action, success) => {
    setNotice({ text: '', error: false });
    try {
      await action();
      setNotice({ text: success, error: false });
      detail.reload();
      onChanged();
    } catch (failure) {
      if (failure.status === 401) onUnauthorized();
      else setNotice({ text: failure.message, error: true });
    }
  };

  if (detail.loading && !detail.data) return <p className="muted">Cargando…</p>;
  if (detail.error) return <p className="alert">{detail.error}</p>;
  const happened = date <= todayInChile();

  return (
    <div className="lead">
      {notice.text && (
        <p className={notice.error ? 'alert' : 'success'} role="status">
          {notice.text}
        </p>
      )}
      {detail.data.inscripciones.length === 0 && <p className="muted">Nadie nominado todavía.</p>}
      <ul className="list">
        {detail.data.inscripciones.map((i) => (
          <li key={i.alumno_id} className="list__item">
            <div>
              <p className="list__title">{i.alumno}</p>
              <p className="muted">Grado al que rinde: {i.grado}</p>
            </div>
            <div className="list__actions">
              <span className="tag">{STATE_LABEL[i.estado]}</span>
              {canApprove && i.estado === 'nominado' && (
                <button className="btn btn--gold btn--small" type="button" onClick={() => run(() => api.confirmarNominacion(id, i.alumno_id), 'Nominación confirmada.')}>
                  Confirmar
                </button>
              )}
              {canApprove && i.estado === 'confirmado' && happened && (
                <>
                  {[['aprobado', 'Aprobó'], ['reprobado', 'Reprobó'], ['ausente', 'Ausente']].map(([resultado, label]) => (
                    <button key={resultado} className="btn btn--ghost btn--small" type="button" onClick={() => run(() => api.guardarResultados(id, [{ alumno_id: i.alumno_id, resultado }]), 'Resultado guardado.')}>
                      {label}
                    </button>
                  ))}
                </>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Exams: the students eligible for their next grade, nominations and, for
// administration, scheduling, confirming and recording results.
export default function ExamsPanel({ canApprove = false, onUnauthorized }) {
  const eligible = useApi(useCallback(() => api.habilitados(), []), onUnauthorized);
  const exams = useApi(useCallback(() => api.examenes(), []), onUnauthorized);
  const [open, setOpen] = useState(null);
  const [exam, setExam] = useState({ fecha: '', nombre: '', monto: '' });
  const [target, setTarget] = useState({}); // "alumno-disciplina" -> exam id
  const [notice, setNotice] = useState({ text: '', error: false });

  const run = async (action, success) => {
    setNotice({ text: '', error: false });
    try {
      await action();
      setNotice({ text: success, error: false });
      exams.reload();
      eligible.reload();
      return true;
    } catch (failure) {
      if (failure.status === 401) onUnauthorized();
      else setNotice({ text: failure.message, error: true });
      return false;
    }
  };

  const createExam = async (event) => {
    event.preventDefault();
    if (!exam.fecha) {
      setNotice({ text: 'Indica la fecha del examen.', error: true });
      return;
    }
    const monto = exam.monto.trim() ? parsePesos(exam.monto) : undefined;
    if (exam.monto.trim() && !monto) {
      setNotice({ text: 'El derecho a examen debe ser un monto en pesos, sin decimales.', error: true });
      return;
    }
    const payload = { fecha: exam.fecha, ...(exam.nombre.trim() && { nombre: exam.nombre.trim() }), ...(monto && { monto_derecho: monto }) };
    if (await run(() => api.crearExamen(payload), 'Examen creado.')) setExam({ fecha: '', nombre: '', monto: '' });
  };

  const scheduled = exams.data?.filter((e) => e.estado === 'programado') ?? [];

  return (
    <section className="panel panel--wide">
      <h2>Exámenes de grado</h2>
      {notice.text && (
        <p className={notice.error ? 'alert' : 'success'} role="status">
          {notice.text}
        </p>
      )}

      <h3>Alumnos habilitados para su próximo grado</h3>
      {eligible.data?.length === 0 && <p className="muted">Nadie cumple todavía los requisitos del próximo grado.</p>}
      <ul className="list">
        {eligible.data?.map((h) => {
          const key = `${h.alumno_id}-${h.disciplina_id}`;
          return (
            <li key={key} className="list__item">
              <div>
                <p className="list__title">{h.alumno}</p>
                <p className="muted">
                  {h.disciplina}: {h.actual ? h.actual.nombre : 'sin grado'} → {h.siguiente.nombre}
                </p>
              </div>
              <div className="availability-row availability-row--two">
                <select aria-label={`Examen para ${h.alumno}`} value={target[key] ?? ''} onChange={(e) => setTarget((t) => ({ ...t, [key]: e.target.value }))}>
                  <option value="">Elige un examen</option>
                  {scheduled.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.fecha} {e.nombre ? `· ${e.nombre}` : ''}
                    </option>
                  ))}
                </select>
                <button className="btn btn--gold btn--small" type="button" disabled={!target[key]} onClick={() => run(() => api.nominar(Number(target[key]), h.alumno_id, h.disciplina_id), `${h.alumno} fue nominado.`)}>
                  Nominar
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      <h3>Exámenes</h3>
      {exams.data?.length === 0 && <p className="muted">Aún no hay exámenes programados.</p>}
      <ul className="list">
        {exams.data?.map((e) => (
          <li key={e.id} className="list__item list__item--stack">
            <div className="list__row">
              <div>
                <p className="list__title">
                  {e.fecha} {e.nombre ? `· ${e.nombre}` : ''}
                </p>
                <p className="muted">
                  {e.sede ?? 'Sin sede'} · {e.nominados} nominado(s){e.monto_derecho ? ` · derecho ${formatPesos(e.monto_derecho)}` : ''}
                </p>
              </div>
              <div className="list__actions">
                <span className="tag">{e.estado}</span>
                <button className="btn btn--gold btn--small" type="button" onClick={() => setOpen(open === e.id ? null : e.id)}>
                  {open === e.id ? 'Cerrar' : 'Abrir'}
                </button>
              </div>
            </div>
            {open === e.id && <ExamDetail id={e.id} date={e.fecha} canApprove={canApprove} onChanged={exams.reload} onUnauthorized={onUnauthorized} />}
          </li>
        ))}
      </ul>

      {canApprove && (
        <>
          <h3>Programar un examen</h3>
          <form className="availability-row" onSubmit={createExam}>
            <input type="date" aria-label="Fecha del examen" value={exam.fecha} onChange={(e) => setExam((x) => ({ ...x, fecha: e.target.value }))} />
            <input type="text" aria-label="Nombre del examen" placeholder="Nombre (opcional)" value={exam.nombre} onChange={(e) => setExam((x) => ({ ...x, nombre: e.target.value }))} />
            <input type="text" inputMode="numeric" aria-label="Derecho a examen" placeholder="Derecho a examen (opcional)" value={exam.monto} onChange={(e) => setExam((x) => ({ ...x, monto: e.target.value }))} />
            <button className="btn btn--gold btn--small" type="submit">
              Crear examen
            </button>
          </form>
        </>
      )}
    </section>
  );
}
