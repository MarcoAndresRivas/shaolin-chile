import { useCallback, useState } from 'react';
import { api } from '../../lib/client.js';
import { useApi } from './useApi.js';

// Administration: groups a guardian and the students in their care.
export default function FamiliesPanel({ onUnauthorized }) {
  const families = useApi(useCallback(() => api.familias(), []), onUnauthorized);
  const users = useApi(useCallback(() => api.usuarios(), []), onUnauthorized);
  const [name, setName] = useState('');
  const [draft, setDraft] = useState({}); // family id -> { usuario_id, rol }
  const [notice, setNotice] = useState({ text: '', error: false });

  const run = async (action, success) => {
    setNotice({ text: '', error: false });
    try {
      await action();
      setNotice({ text: success, error: false });
      families.reload();
      return true;
    } catch (failure) {
      if (failure.status === 401) onUnauthorized();
      else setNotice({ text: failure.message, error: true });
      return false;
    }
  };

  const create = async (event) => {
    event.preventDefault();
    if (!name.trim()) return;
    if (await run(() => api.crearFamilia(name.trim()), 'Familia creada.')) setName('');
  };

  const remove = (family) => {
    if (window.confirm(`¿Eliminar la familia "${family.nombre}"? Las personas no se borran, solo su asociación.`)) {
      run(() => api.eliminarFamilia(family.id), 'Familia eliminada.');
    }
  };

  const add = async (family) => {
    const { usuario_id, rol = 'alumno' } = draft[family.id] ?? {};
    if (!usuario_id) return;
    if (await run(() => api.agregarMiembro(family.id, Number(usuario_id), rol), 'Miembro agregado.')) {
      setDraft((current) => ({ ...current, [family.id]: { rol } }));
    }
  };

  const setField = (familyId, field, value) => setDraft((current) => ({ ...current, [familyId]: { ...current[familyId], [field]: value } }));

  return (
    <section className="panel panel--wide">
      <h2>Familias</h2>
      <p className="muted">Un apoderado ve y gestiona las clases de los alumnos a su cargo. Al agregarlo como apoderado recibe ese rol.</p>
      {notice.text && (
        <p className={notice.error ? 'alert' : 'success'} role="status">
          {notice.text}
        </p>
      )}
      <form className="availability-row availability-row--two" onSubmit={create}>
        <input type="text" aria-label="Nombre de la familia" placeholder="Nombre de la familia" value={name} onChange={(e) => setName(e.target.value)} maxLength={255} />
        <button className="btn btn--gold btn--small" type="submit">
          Crear familia
        </button>
      </form>

      {families.loading && !families.data && <p className="muted">Cargando…</p>}
      {families.error && <p className="alert">{families.error}</p>}
      {families.data?.length === 0 && <p className="muted">Aún no hay familias.</p>}
      {families.data?.map((family) => (
        <div key={family.id} className="panel panel--nested">
          <div className="list__row">
            <p className="list__title">{family.nombre}</p>
            <button className="btn btn--ghost btn--small" type="button" onClick={() => remove(family)}>
              Eliminar
            </button>
          </div>
          <ul className="list">
            {family.miembros.map((m) => (
              <li key={m.usuario_id} className="list__item">
                <div>
                  <p className="list__title">{m.nombre}</p>
                  <p className="muted">{m.email}</p>
                </div>
                <div className="list__actions">
                  <span className="tag">{m.rol_en_familia === 'apoderado' ? 'Apoderado' : 'Alumno'}</span>
                  <button className="btn btn--ghost btn--small" type="button" onClick={() => run(() => api.quitarMiembro(family.id, m.usuario_id), 'Miembro quitado.')}>
                    Quitar
                  </button>
                </div>
              </li>
            ))}
          </ul>
          <div className="availability-row">
            <select aria-label={`Persona para ${family.nombre}`} value={draft[family.id]?.usuario_id ?? ''} onChange={(e) => setField(family.id, 'usuario_id', e.target.value)}>
              <option value="">Elige una persona</option>
              {users.data?.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nombre} ({u.email})
                </option>
              ))}
            </select>
            <select aria-label={`Rol en ${family.nombre}`} value={draft[family.id]?.rol ?? 'alumno'} onChange={(e) => setField(family.id, 'rol', e.target.value)}>
              <option value="alumno">Alumno</option>
              <option value="apoderado">Apoderado</option>
            </select>
            <button className="btn btn--gold btn--small" type="button" onClick={() => add(family)}>
              Agregar
            </button>
          </div>
        </div>
      ))}
    </section>
  );
}
