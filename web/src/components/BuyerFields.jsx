import { appPath } from '../lib/client.js';

// The buyer's name, email, optional phone, bot trap and consent, shared by the
// seminars checkout and the store cart. `prefix` keeps the field ids unique.
export default function BuyerFields({ buyer, errors, update, trap, setTrap, prefix = 'buy' }) {
  return (
    <>
      <div className="trial__row">
        <label htmlFor={`${prefix}-nombre`}>Nombre completo</label>
        <input id={`${prefix}-nombre`} type="text" autoComplete="name" value={buyer.nombre} onChange={update('nombre')} aria-invalid={Boolean(errors.nombre)} />
        {errors.nombre && <span className="trial__error">{errors.nombre}</span>}
      </div>
      <div className="trial__grid">
        <div className="trial__row">
          <label htmlFor={`${prefix}-email`}>Correo electrónico</label>
          <input id={`${prefix}-email`} type="email" autoComplete="email" value={buyer.email} onChange={update('email')} aria-invalid={Boolean(errors.email)} />
          {errors.email && <span className="trial__error">{errors.email}</span>}
        </div>
        <div className="trial__row">
          <label htmlFor={`${prefix}-telefono`}>Teléfono (opcional)</label>
          <input id={`${prefix}-telefono`} type="tel" autoComplete="tel" value={buyer.telefono} onChange={update('telefono')} aria-invalid={Boolean(errors.telefono)} />
          {errors.telefono && <span className="trial__error">{errors.telefono}</span>}
        </div>
      </div>

      {/* Hidden from people; bots tend to fill every field. */}
      <div className="trial__trap" aria-hidden="true">
        <label htmlFor={`${prefix}-website`}>No completar este campo</label>
        <input id={`${prefix}-website`} type="text" tabIndex={-1} autoComplete="off" value={trap} onChange={(e) => setTrap(e.target.value)} />
      </div>

      <div className="trial__row">
        <label className="trial__consent">
          <input type="checkbox" checked={buyer.consentimiento} onChange={update('consentimiento')} aria-invalid={Boolean(errors.consentimiento)} />
          <span>
            Acepto que Shaolin Chile guarde mis datos para gestionar mi compra, según la{' '}
            <a href={appPath('privacidad/')} target="_blank" rel="noopener">política de privacidad</a>.
          </span>
        </label>
        {errors.consentimiento && <span className="trial__error">{errors.consentimiento}</span>}
      </div>
    </>
  );
}
