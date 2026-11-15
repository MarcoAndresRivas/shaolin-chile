import { useEffect, useState } from 'react';
import { api, appPath } from '../lib/client.js';
import { validateTrialRequest, buildLeadPayload, buildTrialMessage, buildWhatsappUrl } from '../lib/trialClass.js';
import './TrialClassForm.css';

const EMPTY = { name: '', email: '', telefono: '', discipline: '', location: '', message: '', consent: false };

// `disciplines` and `locations` are the names from the site content. They are
// used until the public catalog loads (or when the server cannot be reached).
export default function TrialClassForm({ disciplines, locations, whatsapp }) {
  const [values, setValues] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [catalog, setCatalog] = useState(null);
  const [status, setStatus] = useState('idle'); // idle | sending | saved | whatsapp
  const [failure, setFailure] = useState('');
  const [trap, setTrap] = useState('');

  useEffect(() => {
    api.catalogo().then(setCatalog).catch(() => setCatalog(null));
  }, []);

  const disciplineNames = catalog ? catalog.disciplinas.map((d) => d.nombre) : disciplines;
  const locationNames = catalog ? catalog.sedes.map((s) => s.ciudad) : locations;

  const update = (field) => (event) => {
    const value = event.target.type === 'checkbox' ? event.target.checked : event.target.value;
    setValues((current) => ({ ...current, [field]: value }));
    if (errors[field]) setErrors((current) => ({ ...current, [field]: undefined }));
  };

  const openWhatsapp = () => window.open(buildWhatsappUrl(whatsapp, buildTrialMessage(values)), '_blank', 'noopener');

  const submit = async (event) => {
    event.preventDefault();
    const found = validateTrialRequest(values);
    setErrors(found);
    setFailure('');
    if (Object.keys(found).length > 0) return;

    setStatus('sending');
    try {
      await api.registrarInteresado({ ...buildLeadPayload(values, catalog), ...(trap && { website: trap }) });
      setStatus('saved');
    } catch (error) {
      // A rejected form (4xx) is shown as is; an unreachable or failing server
      // falls back to WhatsApp so the person is not lost.
      if (error.status >= 400 && error.status < 500) {
        setFailure(error.message);
        setStatus('idle');
      } else {
        openWhatsapp();
        setStatus('whatsapp');
      }
    }
  };

  const fieldProps = (field) => ({
    id: `trial-${field}`,
    name: field,
    value: values[field],
    onChange: update(field),
    'aria-invalid': Boolean(errors[field]),
    'aria-describedby': errors[field] ? `trial-${field}-error` : undefined,
  });

  const error = (field) =>
    errors[field] ? (
      <span className="trial__error" id={`trial-${field}-error`}>
        {errors[field]}
      </span>
    ) : null;

  if (status === 'saved') {
    return (
      <div className="trial trial--done" role="status">
        <h3>¡Recibimos tu solicitud!</h3>
        <p>Te contactaremos pronto para coordinar tu clase de prueba gratuita.</p>
        <a className="btn btn--ghost" href={buildWhatsappUrl(whatsapp, 'Hola, acabo de dejar mi solicitud de clase de prueba en el sitio.')} target="_blank" rel="noopener">
          Escribirnos también por WhatsApp
        </a>
      </div>
    );
  }

  return (
    <form className="trial" onSubmit={submit} noValidate>
      <div className="trial__row">
        <label htmlFor="trial-name">Nombre completo</label>
        <input type="text" autoComplete="name" {...fieldProps('name')} />
        {error('name')}
      </div>
      <div className="trial__grid">
        <div className="trial__row">
          <label htmlFor="trial-email">Correo electrónico</label>
          <input type="email" autoComplete="email" {...fieldProps('email')} />
          {error('email')}
        </div>
        <div className="trial__row">
          <label htmlFor="trial-telefono">Teléfono (opcional)</label>
          <input type="tel" autoComplete="tel" {...fieldProps('telefono')} />
          {error('telefono')}
        </div>
      </div>
      <div className="trial__grid">
        <div className="trial__row">
          <label htmlFor="trial-discipline">Disciplina</label>
          <select {...fieldProps('discipline')}>
            <option value="">Elige una</option>
            {disciplineNames.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
          {error('discipline')}
        </div>
        <div className="trial__row">
          <label htmlFor="trial-location">Sede</label>
          <select {...fieldProps('location')}>
            <option value="">Elige una</option>
            {locationNames.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
          {error('location')}
        </div>
      </div>
      <div className="trial__row">
        <label htmlFor="trial-message">Comentario (opcional)</label>
        <textarea rows={3} placeholder="¿Tienes alguna duda?" {...fieldProps('message')} />
      </div>

      {/* Hidden from people; bots tend to fill every field. */}
      <div className="trial__trap" aria-hidden="true">
        <label htmlFor="trial-website">No completar este campo</label>
        <input id="trial-website" type="text" tabIndex={-1} autoComplete="off" value={trap} onChange={(e) => setTrap(e.target.value)} />
      </div>

      <div className="trial__row">
        <label className="trial__consent">
          <input type="checkbox" checked={values.consent} onChange={update('consent')} aria-invalid={Boolean(errors.consent)} />
          <span>
            Acepto que Shaolin Chile guarde mis datos para contactarme por esta solicitud, según la{' '}
            <a href={appPath('privacidad/')} target="_blank" rel="noopener">
              política de privacidad
            </a>
            .
          </span>
        </label>
        {error('consent')}
      </div>

      {failure && (
        <p className="trial__error" role="alert">
          {failure}
        </p>
      )}
      <button className="btn btn--gold trial__submit" type="submit" disabled={status === 'sending'}>
        {status === 'sending' ? 'Enviando…' : 'Solicitar clase de prueba'}
      </button>
      <p className="trial__note" role="status">
        {status === 'whatsapp'
          ? 'No pudimos guardar tu solicitud en el sitio, así que abrimos WhatsApp. Envía el mensaje para confirmar.'
          : 'Te responderemos para coordinar el día y la hora.'}
      </p>
    </form>
  );
}
