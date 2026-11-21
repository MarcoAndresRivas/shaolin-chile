import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../lib/client.js';
import { formatPesos } from '../../lib/money.js';
import { useApi } from './useApi.js';

const ORIGEN = { sitio: 'Sitio', instagram: 'Instagram', whatsapp: 'WhatsApp' };
const FILTERS = [
  ['pendiente', 'Pendientes'],
  ['pagada', 'Pagadas'],
  ['anulada', 'Anuladas'],
];

// Administration: seminar and course purchases paid by transfer. A purchase
// counts once it is validated here; cancelling it gives the seats back.
export default function SalesPanel({ onUnauthorized }) {
  const [estado, setEstado] = useState('pendiente');
  const purchases = useApi(useCallback(() => api.compras(estado), [estado]), onUnauthorized);
  const [notice, setNotice] = useState({ text: '', error: false });

  const run = async (action, success) => {
    setNotice({ text: '', error: false });
    try {
      await action();
      setNotice({ text: success, error: false });
      purchases.reload();
    } catch (failure) {
      if (failure.status === 401) onUnauthorized();
      else setNotice({ text: failure.message, error: true });
    }
  };

  // useApi loads once on mount; a new filter gives a new reload, so load again then.
  const mounted = useRef(false);
  useEffect(() => {
    if (mounted.current) purchases.reload();
    mounted.current = true;
  }, [purchases.reload]); // eslint-disable-line react-hooks/exhaustive-deps -- only when the filter changes

  const total = (purchases.data ?? []).reduce((sum, c) => sum + c.total, 0);

  return (
    <section className="panel panel--wide">
      <h2>Ventas de seminarios y cursos</h2>
      <p className="muted">Pago por transferencia: revisa la cuenta del banco y valida la compra cuando el dinero llegó. Anular libera los cupos.</p>
      {notice.text && (
        <p className={notice.error ? 'alert' : 'success'} role="status">
          {notice.text}
        </p>
      )}

      <div className="list__actions" role="group" aria-label="Filtrar compras">
        {FILTERS.map(([value, label]) => (
          <button
            key={value}
            className={`btn btn--small ${estado === value ? 'btn--gold' : 'btn--ghost'}`}
            type="button"
            aria-pressed={estado === value}
            onClick={() => setEstado(value)}
          >
            {label}
          </button>
        ))}
      </div>

      {purchases.error && <p className="alert">{purchases.error}</p>}
      {purchases.data?.length === 0 && <p className="muted">No hay compras en este estado.</p>}
      {purchases.data?.length > 0 && (
        <p className="muted">
          {purchases.data.length} compra(s) · {formatPesos(total)}
        </p>
      )}
      <ul className="list">
        {purchases.data?.map((c) => (
          <li key={c.id} className="list__item">
            <div>
              <p className="list__title">
                {c.codigo} · {c.nombre} · {formatPesos(c.total)}
              </p>
              <p className="muted">
                {c.email}
                {c.telefono ? ` · ${c.telefono}` : ''} · {ORIGEN[c.origen] ?? c.origen} · {String(c.fecha_creacion).slice(0, 16).replace('T', ' ')}
              </p>
              <p className="muted">
                {c.items.map((i) => `${i.descripcion}${i.cantidad > 1 ? ` × ${i.cantidad}` : ''}`).join(' · ')}
                {c.descuento > 0 ? ` · oferta −${formatPesos(c.descuento)}` : ''}
              </p>
              {c.referencia_pago && <p className="muted">Aviso de transferencia: {c.referencia_pago}</p>}
            </div>
            {c.estado !== 'anulada' && (
              <div className="list__actions">
                {c.estado === 'pendiente' && (
                  <button className="btn btn--gold btn--small" type="button" onClick={() => run(() => api.validarCompra(c.id), `Compra ${c.codigo} pagada.`)}>
                    Validar pago
                  </button>
                )}
                <button
                  className="btn btn--ghost btn--small"
                  type="button"
                  onClick={() => window.confirm(`¿Anular la compra ${c.codigo}? Los cupos quedarán libres.`) && run(() => api.anularCompra(c.id), `Compra ${c.codigo} anulada.`)}
                >
                  Anular
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
