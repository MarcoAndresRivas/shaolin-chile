import { useCallback, useState } from 'react';
import { api } from '../../lib/client.js';
import { todayInChile } from '../../lib/dates.js';
import { useApi } from './useApi.js';

const STAGE_LABEL = { inicial: 'Etapa inicial', media: 'Etapa media', alta: 'Etapa alta' };

// The parts of a level's exam, following the Duan Pin system.
function examParts(g) {
  return ['conducta', 'técnica', ...(g.requiere_teoria ? ['teoría'] : []), ...(g.requiere_combate ? ['combate'] : [])].join(' · ');
}

const toForm = (g) => ({
  formas: g.formas ?? '',
  tecnicas: g.tecnicas ?? '',
  clases_minimas: String(g.clases_minimas),
  meses_minimos: String(g.meses_minimos),
  edad_minima: String(g.edad_minima ?? 0),
  requiere_teoria: Boolean(g.requiere_teoria),
  requiere_combate: Boolean(g.requiere_combate),
});

// The head instructor sets the content of one level: forms, techniques and requirements.
function GradeEditor({ grade, onSave, onCancel }) {
  const [form, setForm] = useState(() => toForm(grade));
  const set = (name) => (e) => setForm((f) => ({ ...f, [name]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const id = `grade-${grade.id}`;
  const submit = (event) => {
    event.preventDefault();
    onSave({
      formas: form.formas.trim() || null,
      tecnicas: form.tecnicas.trim() || null,
      clases_minimas: Number(form.clases_minimas) || 0,
      meses_minimos: Number(form.meses_minimos) || 0,
      edad_minima: Number(form.edad_minima) || 0,
      requiere_teoria: form.requiere_teoria,
      requiere_combate: form.requiere_combate,
    });
  };
  return (
    <form className="schedule-form" onSubmit={submit}>
      <div className="field field--wide">
        <label htmlFor={`${id}-formas`}>Formas (las define el instructor principal)</label>
        <textarea id={`${id}-formas`} rows="2" maxLength={5000} value={form.formas} onChange={set('formas')} />
      </div>
      <div className="field field--wide">
        <label htmlFor={`${id}-tecnicas`}>Técnicas</label>
        <textarea id={`${id}-tecnicas`} rows="2" maxLength={5000} value={form.tecnicas} onChange={set('tecnicas')} />
      </div>
      <div className="field">
        <label htmlFor={`${id}-clases`}>Clases mínimas</label>
        <input id={`${id}-clases`} type="number" min="0" value={form.clases_minimas} onChange={set('clases_minimas')} />
      </div>
      <div className="field">
        <label htmlFor={`${id}-meses`}>Meses mínimos en el nivel anterior</label>
        <input id={`${id}-meses`} type="number" min="0" value={form.meses_minimos} onChange={set('meses_minimos')} />
      </div>
      <div className="field">
        <label htmlFor={`${id}-edad`}>Edad mínima (años)</label>
        <input id={`${id}-edad`} type="number" min="0" value={form.edad_minima} onChange={set('edad_minima')} />
      </div>
      <div className="field">
        <label>
          <input type="checkbox" checked={form.requiere_teoria} onChange={set('requiere_teoria')} /> El examen incluye teoría
        </label>
        <label>
          <input type="checkbox" checked={form.requiere_combate} onChange={set('requiere_combate')} /> El examen incluye combate
        </label>
      </div>
      <div className="list__actions field--wide">
        <button className="btn btn--gold btn--small" type="submit">
          Guardar
        </button>
        <button className="btn btn--ghost btn--small" type="button" onClick={onCancel}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

// Administration: the grades of each discipline (the Duan Pin ladder for Kung
// Fu Tradicional) with their content, placing a student in a grade and their
// date of birth for the minimum ages. The content comes from the head instructor.
export default function GradesAdminPanel({ onUnauthorized }) {
  const disciplinas = useApi(useCallback(() => api.disciplinas(), []), onUnauthorized);
  const grados = useApi(useCallback(() => api.grados(), []), onUnauthorized);
  const users = useApi(useCallback(() => api.usuarios(), []), onUnauthorized);
  const [grade, setGrade] = useState({ disciplina_id: '', orden: '', nombre: '', clases_minimas: '0', meses_minimos: '0', tecnicas: '' });
  const [place, setPlace] = useState({ alumno_id: '', grado_id: '', fecha: todayInChile() });
  const [birth, setBirth] = useState({ alumno_id: '', fecha: '' });
  const [editing, setEditing] = useState(null);
  const [notice, setNotice] = useState({ text: '', error: false });

  const run = async (action, success, after = []) => {
    setNotice({ text: '', error: false });
    try {
      const result = await action();
      setNotice({ text: result?.message ?? success, error: false });
      after.forEach((reload) => reload());
      return true;
    } catch (failure) {
      if (failure.status === 401) onUnauthorized();
      else setNotice({ text: failure.message, error: true });
      return false;
    }
  };

  const createGrade = async (event) => {
    event.preventDefault();
    if (!grade.disciplina_id || !grade.orden || !grade.nombre.trim()) {
      setNotice({ text: 'Elige la disciplina e indica la posición y el nombre del grado.', error: true });
      return;
    }
    const payload = {
      disciplina_id: Number(grade.disciplina_id),
      orden: Number(grade.orden),
      nombre: grade.nombre.trim(),
      clases_minimas: Number(grade.clases_minimas) || 0,
      meses_minimos: Number(grade.meses_minimos) || 0,
      ...(grade.tecnicas.trim() && { tecnicas: grade.tecnicas.trim() }),
    };
    if (await run(() => api.crearGrado(payload), 'Grado creado.', [grados.reload])) {
      setGrade((g) => ({ ...g, orden: '', nombre: '', clases_minimas: '0', meses_minimos: '0', tecnicas: '' }));
    }
  };

  const saveGrade = async (id, cambios) => {
    if (await run(() => api.actualizarGrado(id, cambios), 'Grado actualizado.', [grados.reload])) setEditing(null);
  };

  const placeStudent = async (event) => {
    event.preventDefault();
    if (!place.alumno_id || !place.grado_id) {
      setNotice({ text: 'Elige un alumno y un grado.', error: true });
      return;
    }
    await run(() => api.ubicarAlumno(Number(place.alumno_id), Number(place.grado_id), place.fecha), 'Grado registrado en la ficha del alumno.');
  };

  const saveBirth = async (event) => {
    event.preventDefault();
    if (!birth.alumno_id || !birth.fecha) {
      setNotice({ text: 'Elige un alumno e indica su fecha de nacimiento.', error: true });
      return;
    }
    await run(() => api.fechaNacimiento(Number(birth.alumno_id), birth.fecha), 'Fecha de nacimiento registrada.');
  };

  const byDiscipline = disciplinas.data?.map((d) => ({ ...d, grados: grados.data?.filter((g) => g.disciplina_id === d.id) ?? [] })) ?? [];

  return (
    <section className="panel panel--wide">
      <h2>Grados</h2>
      <p className="muted">
        Kung Fu Tradicional sigue el sistema oficial del Templo Shaolin (Duan Pin): 9 Duan en tres etapas y luego los Pin. El instructor principal define las formas y técnicas de cada nivel.
      </p>
      {notice.text && (
        <p className={notice.error ? 'alert' : 'success'} role="status">
          {notice.text}
        </p>
      )}

      {byDiscipline.map((d) => (
        <div key={d.id}>
          <h3>{d.nombre}</h3>
          {d.grados.length === 0 && <p className="muted">Sin grados definidos.</p>}
          {d.slug === 'kung-fu-tradicional' && d.grados.length === 0 && (
            <button className="btn btn--gold btn--small" type="button" onClick={() => run(() => api.cargarDuanPin(), 'Escala Duan Pin cargada.', [grados.reload])}>
              Cargar la escala Duan Pin
            </button>
          )}
          <ul className="list">
            {d.grados.map((g) => (
              <li key={g.id} className="list__item list__item--stack">
                <div className="list__row">
                  <div>
                    <p className="list__title">
                      {g.orden}. {g.nombre}
                    </p>
                    <p className="muted">
                      {[g.etapa && STAGE_LABEL[g.etapa], g.edad_minima ? `desde ${g.edad_minima} años` : null, `${g.clases_minimas} clases`, `${g.meses_minimos} meses`, `examen: ${examParts(g)}`]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                    <p className="muted">Formas: {g.formas ?? 'por definir'}</p>
                    {g.tecnicas && <p className="muted">Técnicas: {g.tecnicas}</p>}
                  </div>
                  {editing !== g.id && (
                    <button className="btn btn--ghost btn--small" type="button" onClick={() => setEditing(g.id)}>
                      Editar
                    </button>
                  )}
                </div>
                {editing === g.id && <GradeEditor grade={g} onSave={(cambios) => saveGrade(g.id, cambios)} onCancel={() => setEditing(null)} />}
              </li>
            ))}
          </ul>
        </div>
      ))}

      <h3>Definir un grado</h3>
      <form className="schedule-form" onSubmit={createGrade}>
        <div className="field">
          <label htmlFor="grade-disciplina">Disciplina</label>
          <select id="grade-disciplina" value={grade.disciplina_id} onChange={(e) => setGrade((g) => ({ ...g, disciplina_id: e.target.value }))}>
            <option value="">Elige una</option>
            {disciplinas.data?.map((d) => (
              <option key={d.id} value={d.id}>
                {d.nombre}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="grade-orden">Posición (1 = primero)</label>
          <input id="grade-orden" type="number" min="1" value={grade.orden} onChange={(e) => setGrade((g) => ({ ...g, orden: e.target.value }))} />
        </div>
        <div className="field field--wide">
          <label htmlFor="grade-nombre">Nombre</label>
          <input id="grade-nombre" type="text" value={grade.nombre} onChange={(e) => setGrade((g) => ({ ...g, nombre: e.target.value }))} />
        </div>
        <div className="field">
          <label htmlFor="grade-clases">Clases mínimas</label>
          <input id="grade-clases" type="number" min="0" value={grade.clases_minimas} onChange={(e) => setGrade((g) => ({ ...g, clases_minimas: e.target.value }))} />
        </div>
        <div className="field">
          <label htmlFor="grade-meses">Meses mínimos en el grado anterior</label>
          <input id="grade-meses" type="number" min="0" value={grade.meses_minimos} onChange={(e) => setGrade((g) => ({ ...g, meses_minimos: e.target.value }))} />
        </div>
        <div className="field field--wide">
          <label htmlFor="grade-tecnicas">Técnicas exigidas (opcional)</label>
          <input id="grade-tecnicas" type="text" value={grade.tecnicas} onChange={(e) => setGrade((g) => ({ ...g, tecnicas: e.target.value }))} />
        </div>
        <button className="btn btn--gold field--wide" type="submit">
          Crear grado
        </button>
      </form>

      <h3>Registrar el grado de un alumno</h3>
      <form className="availability-row" onSubmit={placeStudent}>
        <select aria-label="Alumno" value={place.alumno_id} onChange={(e) => setPlace((p) => ({ ...p, alumno_id: e.target.value }))}>
          <option value="">Elige un alumno</option>
          {users.data?.map((u) => (
            <option key={u.id} value={u.id}>
              {u.nombre}
            </option>
          ))}
        </select>
        <select aria-label="Grado" value={place.grado_id} onChange={(e) => setPlace((p) => ({ ...p, grado_id: e.target.value }))}>
          <option value="">Elige un grado</option>
          {byDiscipline.flatMap((d) =>
            d.grados.map((g) => (
              <option key={g.id} value={g.id}>
                {d.nombre} · {g.nombre}
              </option>
            )),
          )}
        </select>
        <input type="date" aria-label="Fecha desde la que tiene el grado" value={place.fecha} onChange={(e) => setPlace((p) => ({ ...p, fecha: e.target.value }))} />
        <button className="btn btn--gold btn--small" type="submit">
          Registrar
        </button>
      </form>

      <h3>Fecha de nacimiento de un alumno</h3>
      <p className="muted">Se usa para verificar la edad mínima de cada nivel.</p>
      <form className="availability-row" onSubmit={saveBirth}>
        <select aria-label="Alumno para la fecha de nacimiento" value={birth.alumno_id} onChange={(e) => setBirth((b) => ({ ...b, alumno_id: e.target.value }))}>
          <option value="">Elige un alumno</option>
          {users.data?.map((u) => (
            <option key={u.id} value={u.id}>
              {u.nombre}
            </option>
          ))}
        </select>
        <input type="date" aria-label="Fecha de nacimiento" max={todayInChile()} value={birth.fecha} onChange={(e) => setBirth((b) => ({ ...b, fecha: e.target.value }))} />
        <button className="btn btn--gold btn--small" type="submit">
          Guardar
        </button>
      </form>
    </section>
  );
}
