import { useCallback, useState } from 'react';
import { api } from '../../lib/client.js';
import { todayInChile } from '../../lib/dates.js';
import { formatPesos, parsePesos } from '../../lib/money.js';
import { useApi } from './useApi.js';

// Administration: plans, subscriptions, monthly charges, payments to validate
// and overdue students.
export default function FinancePanel({ onUnauthorized }) {
  const today = todayInChile();
  const plans = useApi(useCallback(() => api.planes(true), []), onUnauthorized);
  const users = useApi(useCallback(() => api.usuarios(), []), onUnauthorized);
  const pending = useApi(useCallback(() => api.pagos('por_validar'), []), onUnauthorized);
  const [grace, setGrace] = useState('');
  const overdue = useApi(useCallback(() => api.morosidad(grace ? Number(grace) : undefined), [grace]), onUnauthorized);

  const [plan, setPlan] = useState({ nombre: '', monto: '', periodicidad: 'mensual' });
  const [sub, setSub] = useState({ alumno_id: '', plan_id: '', fecha_inicio: today });
  const [month, setMonth] = useState({ periodo: today.slice(0, 7), dia: '10' });
  const [notice, setNotice] = useState({ text: '', error: false });

  const run = async (action, success, after = []) => {
    setNotice({ text: '', error: false });
    try {
      const result = await action();
      setNotice({ text: typeof success === 'function' ? success(result) : success, error: false });
      after.forEach((reload) => reload());
      return true;
    } catch (failure) {
      if (failure.status === 401) onUnauthorized();
      else setNotice({ text: failure.message, error: true });
      return false;
    }
  };

  const createPlan = async (event) => {
    event.preventDefault();
    const monto = parsePesos(plan.monto);
    if (!plan.nombre.trim() || !monto) {
      setNotice({ text: 'Indica el nombre y un monto en pesos, sin decimales.', error: true });
      return;
    }
    if (await run(() => api.crearPlan({ nombre: plan.nombre.trim(), monto, periodicidad: plan.periodicidad }), 'Plan creado.', [plans.reload])) {
      setPlan({ nombre: '', monto: '', periodicidad: 'mensual' });
    }
  };

  const subscribe = async (event) => {
    event.preventDefault();
    if (!sub.alumno_id || !sub.plan_id) {
      setNotice({ text: 'Elige un alumno y un plan.', error: true });
      return;
    }
    await run(() => api.suscribir({ alumno_id: Number(sub.alumno_id), plan_id: Number(sub.plan_id), fecha_inicio: sub.fecha_inicio }), 'Suscripción creada.');
  };

  const generate = (event) => {
    event.preventDefault();
    run(
      () => api.generarCargos(month.periodo, Number(month.dia)),
      ({ creados, omitidos }) => `Cargos de ${month.periodo}: ${creados} creados, ${omitidos} ya existían.`,
      [overdue.reload],
    );
  };

  return (
    <section className="panel panel--wide">
      <h2>Finanzas</h2>
      <p className="muted">Pagos por transferencia: el pago cuenta cuando lo validas aquí.</p>
      {notice.text && (
        <p className={notice.error ? 'alert' : 'success'} role="status">
          {notice.text}
        </p>
      )}

      <h3>Pagos por validar</h3>
      {pending.data?.length === 0 && <p className="muted">No hay pagos por validar.</p>}
      <ul className="list">
        {pending.data?.map((p) => (
          <li key={p.id} className="list__item">
            <div>
              <p className="list__title">
                {p.alumno} · {formatPesos(p.monto)}
              </p>
              <p className="muted">
                {p.concepto}
                {p.referencia ? ` · ${p.referencia}` : ''}
              </p>
            </div>
            <div className="list__actions">
              <button className="btn btn--gold btn--small" type="button" onClick={() => run(() => api.validarPago(p.id), 'Pago validado.', [pending.reload, overdue.reload])}>
                Validar
              </button>
              <button className="btn btn--ghost btn--small" type="button" onClick={() => run(() => api.rechazarPago(p.id), 'Pago rechazado.', [pending.reload])}>
                Rechazar
              </button>
            </div>
          </li>
        ))}
      </ul>

      <h3>Morosidad</h3>
      <div className="field">
        <label htmlFor="grace">Días de gracia (opcional)</label>
        <input id="grace" type="number" min="0" value={grace} onChange={(e) => setGrace(e.target.value)} />
      </div>
      {overdue.data?.length === 0 && <p className="muted">No hay alumnos con cargos vencidos.</p>}
      <ul className="list">
        {overdue.data?.map((o) => (
          <li key={o.alumno_id} className="list__item">
            <div>
              <p className="list__title">{o.alumno}</p>
              <p className="muted">
                {o.email} · {o.cargos_vencidos} cargo(s) · hasta {o.dias_max_atraso} días de atraso
              </p>
            </div>
            <span className="tag">{formatPesos(o.saldo_vencido)}</span>
          </li>
        ))}
      </ul>

      <h3>Cargos del mes</h3>
      <form className="availability-row" onSubmit={generate}>
        <input type="month" aria-label="Mes a cobrar" value={month.periodo} onChange={(e) => setMonth((m) => ({ ...m, periodo: e.target.value }))} />
        <input type="number" min="1" max="28" aria-label="Día de vencimiento" value={month.dia} onChange={(e) => setMonth((m) => ({ ...m, dia: e.target.value }))} />
        <button className="btn btn--gold btn--small" type="submit">
          Generar cargos
        </button>
      </form>

      <h3>Planes</h3>
      <ul className="list">
        {plans.data?.map((p) => (
          <li key={p.id} className="list__item">
            <p className="list__title">
              {p.nombre} · {formatPesos(p.monto)} ({p.periodicidad})
            </p>
            {!p.activa && <span className="tag">Inactivo</span>}
          </li>
        ))}
      </ul>
      {plans.data?.length === 0 && <p className="muted">Aún no hay planes. Los precios los define la dirección.</p>}
      <form className="availability-row" onSubmit={createPlan}>
        <input type="text" aria-label="Nombre del plan" placeholder="Nombre del plan" value={plan.nombre} onChange={(e) => setPlan((p) => ({ ...p, nombre: e.target.value }))} />
        <input type="text" inputMode="numeric" aria-label="Monto del plan" placeholder="Monto" value={plan.monto} onChange={(e) => setPlan((p) => ({ ...p, monto: e.target.value }))} />
        <select aria-label="Periodicidad" value={plan.periodicidad} onChange={(e) => setPlan((p) => ({ ...p, periodicidad: e.target.value }))}>
          <option value="mensual">Mensual</option>
          <option value="unico">Único</option>
        </select>
        <button className="btn btn--gold btn--small" type="submit">
          Crear plan
        </button>
      </form>

      <h3>Suscribir a un alumno</h3>
      <form className="availability-row" onSubmit={subscribe}>
        <select aria-label="Alumno a suscribir" value={sub.alumno_id} onChange={(e) => setSub((s) => ({ ...s, alumno_id: e.target.value }))}>
          <option value="">Elige un alumno</option>
          {users.data?.map((u) => (
            <option key={u.id} value={u.id}>
              {u.nombre}
            </option>
          ))}
        </select>
        <select aria-label="Plan de la suscripción" value={sub.plan_id} onChange={(e) => setSub((s) => ({ ...s, plan_id: e.target.value }))}>
          <option value="">Elige un plan</option>
          {plans.data?.filter((p) => p.activa).map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre}
            </option>
          ))}
        </select>
        <input type="date" aria-label="Inicio de la suscripción" value={sub.fecha_inicio} onChange={(e) => setSub((s) => ({ ...s, fecha_inicio: e.target.value }))} />
        <button className="btn btn--gold btn--small" type="submit">
          Suscribir
        </button>
      </form>
    </section>
  );
}
