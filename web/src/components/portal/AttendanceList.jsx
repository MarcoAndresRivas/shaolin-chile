import { useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/client.js';
import { useApi } from './useApi.js';

// Booked students of one sesion with Present / Absent buttons.
// Used by the instructor panel and by administration.
export default function AttendanceList({ sesionId, onUnauthorized }) {
  const list = useApi(useCallback(() => api.asistencia(sesionId), [sesionId]), onUnauthorized);
  const [marks, setMarks] = useState({});
  const [notice, setNotice] = useState({ text: '', error: false });

  // Start from what is already saved.
  useEffect(() => {
    if (!list.data) return;
    setMarks(Object.fromEntries(list.data.map((student) => [student.alumno_id, student.presente])));
  }, [list.data]);

  const mark = (id, value) => setMarks((current) => ({ ...current, [id]: current[id] === value ? null : value }));

  const save = async () => {
    const asistencias = Object.entries(marks)
      .filter(([, presente]) => presente !== null)
      .map(([id, presente]) => ({ alumno_id: Number(id), presente }));
    if (!asistencias.length) {
      setNotice({ text: 'Marca al menos un alumno.', error: true });
      return;
    }
    try {
      await api.guardarAsistencia(sesionId, asistencias);
      setNotice({ text: 'Asistencia guardada.', error: false });
      list.reload();
    } catch (failure) {
      if (failure.status === 401) onUnauthorized();
      else setNotice({ text: failure.message, error: true });
    }
  };

  if (list.loading && !list.data) return <p className="muted">Cargando…</p>;
  if (list.error) return <p className="alert">{list.error}</p>;
  if (!list.data?.length) return <p className="muted">Todavía no hay alumnos con reserva en esta sesión.</p>;

  return (
    <div className="attendance">
      {notice.text && (
        <p className={notice.error ? 'alert' : 'success'} role="status">
          {notice.text}
        </p>
      )}
      <ul className="list">
        {list.data.map((student) => (
          <li key={student.alumno_id} className="list__item">
            <p className="list__title">{student.nombre}</p>
            <div className="list__actions">
              <button
                type="button"
                className={`btn btn--small ${marks[student.alumno_id] === true ? 'btn--gold' : 'btn--ghost'}`}
                aria-pressed={marks[student.alumno_id] === true}
                onClick={() => mark(student.alumno_id, true)}
              >
                Presente
              </button>
              <button
                type="button"
                className={`btn btn--small ${marks[student.alumno_id] === false ? 'btn--red' : 'btn--ghost'}`}
                aria-pressed={marks[student.alumno_id] === false}
                onClick={() => mark(student.alumno_id, false)}
              >
                Ausente
              </button>
            </div>
          </li>
        ))}
      </ul>
      <button className="btn btn--gold" type="button" onClick={save}>
        Guardar asistencia
      </button>
    </div>
  );
}
