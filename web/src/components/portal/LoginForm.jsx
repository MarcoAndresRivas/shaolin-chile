import { useEffect, useState } from 'react';
import { api, appPath } from '../../lib/client.js';
import { createSession, readSession, saveSession } from '../../lib/session.js';
import './portal.css';

export default function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (readSession()) window.location.replace(appPath('portal/'));
  }, []);

  const submit = async (event) => {
    event.preventDefault();
    if (!email.trim() || !password) {
      setError('Ingresa tu correo y tu contraseña.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const response = await api.login(email.trim(), password);
      saveSession(createSession(response));
      window.location.assign(appPath('portal/'));
    } catch (failure) {
      setError(failure.message);
      setBusy(false);
    }
  };

  return (
    <form className="panel login" onSubmit={submit} noValidate>
      <div className="field">
        <label htmlFor="login-email">Correo electrónico</label>
        <input id="login-email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="login-password">Contraseña</label>
        <input
          id="login-password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>
      {error && (
        <p className="alert" role="alert">
          {error}
        </p>
      )}
      <button className="btn btn--gold" type="submit" disabled={busy}>
        {busy ? 'Ingresando…' : 'Ingresar'}
      </button>
    </form>
  );
}
