import { useCallback, useState } from 'react';
import { api } from '../../lib/client.js';
import { formatPesos, parsePesos } from '../../lib/money.js';
import { useApi } from './useApi.js';

const PAYMENT_LABEL = { por_validar: 'Por validar', validado: 'Validado', rechazado: 'Rechazado' };

// Statement of account of the caller, or of a student in their care (alumnoId).
export default function AccountPanel({ alumnoId, title = 'Mi estado de cuenta', onUnauthorized }) {
  const account = useApi(useCallback(() => api.cuenta(alumnoId), [alumnoId]), onUnauthorized);
  const [paying, setPaying] = useState(null); // cargo id
  const [form, setForm] = useState({ monto: '', referencia: '' });
  const [notice, setNotice] = useState({ text: '', error: false });

  const open = (cargo) => {
    setPaying(cargo.id);
    setForm({ monto: String(cargo.saldo), referencia: '' });
    setNotice({ text: '', error: false });
  };

  const report = async (event) => {
    event.preventDefault();
    const monto = parsePesos(form.monto);
    if (!monto) {
      setNotice({ text: 'Ingresa un monto en pesos, sin decimales.', error: true });
      return;
    }
    try {
      const { message } = await api.informarPago(paying, monto, form.referencia);
      setNotice({ text: message, error: false });
      setPaying(null);
      account.reload();
    } catch (failure) {
      if (failure.status === 401) onUnauthorized();
      else setNotice({ text: failure.message, error: true });
    }
  };

  if (account.loading && !account.data) return <section className="panel"><h2>{title}</h2><p className="muted">Cargando…</p></section>;
  if (account.error) return <section className="panel"><h2>{title}</h2><p className="alert">{account.error}</p></section>;
  const { cargos, resumen } = account.data;

  return (
    <section className="panel">
      <h2>{title}</h2>
      {resumen.moroso && (
        <p className="alert" role="alert">
          {alumnoId ? 'Hay cargos vencidos.' : 'Tienes cargos vencidos.'} Informa el pago o coordina con la administración.
        </p>
      )}
      {notice.text && (
        <p className={notice.error ? 'alert' : 'success'} role="status">
          {notice.text}
        </p>
      )}
      <p className="portal__hello">{formatPesos(resumen.saldo)}</p>
      <p className="muted">
        saldo por pagar · cargado {formatPesos(resumen.cargado)} · pagado {formatPesos(resumen.pagado)}
      </p>

      {cargos.length === 0 && <p className="muted">{alumnoId ? 'No hay cargos.' : 'No tienes cargos.'}</p>}
      <ul className="list">
        {cargos.map((cargo) => (
          <li key={cargo.id} className="list__item list__item--stack">
            <div className="list__row">
              <div>
                <p className="list__title">{cargo.concepto}</p>
                <p className="muted">
                  {formatPesos(cargo.monto)} · vence {cargo.fecha_vencimiento}
                  {cargo.pagado > 0 && cargo.saldo > 0 ? ` · saldo ${formatPesos(cargo.saldo)}` : ''}
                </p>
              </div>
              <div className="list__actions">
                <span className="tag">{cargo.estado === 'pagado' ? 'Pagado' : cargo.vencido ? 'Vencido' : 'Pendiente'}</span>
                {cargo.estado === 'pendiente' && (
                  <button className="btn btn--gold btn--small" type="button" onClick={() => (paying === cargo.id ? setPaying(null) : open(cargo))}>
                    {paying === cargo.id ? 'Cerrar' : 'Informar pago'}
                  </button>
                )}
              </div>
            </div>
            {cargo.pagos.length > 0 && (
              <p className="muted">
                {cargo.pagos.map((p) => `${formatPesos(p.monto)} (${PAYMENT_LABEL[p.estado]})`).join(' · ')}
              </p>
            )}
            {paying === cargo.id && (
              <form className="availability-row" onSubmit={report}>
                <input type="text" inputMode="numeric" aria-label="Monto transferido" placeholder="Monto" value={form.monto} onChange={(e) => setForm((f) => ({ ...f, monto: e.target.value }))} />
                <input type="text" aria-label="Referencia de la transferencia" placeholder="Referencia o comprobante" maxLength={255} value={form.referencia} onChange={(e) => setForm((f) => ({ ...f, referencia: e.target.value }))} />
                <button className="btn btn--gold btn--small" type="submit">
                  Enviar
                </button>
              </form>
            )}
          </li>
        ))}
      </ul>
      <p className="muted">Los datos para transferir te los entrega la administración. Tu pago cuenta cuando ella lo valida.</p>
    </section>
  );
}
