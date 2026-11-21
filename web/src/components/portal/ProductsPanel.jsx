import { useCallback, useState } from 'react';
import { api } from '../../lib/client.js';
import { formatPesos, parsePesos } from '../../lib/money.js';
import { pickupList, pickupTotals, shippingList } from '../../lib/ventas.js';
import { useApi } from './useApi.js';

const ESTADOS = { borrador: 'Borrador', publicado: 'Publicado', cerrado: 'Cerrado' };
const EMPTY_PRODUCT = { titulo: '', precio: '', cierre: '', imagen: '' };

// Administration: products sold with sizes and stock (uniforms, event t-shirts,
// staffs, shoes), what to ship and what to hand out at the seminar. A new
// product starts as a draft; publishing it puts it on sale in the store.
export default function ProductsPanel({ onUnauthorized }) {
  const catalog = useApi(useCallback(() => api.catalogoVentas(), []), onUnauthorized);
  const purchases = useApi(useCallback(() => api.compras(), []), onUnauthorized);
  const [notice, setNotice] = useState({ text: '', error: false });
  const [product, setProduct] = useState(EMPTY_PRODUCT);
  const [newSize, setNewSize] = useState({}); // { [productoId]: { talla, stock } }
  const [stockEdits, setStockEdits] = useState({}); // { [tallaId]: '12' }

  const run = async (action, success) => {
    setNotice({ text: '', error: false });
    try {
      await action();
      setNotice({ text: success, error: false });
      catalog.reload();
      return true;
    } catch (failure) {
      if (failure.status === 401) onUnauthorized();
      else setNotice({ text: failure.message, error: true });
      return false;
    }
  };

  const create = async (event) => {
    event.preventDefault();
    const precio = parsePesos(product.precio);
    if (product.titulo.trim().length < 3 || !precio) {
      setNotice({ text: 'Escribe un nombre de al menos 3 letras y un precio en pesos.', error: true });
      return;
    }
    const body = { titulo: product.titulo.trim(), precio, ...(product.cierre && { cierre_preventa: product.cierre }), ...(product.imagen.trim() && { imagen: product.imagen.trim() }) };
    if (await run(() => api.crearProducto(body), `Producto "${body.titulo}" creado como borrador. Agrega sus tallas y publícalo.`)) setProduct(EMPTY_PRODUCT);
  };

  const addSize = async (event, productoId) => {
    event.preventDefault();
    const { talla = '', stock = '' } = newSize[productoId] ?? {};
    if (await run(() => api.agregarTalla(productoId, talla.trim(), Number(stock)), `Talla ${talla.trim()} agregada.`)) {
      setNewSize((current) => ({ ...current, [productoId]: { talla: '', stock: '' } }));
    }
  };

  const toHandOut = pickupList(purchases.data ?? []);
  const toShip = shippingList(purchases.data ?? []);
  const toOrder = pickupTotals(purchases.data ?? []);

  return (
    <section className="panel panel--wide">
      <h2>Productos</h2>
      <p className="muted">Uniformes, poleras, varas y zapatillas. En el sitio no se muestra el precio: aparece al pagar. Se envían a todo Chile; los sugeridos para el seminario también se pueden retirar ahí.</p>
      {notice.text && (
        <p className={notice.error ? 'alert' : 'success'} role="status">
          {notice.text}
        </p>
      )}
      {catalog.error && <p className="alert">{catalog.error}</p>}

      <h3>Nuevo producto</h3>
      <form className="availability-row" onSubmit={create}>
        <input type="text" aria-label="Nombre del producto" placeholder="Nombre" value={product.titulo} onChange={(e) => setProduct((p) => ({ ...p, titulo: e.target.value }))} />
        <input type="text" inputMode="numeric" aria-label="Precio" placeholder="Precio" value={product.precio} onChange={(e) => setProduct((p) => ({ ...p, precio: e.target.value }))} />
        <input type="date" aria-label="Último día de preventa (opcional)" value={product.cierre} onChange={(e) => setProduct((p) => ({ ...p, cierre: e.target.value }))} />
        <input type="text" aria-label="Foto: archivo en /ofertas o dirección https (opcional)" placeholder="Foto (opcional)" value={product.imagen} onChange={(e) => setProduct((p) => ({ ...p, imagen: e.target.value }))} />
        <button className="btn btn--gold btn--small" type="submit">Crear</button>
      </form>

      <h3>Catálogo</h3>
      {catalog.data?.productos.length === 0 && <p className="muted">Aún no hay productos.</p>}
      <ul className="list">
        {catalog.data?.productos.map((p) => (
          <li key={p.id} className="list__item list__item--stack">
            <div>
              <p className="list__title">
                {p.titulo} · {formatPesos(p.precio)} <span className="tag">{ESTADOS[p.estado] ?? p.estado}</span>
                {Boolean(p.sugerido_seminario) && <span className="tag">Sugerido para el seminario</span>}
              </p>
              <p className="muted">{p.cierre_preventa ? `Retiro en el seminario: preventa hasta el ${p.cierre_preventa}` : 'Sin fecha de cierre para el retiro'}</p>
              <ul className="list">
                {p.tallas.map((t) => (
                  <li key={t.id} className="availability-row">
                    <span>
                      Talla {t.talla} · vendidas {t.vendidos} de {t.stock}
                    </span>
                    <input type="number" min={t.vendidos} aria-label={`Stock de la talla ${t.talla}`} value={stockEdits[t.id] ?? t.stock} onChange={(e) => setStockEdits((s) => ({ ...s, [t.id]: e.target.value }))} />
                    <button className="btn btn--ghost btn--small" type="button" onClick={() => run(() => api.actualizarTalla(t.id, Number(stockEdits[t.id] ?? t.stock)), `Stock de la talla ${t.talla} guardado.`)}>
                      Guardar stock
                    </button>
                  </li>
                ))}
              </ul>
              <form className="availability-row" onSubmit={(e) => addSize(e, p.id)}>
                <input type="text" aria-label={`Nueva talla de ${p.titulo}`} placeholder="Talla (S, 40, Única)" value={newSize[p.id]?.talla ?? ''} onChange={(e) => setNewSize((s) => ({ ...s, [p.id]: { ...s[p.id], talla: e.target.value } }))} />
                <input type="number" min="0" aria-label={`Stock de la nueva talla de ${p.titulo}`} placeholder="Stock" value={newSize[p.id]?.stock ?? ''} onChange={(e) => setNewSize((s) => ({ ...s, [p.id]: { ...s[p.id], stock: e.target.value } }))} />
                <button className="btn btn--ghost btn--small" type="submit">Agregar talla</button>
              </form>
            </div>
            <div className="list__actions">
              <button
                className="btn btn--ghost btn--small"
                type="button"
                onClick={() => run(() => api.actualizarProducto(p.id, { sugerido_seminario: !p.sugerido_seminario }), p.sugerido_seminario ? `"${p.titulo}" ya no es sugerido para el seminario.` : `"${p.titulo}" es sugerido para el seminario.`)}
              >
                {p.sugerido_seminario ? 'Quitar de sugeridos' : 'Sugerir para el seminario'}
              </button>
              {p.estado !== 'publicado' && (
                <button className="btn btn--gold btn--small" type="button" disabled={!p.tallas.length} onClick={() => run(() => api.actualizarProducto(p.id, { estado: 'publicado' }), `"${p.titulo}" está a la venta.`)}>
                  Publicar
                </button>
              )}
              {p.estado === 'publicado' && (
                <button className="btn btn--ghost btn--small" type="button" onClick={() => run(() => api.actualizarProducto(p.id, { estado: 'cerrado' }), `"${p.titulo}" ya no se vende.`)}>
                  Cerrar venta
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>

      <h3>Para enviar</h3>
      {toShip.length === 0 && <p className="muted">No hay pedidos para enviar.</p>}
      <ul className="list">
        {toShip.map((c) => (
          <li key={c.codigo} className="list__item">
            <div>
              <p className="list__title">
                {c.nombre} · {c.codigo}
              </p>
              <p className="muted">{c.direccion}</p>
              <p className="muted">{c.items.map((i) => `${i.descripcion} × ${i.cantidad}`).join(' · ')}</p>
            </div>
            <span className="tag">{c.estado === 'pagada' ? 'Pagada' : 'Pago pendiente'}</span>
          </li>
        ))}
      </ul>

      <h3>Para entregar en el seminario</h3>
      {purchases.error && <p className="alert">{purchases.error}</p>}
      {toHandOut.length === 0 && <p className="muted">No hay pedidos para retirar en el seminario.</p>}
      <ul className="list">
        {toHandOut.map((c) => (
          <li key={c.codigo} className="list__item">
            <div>
              <p className="list__title">
                {c.nombre} · {c.codigo}
              </p>
              <p className="muted">{c.items.map((i) => `${i.descripcion} × ${i.cantidad}`).join(' · ')}</p>
            </div>
            <span className="tag">{c.estado === 'pagada' ? 'Pagada' : 'Pago pendiente'}</span>
          </li>
        ))}
      </ul>
      {toOrder.length > 0 && (
        <>
          <h3>Total para encargar</h3>
          <ul className="list">
            {toOrder.map((t) => (
              <li key={t.descripcion} className="list__item">
                <p className="list__title">{t.descripcion}</p>
                <span className="tag">{t.cantidad}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
