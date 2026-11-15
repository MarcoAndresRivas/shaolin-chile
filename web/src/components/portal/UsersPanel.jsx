import { useCallback } from 'react';
import { api } from '../../lib/client.js';
import { useApi } from './useApi.js';

export default function UsersPanel({ onUnauthorized }) {
  const users = useApi(useCallback(() => api.usuarios(), []), onUnauthorized);

  return (
    <section className="panel panel--wide">
      <h2>Usuarios</h2>
      {users.loading && !users.data && <p className="muted">Cargando…</p>}
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
  );
}
