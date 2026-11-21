import { useEffect, useRef, useState } from 'react';
import { api, appPath } from '../lib/client.js';
import { currentSeminar, offerImage, seminarDates } from '../lib/ventas.js';
import './SeminarPopup.css';

const BASE = import.meta.env.BASE_URL;
const seenKey = (id) => `seminar-popup-seen:${id}`;

// Remembered for the visit only (sessionStorage): a new visit shows it again.
// Storage can be blocked (private windows): then the popup simply shows again.
function wasSeen(id) {
  try { return sessionStorage.getItem(seenKey(id)) === '1'; } catch { return false; }
}
function markSeen(id) {
  try { sessionStorage.setItem(seenKey(id), '1'); } catch { /* nothing to keep */ }
}

// On entering the home page, announces the current seminar once per visit.
// No prices: they show only when paying. Without a seminar it shows nothing.
export default function SeminarPopup() {
  const dialog = useRef(null);
  const [seminario, setSeminario] = useState(null);

  useEffect(() => {
    api.ofertas().then((catalog) => {
      const found = currentSeminar(catalog);
      if (found && !wasSeen(found.id)) setSeminario(found);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (seminario && !dialog.current.open) dialog.current.showModal();
  }, [seminario]);

  if (!seminario) return null;
  const image = offerImage(seminario.imagen, BASE);
  const close = () => dialog.current.close();

  return (
    <dialog
      ref={dialog}
      className="seminar-popup"
      aria-labelledby="seminar-popup-title"
      onClose={() => markSeen(seminario.id)}
      onClick={(event) => event.target === dialog.current && close()}
    >
      <div className="seminar-popup__card">
        <button className="seminar-popup__close" type="button" onClick={close} aria-label="Cerrar aviso">×</button>
        {image && <img className="seminar-popup__image" src={image} alt="" />}
        <div className="seminar-popup__body">
          <p className="eyebrow">Próximo seminario</p>
          <h2 id="seminar-popup-title">{seminario.titulo}</h2>
          <p className="seminar-popup__when">{seminarDates(seminario)}</p>
          {seminario.sede && <p className="seminar-popup__where">{seminario.sede}</p>}
          <div className="seminar-popup__actions">
            <a className="btn btn--gold" href={appPath('seminarios/')} onClick={() => markSeen(seminario.id)}>Reserva tu cupo</a>
            <button className="btn btn--ghost" type="button" onClick={close}>Ahora no</button>
          </div>
        </div>
      </div>
    </dialog>
  );
}
