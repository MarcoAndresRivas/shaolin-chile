import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/client.js';
import './ChatWidget.css';

const GREETING = 'Hola, soy el asistente virtual de Shaolin Chile. Puedo contarte qué clases vienen y agendarte una clase de prueba.';

// A floating chat with the virtual assistant. When the assistant cannot be
// reached, it offers WhatsApp so the visitor is not left without an answer.
export default function ChatWidget({ whatsapp }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([{ from: 'assistant', text: GREETING }]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [failed, setFailed] = useState(false);
  const chatId = useRef(null);
  const input = useRef(null);
  const toggle = useRef(null);
  const end = useRef(null);

  useEffect(() => {
    if (open) input.current?.focus();
  }, [open]);

  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' });
  }, [messages, sending]);

  const close = () => {
    setOpen(false);
    toggle.current?.focus();
  };

  const send = async (event) => {
    event.preventDefault();
    const question = text.trim();
    if (!question || sending) return;
    setText('');
    setFailed(false);
    setMessages((current) => [...current, { from: 'person', text: question }]);
    setSending(true);
    try {
      const answer = await api.chat(question, chatId.current);
      chatId.current = answer.chat_id;
      setMessages((current) => [...current, { from: 'assistant', text: answer.respuesta }]);
    } catch {
      setFailed(true);
    } finally {
      setSending(false);
      input.current?.focus();
    }
  };

  return (
    <div className="chat">
      {open && (
        <section
          className="chat__panel"
          id="chat-panel"
          aria-label="Chat con el asistente virtual"
          onKeyDown={(event) => event.key === 'Escape' && close()}
        >
          <header className="chat__header">
            <p className="chat__title">Asistente virtual</p>
            <button className="chat__close" type="button" onClick={close} aria-label="Cerrar el chat">
              ×
            </button>
          </header>

          <div className="chat__messages" role="log" aria-live="polite" tabIndex={0} aria-label="Mensajes">
            {messages.map((message, index) => (
              <p key={index} className={`chat__message chat__message--${message.from}`}>
                <span className="chat__who">{message.from === 'assistant' ? 'Asistente: ' : 'Tú: '}</span>
                {message.text}
              </p>
            ))}
            {sending && <p className="chat__message chat__message--assistant chat__message--waiting">Escribiendo…</p>}
            {failed && (
              <p className="chat__message chat__message--error" role="alert">
                El asistente no está disponible en este momento.{' '}
                <a href={`https://wa.me/${whatsapp}`} target="_blank" rel="noopener">
                  Escríbenos por WhatsApp
                </a>
                .
              </p>
            )}
            <div ref={end} />
          </div>

          <form className="chat__form" onSubmit={send}>
            <label className="chat__label" htmlFor="chat-input">
              Tu mensaje
            </label>
            <div className="chat__row">
              <input
                id="chat-input"
                ref={input}
                type="text"
                value={text}
                maxLength={1000}
                autoComplete="off"
                onChange={(event) => setText(event.target.value)}
              />
              <button className="btn btn--gold" type="submit" disabled={sending || !text.trim()}>
                Enviar
              </button>
            </div>
            <p className="chat__note">Es un asistente automático: puede equivocarse. No compartas datos de salud.</p>
          </form>
        </section>
      )}

      <button
        ref={toggle}
        className="btn btn--gold chat__toggle"
        type="button"
        aria-expanded={open}
        aria-controls="chat-panel"
        onClick={() => (open ? close() : setOpen(true))}
      >
        {open ? 'Cerrar chat' : 'Chat'}
      </button>
    </div>
  );
}
