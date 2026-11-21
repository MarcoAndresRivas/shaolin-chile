import { useEffect, useState } from 'react';
import { api, appPath } from '../lib/client.js';
import { formatPesos } from '../lib/money.js';
import { cartItems, dayLabel, emptyCart, estimate, hoursLabel, offerImage, validateBuyer } from '../lib/ventas.js';
import './TrialClassForm.css';
import './Ofertas.css';

const BASE = import.meta.env.BASE_URL;
const EMPTY_BUYER = { nombre: '', email: '', telefono: '', consentimiento: false };
const MAX_TICKETS = 10;

// Seminars by day and online courses with their photo; a cart and the purchase,
// paid by transfer. Seminar prices and the offer show only in the checkout, at
// the moment of paying. Without the server it sends people to WhatsApp, so
// nobody is left without a way to book.
export default function Ofertas({ whatsapp }) {
  const [catalog, setCatalog] = useState(null);
  const [loadError, setLoadError] = useState(false);
  const [cart, setCart] = useState(emptyCart);
  const [buyer, setBuyer] = useState(EMPTY_BUYER);
  const [errors, setErrors] = useState({});
  const [trap, setTrap] = useState('');
  const [status, setStatus] = useState('idle'); // idle | sending | done
  const [failure, setFailure] = useState('');
  const [purchase, setPurchase] = useState(null);

  const load = () => {
    setLoadError(false);
    api.ofertas().then(setCatalog).catch(() => setLoadError(true));
  };
  useEffect(load, []);

  const setDay = (id, cantidad) => setCart((current) => ({ ...current, days: { ...current.days, [id]: Math.max(0, Math.min(MAX_TICKETS, cantidad)) } }));
  const allDays = (seminario, on) =>
    setCart((current) => ({
      ...current,
      days: { ...current.days, ...Object.fromEntries(seminario.dias.filter((d) => !d.cerrado).map((d) => [d.id, on ? Math.max(1, current.days[d.id] ?? 0) : 0])) },
    }));
  const toggleCourse = (id) =>
    setCart((current) => ({ ...current, courses: current.courses.includes(id) ? current.courses.filter((c) => c !== id) : [...current.courses, id] }));

  const update = (field) => (event) => {
    const value = event.target.type === 'checkbox' ? event.target.checked : event.target.value;
    setBuyer((current) => ({ ...current, [field]: value }));
    if (errors[field]) setErrors((current) => ({ ...current, [field]: undefined }));
  };

  const summary = estimate(cart, catalog);
  const items = cartItems(cart);

  const submit = async (event) => {
    event.preventDefault();
    setFailure('');
    const found = validateBuyer(buyer);
    setErrors(found);
    if (!items.length) {
      setFailure('Elige al menos un día del seminario o un curso.');
      return;
    }
    if (Object.keys(found).length) return;
    setStatus('sending');
    try {
      const result = await api.comprar({
        nombre: buyer.nombre.trim(),
        email: buyer.email.trim(),
        ...(buyer.telefono.trim() && { telefono: buyer.telefono.trim() }),
        consentimiento: true,
        items,
        ...(trap && { website: trap }),
      });
      setPurchase({ ...result, email: buyer.email.trim() });
      setStatus('done');
    } catch (error) {
      setFailure(error.status >= 400 && error.status < 500 ? error.message : 'No pudimos registrar tu reserva. Inténtalo de nuevo o escríbenos por WhatsApp.');
      setStatus('idle');
      if (error.status === 409) load(); // seats or closing changed: show the current ones
    }
  };

  if (loadError) {
    return (
      <div className="shop__empty" role="status">
        <p>No pudimos cargar los seminarios y cursos en este momento.</p>
        <div className="shop__actions">
          <button className="btn btn--ghost" type="button" onClick={load}>Reintentar</button>
          <a className="btn btn--gold" href={`https://wa.me/${whatsapp}?text=${encodeURIComponent('Hola, quiero reservar el seminario.')}`} target="_blank" rel="noopener">
            Reservar por WhatsApp
          </a>
        </div>
      </div>
    );
  }
  if (!catalog) return <p className="shop__empty" role="status">Cargando seminarios y cursos…</p>;

  if (status === 'done' && purchase) {
    return (
      <div className="trial trial--done shop__done" role="status">
        <h3>¡Tu reserva quedó registrada!</h3>
        <p className="shop__code">
          Código de reserva: <strong>{purchase.codigo}</strong>
        </p>
        <p className="shop__message">{purchase.mensaje}</p>
        <p className="muted">También puedes revisar el estado de tu compra y avisarnos de tu transferencia en "Mi compra".</p>
        <div className="shop__actions">
          <a className="btn btn--gold" href={`${appPath('mi-compra/')}?codigo=${encodeURIComponent(purchase.codigo)}&email=${encodeURIComponent(purchase.email)}`}>
            Ver mi compra
          </a>
          <a
            className="btn btn--ghost"
            href={`https://wa.me/${whatsapp}?text=${encodeURIComponent(`Hola, envío el comprobante de mi reserva ${purchase.codigo}. Mi nombre completo es ${buyer.nombre.trim()}.`)}`}
            target="_blank"
            rel="noopener"
          >
            Enviar comprobante por WhatsApp
          </a>
        </div>
      </div>
    );
  }

  const nothing = !catalog.seminarios.length && !catalog.cursos.length;

  return (
    <div className="shop">
      {nothing && <p className="shop__empty">Pronto publicaremos los próximos seminarios y cursos.</p>}

      {catalog.seminarios.map((seminario) => {
        const open = seminario.dias.filter((d) => !d.cerrado && d.cupo_disponible > 0);
        const chosenAll = open.length > 0 && open.length === seminario.dias.length && open.every((d) => cart.days[d.id] > 0);
        const image = offerImage(seminario.imagen, BASE);
        return (
          <article key={seminario.id} className="offer">
            {image && <img className="offer__image" src={image} alt="" loading="lazy" />}
            <div className="offer__body">
              <p className="eyebrow">Seminario</p>
              <h2>{seminario.titulo}</h2>
              {seminario.descripcion && <p>{seminario.descripcion}</p>}
              <p className="muted">Sede: {seminario.sede ?? 'Por confirmar'}</p>

              <fieldset className="offer__days">
                <legend>Elige los días y cuántas personas van</legend>
                {seminario.dias.map((dia) => {
                  const unavailable = dia.cerrado || dia.cupo_disponible === 0;
                  const cantidad = cart.days[dia.id] ?? 0;
                  return (
                    <div key={dia.id} className={`day${unavailable ? ' day--off' : ''}`}>
                      <div>
                        <p className="day__name">{dayLabel(dia.fecha)}</p>
                        <p className="muted">
                          {hoursLabel(dia)} ·{' '}
                          {dia.cerrado ? 'Inscripciones cerradas' : dia.cupo_disponible === 0 ? 'Sin cupos' : `${dia.cupo_disponible} cupos`}
                        </p>
                      </div>
                      {!unavailable && (
                        <div className="qty" role="group" aria-label={`Personas para el ${dayLabel(dia.fecha)}`}>
                          <button type="button" onClick={() => setDay(dia.id, cantidad - 1)} disabled={cantidad === 0} aria-label="Una persona menos">−</button>
                          <output aria-live="polite">{cantidad}</output>
                          <button type="button" onClick={() => setDay(dia.id, cantidad + 1)} disabled={cantidad >= Math.min(MAX_TICKETS, dia.cupo_disponible)} aria-label="Una persona más">+</button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </fieldset>
              {seminario.precio_pack && open.length === seminario.dias.length && open.length > 1 && (
                <button className={`btn ${chosenAll ? 'btn--ghost' : 'btn--gold'}`} type="button" onClick={() => allDays(seminario, !chosenAll)}>
                  {chosenAll ? 'Quitar todos los días' : 'Quiero todos los días'}
                </button>
              )}
              {seminario.video_url && (
                <p>
                  <a href={seminario.video_url} target="_blank" rel="noopener">Ver el video del seminario</a>
                </p>
              )}
            </div>
          </article>
        );
      })}

      {catalog.cursos.map((curso) => {
        const image = offerImage(curso.imagen, BASE);
        const added = cart.courses.includes(curso.id);
        return (
          <article key={curso.id} className="offer">
            {image && <img className="offer__image" src={image} alt="" loading="lazy" />}
            <div className="offer__body">
              <p className="eyebrow">Curso online</p>
              <h2>{curso.titulo}</h2>
              <p className="offer__price">{formatPesos(curso.precio)}</p>
              {curso.descripcion && <p>{curso.descripcion}</p>}
              {curso.lecciones.length > 0 && (
                <ol className="offer__lessons">
                  {curso.lecciones.map((leccion) => (
                    <li key={leccion.orden}>
                      {leccion.titulo}
                      {leccion.duracion && <span className="muted"> · {leccion.duracion}</span>}
                    </li>
                  ))}
                </ol>
              )}
              <button className={`btn ${added ? 'btn--ghost' : 'btn--gold'}`} type="button" onClick={() => toggleCourse(curso.id)} aria-pressed={added}>
                {added ? 'Quitar el curso' : 'Agregar el curso'}
              </button>
            </div>
          </article>
        );
      })}

      {!nothing && (
        <form className="trial shop__checkout" onSubmit={submit} noValidate aria-labelledby="checkout-title">
          <h2 id="checkout-title">Tu reserva</h2>
          {summary.lines.length === 0 ? (
            <p className="muted">Elige los días del seminario o un curso.</p>
          ) : (
            <ul className="shop__lines">
              {summary.lines.map((line) => (
                <li key={line.key}>
                  <span>
                    {line.label}
                    {line.cantidad > 1 && ` × ${line.cantidad}`}
                  </span>
                  <span>{formatPesos(line.monto)}</span>
                </li>
              ))}
              {summary.descuento > 0 && (
                <li className="shop__discount">
                  <span>Oferta</span>
                  <span>−{formatPesos(summary.descuento)}</span>
                </li>
              )}
              <li className="shop__total">
                <span>Total</span>
                <span>{formatPesos(summary.total)}</span>
              </li>
            </ul>
          )}

          <div className="trial__row">
            <label htmlFor="buy-nombre">Nombre completo</label>
            <input id="buy-nombre" type="text" autoComplete="name" value={buyer.nombre} onChange={update('nombre')} aria-invalid={Boolean(errors.nombre)} />
            {errors.nombre && <span className="trial__error">{errors.nombre}</span>}
          </div>
          <div className="trial__grid">
            <div className="trial__row">
              <label htmlFor="buy-email">Correo electrónico</label>
              <input id="buy-email" type="email" autoComplete="email" value={buyer.email} onChange={update('email')} aria-invalid={Boolean(errors.email)} />
              {errors.email && <span className="trial__error">{errors.email}</span>}
            </div>
            <div className="trial__row">
              <label htmlFor="buy-telefono">Teléfono (opcional)</label>
              <input id="buy-telefono" type="tel" autoComplete="tel" value={buyer.telefono} onChange={update('telefono')} aria-invalid={Boolean(errors.telefono)} />
              {errors.telefono && <span className="trial__error">{errors.telefono}</span>}
            </div>
          </div>

          {/* Hidden from people; bots tend to fill every field. */}
          <div className="trial__trap" aria-hidden="true">
            <label htmlFor="buy-website">No completar este campo</label>
            <input id="buy-website" type="text" tabIndex={-1} autoComplete="off" value={trap} onChange={(e) => setTrap(e.target.value)} />
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

          {failure && (
            <p className="trial__error" role="alert">
              {failure}
            </p>
          )}
          <button className="btn btn--gold trial__submit" type="submit" disabled={status === 'sending'}>
            {status === 'sending' ? 'Reservando…' : summary.total ? `Reservar por ${formatPesos(summary.total)}` : 'Reservar'}
          </button>
          <p className="trial__note">El pago es por transferencia. Tu cupo queda reservado hasta 12 horas antes del inicio.</p>
        </form>
      )}
    </div>
  );
}
