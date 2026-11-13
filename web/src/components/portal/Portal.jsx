import { useEffect, useState } from 'react';
import { appPath } from '../../lib/client.js';
import { clearSession, isAdmin, isStudent, readSession } from '../../lib/session.js';
import AdminPanel from './AdminPanel.jsx';
import StudentPanel from './StudentPanel.jsx';
import './portal.css';

export default function Portal() {
  const [session, setSession] = useState(null);

  useEffect(() => {
    const current = readSession();
    if (!current) window.location.replace(appPath('ingresar/'));
    else setSession(current);
  }, []);

  if (!session) return <p className="muted">Cargando…</p>;

  // A 401 means the token expired or was revoked: go back to the login.
  const onUnauthorized = () => {
    clearSession();
    window.location.replace(appPath('ingresar/'));
  };

  const logout = () => {
    clearSession();
    window.location.assign(appPath(''));
  };

  return (
    <div className="portal">
      <div className="portal__bar">
        <div>
          <p className="portal__hello">Hola, {session.name}</p>
          <p className="muted">{session.roles.join(' · ') || 'Sin rol asignado'}</p>
        </div>
        <button className="btn btn--ghost" type="button" onClick={logout}>
          Cerrar sesión
        </button>
      </div>

      {isAdmin(session) && <AdminPanel onUnauthorized={onUnauthorized} />}
      {isStudent(session) && <StudentPanel onUnauthorized={onUnauthorized} />}
      {!isAdmin(session) && !isStudent(session) && (
        <section className="panel">
          <h2>Tu panel está en construcción</h2>
          <p className="muted">
            Los portales de instructor y de los demás roles llegan en la Fase 2. Mientras tanto, coordina con la
            administración.
          </p>
        </section>
      )}
    </div>
  );
}
