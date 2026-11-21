import { useEffect, useRef, useState } from 'react';
import { api, appPath } from '../lib/client.js';
import { formatPesos } from '../lib/money.js';
import { cartItems, cleanCart, dayLabel, offerImage, storeLines, validateBuyer, validateDelivery } from '../lib/ventas.js';
import BuyerFields from './BuyerFields.jsx';
import './TrialClassForm.css';
import './Tienda.css';

const BASE = import.meta.env.BASE_URL;
const MAX_UNITS = 10; // units of one size in one purchase, as the server allows
const STORAGE_KEY = 'shaolin:carro';
const EMPTY_BUYER = { nombre: '', email: '', telefono: '', consentimiento: false };
const EMPTY_DELIVERY = { entrega: '', direccion: '', comuna: '', region: '' };

// Browser storage can be blocked (private windows): the cart then lives only on the page.
const readSaved = () => {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null'); } catch { return null; }
};
const save = (cart) => {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(cart)); } catch { /* nothing to keep */ }
};

// Sizes like 38 or M are "Talla"; anything else (colors, lengths) is "Opción".
const sizeLabel = (tallas) => (tallas.every((t) => /^(\d|XS$|S$|M$|L$|XL$|XXL$)/.test(t.talla)) ? 'Talla' : 'Opción');

// The store: a grid of products, sizes as buttons, and a side cart where the
// person reviews the order, chooses shipping (always) or pickup at the seminar
// (only seminar suggestions) and pays by transfer. Prices show only in the cart.
export default function Tienda({ whatsapp }) {
  const drawer = useRef(null);
  const [productos, setProductos] = useState(null);
  const [loadError, setLoadError] = useState(false);
  const [cart, setCart] = useState({}); // { [tallaId]: cantidad }
  const [picked, setPicked] = useState({}); // { [productoId]: tallaId }
  const [step, setStep] = useState('carro'); // carro | pago | listo
  const [announce, setAnnounce] = useState('');
  const [buyer, setBuyer] = useState(EMPTY_BUYER);
  const [delivery, setDelivery] = useState(EMPTY_DELIVERY);
  const [deliveryErrors, setDeliveryErrors] = useState({});
  const [errors, setErrors] = useState({});
  const [trap, setTrap] = useState('');
  const [sending, setSending] = useState(false);
  const [failure, setFailure] = useState('');
  const [purchase, setPurchase] = useState(null);

  const load = (keep) => {
    setLoadError(false);
    return api.ofertas()
      .then(({ productos: list = [] }) => {
        setProductos(list);
        setCart((current) => cleanCart(keep ?? current, list));
      })
      .catch(() => setLoadError(true));
  };
  useEffect(() => { load(readSaved()); }, []); // eslint-disable-line react-hooks/exhaustive-deps -- once, with the saved cart
  useEffect(() => { if (productos) save(cart); }, [cart, productos]);

  const { lines, count, total } = storeLines(cart, productos ?? []);
  const canPickup = lines.length > 0 && lines.every((line) => line.retiro);
  const entrega = delivery.entrega === 'retiro' && !canPickup ? '' : delivery.entrega;
  const open = (next = 'carro') => {
    setStep(next);
    if (!drawer.current.open) drawer.current.showModal();
  };
  const close = () => drawer.current.close();
  const setQty = (tallaId, cantidad, disponible) =>
    setCart((current) => {
      const next = { ...current, [tallaId]: Math.max(0, Math.min(MAX_UNITS, disponible, cantidad)) };
      if (!next[tallaId]) delete next[tallaId];
      return next;
    });

  const add = (producto, talla) => {
    setQty(talla.id, (cart[talla.id] ?? 0) + 1, talla.disponible);
    setAnnounce(`${producto.titulo}${producto.tallas.length > 1 ? `, ${talla.talla}` : ''} agregado al carro.`);
    open('carro');
  };

  const update = (field) => (event) => {
    const value = event.target.type === 'checkbox' ? event.target.checked : event.target.value;
    setBuyer((current) => ({ ...current, [field]: value }));
    if (errors[field]) setErrors((current) => ({ ...current, [field]: undefined }));
  };

  const setDeliveryField = (field) => (event) => {
    setDelivery((current) => ({ ...current, [field]: event.target.value }));
    if (deliveryErrors[field]) setDeliveryErrors((current) => ({ ...current, [field]: undefined }));
  };

  const pay = async (event) => {
    event.preventDefault();
    setFailure('');
    const found = validateBuyer(buyer);
    const missing = validateDelivery({ ...delivery, entrega });
    setErrors(found);
    setDeliveryErrors(missing);
    if (Object.keys(found).length || Object.keys(missing).length || !lines.length) return;
    setSending(true);
    try {
      const result = await api.comprar({
        nombre: buyer.nombre.trim(),
        email: buyer.email.trim(),
        ...(buyer.telefono.trim() && { telefono: buyer.telefono.trim() }),
        consentimiento: true,
        items: cartItems({ days: {}, courses: [], products: cart }),
        entrega,
        ...(entrega === 'envio' && { direccion: delivery.direccion.trim(), comuna: delivery.comuna.trim(), region: delivery.region.trim() }),
        ...(trap && { website: trap }),
      });
      setPurchase({ ...result, email: buyer.email.trim(), nombre: buyer.nombre.trim() });
      setCart({});
      setStep('listo');
    } catch (error) {
      setFailure(error.status >= 400 && error.status < 500 ? error.message : 'No pudimos registrar tu pedido. Inténtalo de nuevo o escríbenos por WhatsApp.');
      if (error.status === 409) load(); // stock or the pickup presale changed: show the current ones
    } finally {
      setSending(false);
    }
  };

  if (loadError) {
    return (
      <div className="store-empty" role="status">
        <p>No pudimos cargar la tienda en este momento.</p>
        <div className="store-empty__actions">
          <button className="btn btn--ghost" type="button" onClick={() => load()}>Reintentar</button>
          <a className="btn btn--gold" href={`https://wa.me/${whatsapp}?text=${encodeURIComponent('Hola, quiero comprar en la tienda.')}`} target="_blank" rel="noopener">Comprar por WhatsApp</a>
        </div>
      </div>
    );
  }
  if (!productos) return <p className="store-empty" role="status">Cargando la tienda…</p>;

  return (
    <div className="store">
      <div className="store-bar">
        <p className="store-bar__count">{productos.length} productos · envío a todo Chile</p>
        <button className="store-bar__cart" type="button" onClick={() => open('carro')} aria-label={`Abrir el carro, ${count} ${count === 1 ? 'producto' : 'productos'}`}>
          <svg viewBox="0 0 24 24" aria-hidden="true" width="20" height="20"><path d="M6 7h12l-1 13H7L6 7Zm3 0a3 3 0 0 1 6 0" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" /></svg>
          <span>Carro</span>
          <span className="store-bar__badge" aria-hidden="true">{count}</span>
        </button>
      </div>
      <p className="sr-only" aria-live="polite">{announce}</p>

      {productos.length === 0 && <p className="store-empty">Pronto publicaremos los productos.</p>}

      {/* No price on the cards: it shows in the cart, at the moment of paying. */}
      <div className="store-grid">
        {productos.map((producto) => {
          const image = offerImage(producto.imagen, BASE);
          const single = producto.tallas.length === 1 ? producto.tallas[0] : null;
          const talla = single ?? producto.tallas.find((t) => t.id === picked[producto.id]);
          const soldOut = producto.tallas.every((t) => t.disponible === 0);
          const pickup = producto.sugerido_seminario && !producto.cerrado;
          const full = talla && (cart[talla.id] ?? 0) >= Math.min(MAX_UNITS, talla.disponible);
          return (
            <article key={producto.id} className="store-card">
              <div className="store-card__photo">
                {image && <img src={image} alt={producto.titulo} loading="lazy" />}
                {soldOut && <span className="store-card__flag">Agotado</span>}
                {!soldOut && pickup && <span className="store-card__flag store-card__flag--gold">Sugerido para el seminario</span>}
              </div>
              <div className="store-card__body">
                <h2>{producto.titulo}</h2>
                {producto.descripcion && <p className="store-card__text">{producto.descripcion}</p>}
                {!soldOut && !single && (
                  <fieldset className="store-sizes">
                    <legend>{sizeLabel(producto.tallas)}</legend>
                    <div className="store-sizes__list">
                      {producto.tallas.map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          className="store-size"
                          aria-pressed={talla?.id === t.id}
                          disabled={t.disponible === 0}
                          onClick={() => setPicked((p) => ({ ...p, [producto.id]: t.id }))}
                        >
                          {t.talla}
                        </button>
                      ))}
                    </div>
                  </fieldset>
                )}
                {talla && !soldOut && talla.disponible <= 2 && <p className="store-card__low">Últimas {talla.disponible} {talla.disponible === 1 ? 'unidad' : 'unidades'}</p>}
                <p className="store-card__note">
                  Envío a todo Chile.
                  {pickup && (producto.cierre_preventa ? ` También puedes retirarlo en el seminario si reservas hasta el ${dayLabel(producto.cierre_preventa)}.` : ' También puedes retirarlo en el seminario.')}
                </p>
                <button
                  className="btn btn--gold store-card__add"
                  type="button"
                  disabled={soldOut || !talla || full}
                  onClick={() => add(producto, talla)}
                >
                  {soldOut ? 'No disponible' : !talla ? `Elige ${sizeLabel(producto.tallas).toLowerCase()}` : full ? 'Máximo en el carro' : 'Agregar al carro'}
                </button>
              </div>
            </article>
          );
        })}
      </div>

      <dialog ref={drawer} className="cart-drawer" aria-labelledby="cart-title" onClick={(e) => e.target === drawer.current && close()}>
        <div className="cart-drawer__panel">
          <header className="cart-drawer__head">
            <h2 id="cart-title">{step === 'listo' ? 'Pedido registrado' : step === 'pago' ? 'Pago' : `Tu carro (${count})`}</h2>
            <button className="cart-drawer__close" type="button" onClick={close} aria-label="Cerrar el carro">×</button>
          </header>

          {step === 'carro' && (
            <>
              {lines.length === 0 ? (
                <div className="cart-drawer__empty">
                  <p>Tu carro está vacío.</p>
                  <button className="btn btn--ghost" type="button" onClick={close}>Seguir mirando</button>
                </div>
              ) : (
                <ul className="cart-lines">
                  {lines.map((line) => {
                    const image = offerImage(line.imagen, BASE);
                    return (
                      <li key={line.tallaId} className="cart-line">
                        <div className="cart-line__photo">{image && <img src={image} alt="" />}</div>
                        <div className="cart-line__info">
                          <p className="cart-line__title">{line.titulo}</p>
                          {line.talla !== 'Única' && <p className="cart-line__size">{line.talla}</p>}
                          <div className="qty" role="group" aria-label={`Unidades de ${line.titulo} ${line.talla}`}>
                            <button type="button" onClick={() => setQty(line.tallaId, line.cantidad - 1, line.disponible)} aria-label="Una unidad menos">−</button>
                            <output aria-live="polite">{line.cantidad}</output>
                            <button type="button" onClick={() => setQty(line.tallaId, line.cantidad + 1, line.disponible)} disabled={line.cantidad >= Math.min(MAX_UNITS, line.disponible)} aria-label="Una unidad más">+</button>
                          </div>
                        </div>
                        <div className="cart-line__end">
                          <p className="cart-line__amount">{formatPesos(line.monto)}</p>
                          <button className="cart-line__remove" type="button" onClick={() => setQty(line.tallaId, 0, line.disponible)}>Quitar</button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
              {lines.length > 0 && (
                <footer className="cart-drawer__foot">
                  <p className="cart-total"><span>Total</span><strong>{formatPesos(total)}</strong></p>
                  <p className="cart-drawer__hint">Pagas por transferencia. Envío a todo Chile, o retiro en el seminario para los productos sugeridos.</p>
                  <button className="btn btn--gold cart-drawer__go" type="button" onClick={() => setStep('pago')}>Continuar al pago</button>
                </footer>
              )}
            </>
          )}

          {step === 'pago' && (
            <form className="cart-pay trial" onSubmit={pay} noValidate>
              <button className="cart-back" type="button" onClick={() => setStep('carro')}>← Volver al carro</button>
              <ul className="cart-summary">
                {lines.map((line) => (
                  <li key={line.tallaId}>
                    <span>{line.titulo}{line.talla !== 'Única' ? ` · ${line.talla}` : ''} × {line.cantidad}</span>
                    <span>{formatPesos(line.monto)}</span>
                  </li>
                ))}
                <li className="cart-summary__total"><span>Total</span><span>{formatPesos(total)}</span></li>
              </ul>
              <fieldset className="cart-delivery">
                <legend>¿Cómo recibes tu pedido?</legend>
                <label className="cart-option">
                  <input type="radio" name="entrega" value="envio" checked={entrega === 'envio'} onChange={setDeliveryField('entrega')} />
                  <span><strong>Envío a domicilio</strong><small>Por courier a todo Chile. El envío se paga al recibir.</small></span>
                </label>
                <label className={`cart-option${canPickup ? '' : ' cart-option--off'}`}>
                  <input type="radio" name="entrega" value="retiro" checked={entrega === 'retiro'} disabled={!canPickup} onChange={setDeliveryField('entrega')} />
                  <span><strong>Retiro en el seminario</strong><small>{canPickup ? 'Sujeto a disponibilidad. Retiras en la mesa de venta con tu código.' : 'Solo para productos sugeridos del seminario, mientras la preventa esté abierta.'}</small></span>
                </label>
                {deliveryErrors.entrega && <span className="trial__error">{deliveryErrors.entrega}</span>}
              </fieldset>
              {entrega === 'envio' && (
                <div className="cart-address">
                  <div className="trial__row">
                    <label htmlFor="cart-direccion">Dirección (calle y número)</label>
                    <input id="cart-direccion" type="text" autoComplete="street-address" value={delivery.direccion} onChange={setDeliveryField('direccion')} aria-invalid={Boolean(deliveryErrors.direccion)} />
                    {deliveryErrors.direccion && <span className="trial__error">{deliveryErrors.direccion}</span>}
                  </div>
                  <div className="trial__grid">
                    <div className="trial__row">
                      <label htmlFor="cart-comuna">Comuna</label>
                      <input id="cart-comuna" type="text" autoComplete="address-level2" value={delivery.comuna} onChange={setDeliveryField('comuna')} aria-invalid={Boolean(deliveryErrors.comuna)} />
                      {deliveryErrors.comuna && <span className="trial__error">{deliveryErrors.comuna}</span>}
                    </div>
                    <div className="trial__row">
                      <label htmlFor="cart-region">Región</label>
                      <input id="cart-region" type="text" autoComplete="address-level1" value={delivery.region} onChange={setDeliveryField('region')} aria-invalid={Boolean(deliveryErrors.region)} />
                      {deliveryErrors.region && <span className="trial__error">{deliveryErrors.region}</span>}
                    </div>
                  </div>
                </div>
              )}
              <BuyerFields buyer={buyer} errors={errors} update={update} trap={trap} setTrap={setTrap} prefix="cart" />
              {failure && <p className="trial__error" role="alert">{failure}</p>}
              <button className="btn btn--gold cart-drawer__go" type="submit" disabled={sending || !lines.length}>
                {sending ? 'Registrando…' : `Confirmar pedido · ${formatPesos(total)}`}
              </button>
              <p className="cart-drawer__hint">Al confirmar recibes el código del pedido y los datos para transferir.</p>
            </form>
          )}

          {step === 'listo' && purchase && (
            <div className="cart-done" role="status">
              <p className="cart-done__code">Código: <strong>{purchase.codigo}</strong></p>
              <p className="cart-done__message">{purchase.mensaje}</p>
              <div className="cart-done__actions">
                <a className="btn btn--gold" href={`${appPath('mi-compra/')}?codigo=${encodeURIComponent(purchase.codigo)}&email=${encodeURIComponent(purchase.email)}`}>Ver mi pedido</a>
                <a
                  className="btn btn--ghost"
                  href={`https://wa.me/${whatsapp}?text=${encodeURIComponent(`Hola, envío el comprobante de mi pedido ${purchase.codigo}. Mi nombre completo es ${purchase.nombre}.`)}`}
                  target="_blank"
                  rel="noopener"
                >
                  Enviar comprobante por WhatsApp
                </a>
                <button className="cart-back" type="button" onClick={() => { close(); setStep('carro'); }}>Seguir comprando</button>
              </div>
            </div>
          )}
        </div>
      </dialog>
    </div>
  );
}
