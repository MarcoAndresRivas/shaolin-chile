import { useState } from 'react';
import { validateTrialRequest, buildTrialMessage, buildWhatsappUrl } from '../lib/trialClass.js';
import './TrialClassForm.css';

const EMPTY = { name: '', email: '', discipline: '', location: '', message: '' };

export default function TrialClassForm({ disciplines, locations, whatsapp }) {
  const [values, setValues] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [sent, setSent] = useState(false);

  const update = (field) => (event) => {
    setValues((current) => ({ ...current, [field]: event.target.value }));
    if (errors[field]) setErrors((current) => ({ ...current, [field]: undefined }));
  };

  const submit = (event) => {
    event.preventDefault();
    const found = validateTrialRequest(values);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    window.open(buildWhatsappUrl(whatsapp, buildTrialMessage(values)), '_blank', 'noopener');
    setSent(true);
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

  return (
    <form className="trial" onSubmit={submit} noValidate>
      <div className="trial__row">
        <label htmlFor="trial-name">Nombre completo</label>
        <input type="text" autoComplete="name" {...fieldProps('name')} />
        {error('name')}
      </div>
      <div className="trial__row">
        <label htmlFor="trial-email">Correo electrónico</label>
        <input type="email" autoComplete="email" {...fieldProps('email')} />
        {error('email')}
      </div>
      <div className="trial__grid">
        <div className="trial__row">
          <label htmlFor="trial-discipline">Disciplina</label>
          <select {...fieldProps('discipline')}>
            <option value="">Elige una</option>
            {disciplines.map((name) => (
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
            {locations.map((name) => (
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
      <button className="btn btn--gold trial__submit" type="submit">
        Enviar por WhatsApp
      </button>
      <p className="trial__note" role="status">
        {sent
          ? 'Abrimos WhatsApp con tu solicitud. Envía el mensaje para confirmar.'
          : 'Te responderemos por WhatsApp para coordinar el día y la hora.'}
      </p>
    </form>
  );
}
