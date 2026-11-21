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

// The recorded parts of a Duan Pin exam, in one line.
function scoreLine(i) {
  return [
    i.conducta_ok !== null && `conducta ${i.conducta_ok ? 'cumplida' : 'no cumplida'}`,
    i.nota_tecnica !== null && `técnica ${i.nota_tecnica}/10`,
    i.nota_teoria !== null && `teoría ${i.nota_teoria}/100`,
    i.combate_ok !== null && `combate ${i.combate_ok ? 'aprobado' : 'no aprobado'}`,
    i.evaluadores && `jurado: ${i.evaluadores}`,
  ]
    .filter(Boolean)
    .join(' · ');
}

// The jury records conduct, technique, theory and combat (when the level asks for them).
function ResultForm({ inscripcion: i, onSave }) {
  const [form, setForm] = useState({ conducta_ok: false, nota_tecnica: '', nota_teoria: '', combate_ok: false, evaluadores: '', observaciones: '' });
  const set = (name) => (e) => setForm((f) => ({ ...f, [name]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const id = `result-${i.alumno_id}`;
  const save = (resultado) => {
    if (resultado === 'ausente') return onSave({ alumno_id: i.alumno_id, resultado });
    return onSave({
      alumno_id: i.alumno_id,
      resultado,
      conducta_ok: form.conducta_ok,
      ...(form.nota_tecnica !== '' && { nota_tecnica: Number(form.nota_tecnica) }),
      ...(i.requiere_teoria && form.nota_teoria !== '' && { nota_teoria: Number(form.nota_teoria) }),
      ...(i.requiere_combate && { combate_ok: form.combate_ok }),
      ...(form.evaluadores.trim() && { evaluadores: form.evaluadores.trim() }),
      ...(form.observaciones.trim() && { observaciones: form.observaciones.trim() }),
    });
  };
  return (
    <div className="schedule-form">
      <div className="field">
        <label>
          <input type="checkbox" checked={form.conducta_ok} onChange={set('conducta_ok')} /> Conducta y preceptos cumplidos
        </label>
        {i.requiere_combate && (
          <label>
            <input type="checkbox" checked={form.combate_ok} onChange={set('combate_ok')} /> Combate aprobado
          </label>
        )}
      </div>
      <div className="field">
        <label htmlFor={`${id}-tecnica`}>Nota técnica (0 a 10)</label>
        <input id={`${id}-tecnica`} type="number" min="0" max="10" step="0.1" value={form.nota_tecnica} onChange={set('nota_tecnica')} />
      </div>
      {i.requiere_teoria && (
        <div className="field">
          <label htmlFor={`${id}-teoria`}>Nota de teoría (0 a 100)</label>
          <input id={`${id}-teoria`} type="number" min="0" max="100" step="1" value={form.nota_teoria} onChange={set('nota_teoria')} />
        </div>
      )}
      <div className="field field--wide">
        <label htmlFor={`${id}-jurado`}>Jurado (quiénes evaluaron)</label>
        <input id={`${id}-jurado`} type="text" maxLength={255} value={form.evaluadores} onChange={set('evaluadores')} />
      </div>
      <div className="field field--wide">
        <label htmlFor={`${id}-obs`}>Observaciones (opcional)</label>
        <textarea id={`${id}-obs`} rows="2" maxLength={2000} value={form.observaciones} onChange={set('observaciones')} />
      </div>
      <div className="list__actions field--wide">
        {[['aprobado', 'Aprobó'], ['reprobado', 'Reprobó'], ['ausente', 'Ausente']].map(([resultado, label]) => (
          <button key={resultado} className={resultado === 'aprobado' ? 'btn btn--gold btn--small' : 'btn btn--ghost btn--small'} type="button" onClick={() => save(resultado)}>
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

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
          <li key={i.alumno_id} className="list__item list__item--stack">
            <div className="list__row">
              <div>
                <p className="list__title">{i.alumno}</p>
                <p className="muted">Grado al que rinde: {i.grado}</p>
                {scoreLine(i) && <p className="muted">{scoreLine(i)}</p>}
                {i.observaciones && <p className="muted">Observaciones: {i.observaciones}</p>}
              </div>
              <div className="list__actions">
                <span className="tag">{STATE_LABEL[i.estado]}</span>
                {canApprove && i.estado === 'nominado' && (
                  <button className="btn btn--gold btn--small" type="button" onClick={() => run(() => api.confirmarNominacion(id, i.alumno_id), 'Nominación confirmada.')}>
                    Confirmar
                  </button>
                )}
              </div>
            </div>
            {canApprove && i.estado === 'confirmado' && happened && (
              <ResultForm inscripcion={i} onSave={(item) => run(() => api.guardarResultados(id, [item]), 'Resultado guardado.')} />
            )}
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
