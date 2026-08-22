import { useEffect, useRef, useState } from 'react';
import { chatta, sessionId } from '../api.js';
import config from '../config/arctic-lodge.js';

const VERKTYGSTEXT = {
  search_poi_database: 'Söker i den lokala guiden…',
  web_search: 'Söker på webben…',
  get_weather: 'Hämtar vädret…',
};

/**
 * Chattwidget. `onPoi` anropas med de POI-id:n som nämnts i svaret,
 * så att kartan kan lyfta fram dem.
 */
export default function Chat({ onPoi, onVisaKarta = null, kompakt = false }) {
  const [meddelanden, setMeddelanden] = useState([
    { role: 'assistant', content: config.valkomsttext },
  ]);
  const [input, setInput] = useState('');
  const [laddar, setLaddar] = useState(false);
  const [status, setStatus] = useState(null);
  const [sistaPoi, setSistaPoi] = useState([]);
  const [kallor, setKallor] = useState([]);
  const listaRef = useRef(null);
  const session = useRef(sessionId());

  useEffect(() => {
    listaRef.current?.scrollTo({
      top: listaRef.current.scrollHeight,
      behavior: 'smooth',
    });
  }, [meddelanden, status]);

  async function skicka(e) {
    e.preventDefault();
    const fraga = input.trim();
    if (!fraga || laddar) return;

    const historik = meddelanden.slice(1); // hoppa över välkomsttexten
    setMeddelanden((m) => [
      ...m,
      { role: 'user', content: fraga },
      { role: 'assistant', content: '' },
    ]);
    setInput('');
    setLaddar(true);
    setStatus(null);
    setSistaPoi([]);
    setKallor([]);

    try {
      await chatta(
        config.api_url,
        { fraga, historik, sprak: 'sv', session_id: session.current },
        (h) => {
          if (h.typ === 'text') {
            setStatus(null);
            setMeddelanden((m) => {
              const kopia = [...m];
              kopia[kopia.length - 1] = {
                role: 'assistant',
                content: kopia[kopia.length - 1].content + h.text,
              };
              return kopia;
            });
          } else if (h.typ === 'verktyg') {
            setStatus(VERKTYGSTEXT[h.namn] ?? 'Arbetar…');
          } else if (h.typ === 'poi') {
            setSistaPoi(h.ids);
            onPoi?.(h.ids);
          } else if (h.typ === 'kallor') {
            setKallor(h.kallor);
          } else if (h.typ === 'fel') {
            setMeddelanden((m) => {
              const kopia = [...m];
              kopia[kopia.length - 1] = {
                role: 'assistant',
                content: `Något gick fel: ${h.meddelande}. Fråga gärna receptionen på ${config.kontakt.reception}.`,
              };
              return kopia;
            });
          }
        }
      );
    } catch (err) {
      setMeddelanden((m) => {
        const kopia = [...m];
        kopia[kopia.length - 1] = {
          role: 'assistant',
          content: `Jag når inte guiden just nu (${err.message}). Kontakta receptionen på ${config.kontakt.reception}.`,
        };
        return kopia;
      });
    } finally {
      setLaddar(false);
      setStatus(null);
    }
  }

  return (
    <div className={`waylo-chat${kompakt ? ' waylo-chat--kompakt' : ''}`}>
      <header className="waylo-chat__header">
        <strong>{config.namn}</strong>
        <span>Din lokalguide</span>
      </header>

      <div className="waylo-chat__lista" ref={listaRef}>
        {meddelanden.map((m, i) => (
          <div key={i} className={`waylo-bubbla waylo-bubbla--${m.role}`}>
            {m.content || (laddar && i === meddelanden.length - 1 ? '…' : '')}
          </div>
        ))}
        {kallor.length > 0 && !laddar && (
          <div className="waylo-kallor">
            <span>Källor:</span>
            {kallor.map((k) => (
              <a key={k.url} href={k.url} target="_blank" rel="noopener noreferrer">
                {k.titel}
              </a>
            ))}
          </div>
        )}
        {onVisaKarta && !laddar && sistaPoi.length > 0 && (
          <button
            type="button"
            className="waylo-kartknapp"
            onClick={() => onVisaKarta(sistaPoi)}
          >
            📍 Visa {sistaPoi.length === 1 ? 'platsen' : 'platserna'} på kartan
          </button>
        )}
        {status && <div className="waylo-status">{status}</div>}
      </div>

      <form className="waylo-chat__form" onSubmit={skicka}>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Fråga om vandring, mat, väder…"
          aria-label="Din fråga"
          disabled={laddar}
        />
        <button type="submit" disabled={laddar || !input.trim()}>
          Skicka
        </button>
      </form>
    </div>
  );
}
