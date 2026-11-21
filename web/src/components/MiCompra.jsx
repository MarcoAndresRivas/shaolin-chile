import { useEffect, useState } from 'react';
import { api } from '../lib/client.js';
import { formatPesos } from '../lib/money.js';
import './TrialClassForm.css';
import './Ofertas.css';

const ESTADOS = {
  pendiente: 'Pendiente de pago: tu cupo está reservado mientras validamos la transferencia.',
  pagada: 'Pagada: tu inscripción está confirmada.',
  anulada: 'Anulada.',
};

// The buyer's own purchase, found with the code and the email: its state, the
// transfer notice and, once it is paid, the course videos.
export default function MiCompra() {
  const [query, setQuery] = useState({ codigo: '', email: '' });
  const [compra, setCompra] = useState(null);
  const [failure, setFailure] = useState('');
  const [loading, setLoading] = useState(false);
  const [referencia, setReferencia] = useState('');
  const [notice, setNotice] = useState('');

  const find = async (codigo, email) => {
    setFailure('');
    setNotice('');
    setLoading(true);
    try {
      setCompra(await api.miCompra(codigo.trim(), email.trim()));
    } catch (error) {
      setCompra(null);
      setFailure(error.message);
    } finally {
      setLoading(false);
    }
  };

  // The confirmation links here with ?codigo=...&email=...
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const codigo = params.get('codigo') ?? '';
    const email = params.get('email') ?? '';
    setQuery({ codigo, email });
    if (codigo && email) find(codigo, email);
  }, []);

  const submit = (event) => {
    event.preventDefault();
    if (!query.codigo.trim() || !query.email.trim()) {
      setFailure('Escribe el código de reserva y tu correo.');
      return;
    }
    find(query.codigo, query.email);
  };

  const report = async (event) => {
    event.preventDefault();
    if (!referencia.trim()) return;
    try {
      const { message } = await api.avisarTransferencia(compra.codigo, query.email.trim(), referencia.trim());
      setReferencia('');
      await find(compra.codigo, query.email);
      setNotice(message);
    } catch (error) {
      setFailure(error.message);
    }
  };

  return (
    <div className="shop">
      <form className="trial" onSubmit={submit} noValidate>
        <div className="trial__grid">
          <div className="trial__row">
            <label htmlFor="mine-codigo">Código de reserva</label>
            <input id="mine-codigo" type="text" placeholder="SC-XXXXXX" value={query.codigo} onChange={(e) => setQuery({ ...query, codigo: e.target.value })} />
          </div>
          <div className="trial__row">
            <label htmlFor="mine-email">Correo de la compra</label>
            <input id="mine-email" type="email" autoComplete="email" value={query.email} onChange={(e) => setQuery({ ...query, email: e.target.value })} />
          </div>
        </div>
        <button className="btn btn--gold trial__submit" type="submit" disabled={loading}>
          {loading ? 'Buscando…' : 'Ver mi compra'}
        </button>
        {failure && (
          <p className="trial__error" role="alert">
            {failure}
          </p>
        )}
      </form>

      {compra && (
        <section className="trial" aria-labelledby="mine-title">
          <h2 id="mine-title">Reserva {compra.codigo}</h2>
          <p role="status">{ESTADOS[compra.estado] ?? compra.estado}</p>
          <ul className="shop__lines">
            {compra.items.map((item, index) => (
              <li key={index}>
                <span>
                  {item.descripcion}
                  {item.cantidad > 1 && ` × ${item.cantidad}`}
                </span>
                <span>{formatPesos(item.precio * item.cantidad)}</span>
              </li>
            ))}
            {compra.descuento > 0 && (
              <li className="shop__discount">
                <span>Oferta</span>
                <span>−{formatPesos(compra.descuento)}</span>
              </li>
            )}
            <li className="shop__total">
              <span>Total</span>
              <span>{formatPesos(compra.total)}</span>
            </li>
          </ul>

          {compra.estado === 'pendiente' && (
            <form onSubmit={report} className="trial__row">
              <label htmlFor="mine-ref">¿Ya transferiste? Cuéntanos cómo identificarla</label>
              <input
                id="mine-ref"
                type="text"
                maxLength={255}
                placeholder="Ej.: transferencia de Juana Pérez, 20/11, Banco Estado"
                value={referencia}
                onChange={(e) => setReferencia(e.target.value)}
              />
              <button className="btn btn--ghost" type="submit" disabled={!referencia.trim()}>
                Avisar mi transferencia
              </button>
              {compra.referencia_pago && <p className="muted">Ya nos avisaste: {compra.referencia_pago}</p>}
            </form>
          )}
          {notice && (
            <p className="success" role="status">
              {notice}
            </p>
          )}

          {compra.cursos.map((curso) => (
            <div key={curso.curso_id}>
              <h3>{curso.titulo}</h3>
              <ol className="offer__lessons">
                {curso.lecciones.map((leccion) => (
                  <li key={leccion.orden}>
                    {leccion.titulo}{' '}
                    {leccion.video_url ? (
                      <>
                        <a href={leccion.video_url} target="_blank" rel="noopener">Ver</a>
                        {leccion.descargable && (
                          <>
                            {' · '}
                            <a href={leccion.video_url} download>Descargar</a>
                          </>
                        )}
                      </>
                    ) : (
                      <span className="muted">(video en preparación)</span>
                    )}
                  </li>
                ))}
              </ol>
              <p className="muted">Los videos son para tu uso personal: no se pueden compartir ni publicar.</p>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
