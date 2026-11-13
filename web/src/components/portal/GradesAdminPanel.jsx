import { useCallback, useState } from 'react';
import { api } from '../../lib/client.js';
import { todayInChile } from '../../lib/dates.js';
import { useApi } from './useApi.js';

// Administration: the grades of each discipline with their requirements, and
// placing a student in a grade. The content comes from the instructor principal.
export default function GradesAdminPanel({ onUnauthorized }) {
  const disciplinas = useApi(useCallback(() => api.disciplinas(), []), onUnauthorized);
  const grados = useApi(useCallback(() => api.grados(), []), onUnauthorized);
  const users = useApi(useCallback(() => api.usuarios(), []), onUnauthorized);
  const [grade, setGrade] = useState({ disciplina_id: '', orden: '', nombre: '', clases_minimas: '0', meses_minimos: '0', tecnicas: '' });
  const [place, setPlace] = useState({ alumno_id: '', grado_id: '', fecha: todayInChile() });
  const [notice, setNotice] = useState({ text: '', error: false });

  const run = async (action, success, after = []) => {
    setNotice({ text: '', error: false });
    try {
      await action();
      setNotice({ text: success, error: false });
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

  const placeStudent = async (event) => {
    event.preventDefault();
    if (!place.alumno_id || !place.grado_id) {
      setNotice({ text: 'Elige un alumno y un grado.', error: true });
      return;
    }
    await run(() => api.ubicarAlumno(Number(place.alumno_id), Number(place.grado_id), place.fecha), 'Grado registrado en la ficha del alumno.');
  };

  const byDiscipline = disciplinas.data?.map((d) => ({ ...d, grados: grados.data?.filter((g) => g.disciplina_id === d.id) ?? [] })) ?? [];

  return (
    <section className="panel panel--wide">
      <h2>Grados</h2>
      <p className="muted">Los requisitos de cada grado los define la dirección técnica (clases mínimas, meses en el grado y técnicas).</p>
      {notice.text && (
        <p className={notice.error ? 'alert' : 'success'} role="status">
          {notice.text}
        </p>
      )}

      {byDiscipline.map((d) => (
        <div key={d.id}>
          <h3>{d.nombre}</h3>
          {d.grados.length === 0 && <p className="muted">Sin grados definidos.</p>}
          <ul className="list">
            {d.grados.map((g) => (
              <li key={g.id} className="list__item">
                <div>
                  <p className="list__title">
                    {g.orden}. {g.nombre}
                  </p>
                  <p className="muted">
                    {g.clases_minimas} clases · {g.meses_minimos} meses{g.tecnicas ? ` · ${g.tecnicas}` : ''}
                  </p>
                </div>
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
    </section>
  );
}
