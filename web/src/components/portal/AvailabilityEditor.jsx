import { useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/client.js';
import { useApi } from './useApi.js';

const DAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

// Weekly blocks the instructor can teach. Saved all together.
export default function AvailabilityEditor({ onUnauthorized }) {
  const saved = useApi(useCallback(() => api.disponibilidad(), []), onUnauthorized);
  const [blocks, setBlocks] = useState([]);
  const [notice, setNotice] = useState({ text: '', error: false });

  useEffect(() => {
    if (saved.data) setBlocks(saved.data.map(({ dia_semana, hora_inicio, hora_fin }) => ({ dia_semana, hora_inicio, hora_fin })));
  }, [saved.data]);

  const update = (index, field, value) =>
    setBlocks((current) => current.map((block, i) => (i === index ? { ...block, [field]: field === 'dia_semana' ? Number(value) : value } : block)));
  const add = () => setBlocks((current) => [...current, { dia_semana: 1, hora_inicio: '', hora_fin: '' }]);
  const remove = (index) => setBlocks((current) => current.filter((_, i) => i !== index));

  const save = async () => {
    if (blocks.some((b) => !b.hora_inicio || !b.hora_fin)) {
      setNotice({ text: 'Completa la hora de inicio y de término de cada bloque.', error: true });
      return;
    }
    try {
      await api.guardarDisponibilidad(blocks);
      setNotice({ text: 'Disponibilidad guardada.', error: false });
      saved.reload();
    } catch (failure) {
      if (failure.status === 401) onUnauthorized();
      else setNotice({ text: failure.message, error: true });
    }
  };

  return (
    <section className="panel panel--wide">
      <h2>Mi disponibilidad semanal</h2>
      <p className="muted">Los horarios en que puedes dictar clases. La administración los usa para asignarte.</p>
      {notice.text && (
        <p className={notice.error ? 'alert' : 'success'} role="status">
          {notice.text}
        </p>
      )}
      {saved.loading && !saved.data && <p className="muted">Cargando…</p>}
      {saved.error && <p className="alert">{saved.error}</p>}
      {saved.data && blocks.length === 0 && <p className="muted">Aún no has indicado horarios.</p>}
      <ul className="list">
        {blocks.map((block, index) => (
          <li key={index} className="list__item">
            <div className="availability-row">
              <select aria-label={`Día del bloque ${index + 1}`} value={block.dia_semana} onChange={(e) => update(index, 'dia_semana', e.target.value)}>
                {DAYS.map((day, i) => (
                  <option key={day} value={i + 1}>
                    {day}
                  </option>
                ))}
              </select>
              <input type="time" aria-label={`Inicio del bloque ${index + 1}`} value={block.hora_inicio} onChange={(e) => update(index, 'hora_inicio', e.target.value)} />
              <input type="time" aria-label={`Término del bloque ${index + 1}`} value={block.hora_fin} onChange={(e) => update(index, 'hora_fin', e.target.value)} />
            </div>
            <button className="btn btn--ghost btn--small" type="button" onClick={() => remove(index)}>
              Quitar
            </button>
          </li>
        ))}
      </ul>
      <div className="list__actions list__actions--start">
        <button className="btn btn--ghost" type="button" onClick={add}>
          Agregar horario
        </button>
        <button className="btn btn--gold" type="button" onClick={save}>
          Guardar disponibilidad
        </button>
      </div>
    </section>
  );
}
