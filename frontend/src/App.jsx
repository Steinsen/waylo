import { useEffect, useState } from 'react';
import Map from './components/Map.jsx';
import Chat from './components/Chat.jsx';
import config, { aktuellSasong } from './config/arctic-lodge.js';
import { hamtaPoi } from './api.js';
import { useMedia } from './useMedia.js';

const MOBIL = '(max-width: 820px)';

export default function App() {
  const [poier, setPoier] = useState([]);
  const [markerade, setMarkerade] = useState([]);
  const [fel, setFel] = useState(null);
  const [flik, setFlik] = useState('chatt');
  const arMobil = useMedia(MOBIL);
  const sasong = aktuellSasong();

  useEffect(() => {
    hamtaPoi(config.api_url).then(setPoier).catch((e) => setFel(e.message));
  }, []);

  // På desktop syns båda vyerna samtidigt — flikvalet gäller bara mobil.
  const kartanSyns = !arMobil || flik === 'karta';
  const chattenSyns = !arMobil || flik === 'chatt';

  function visaPaKartan(ids) {
    setMarkerade(ids);
    setFlik('karta');
  }

  return (
    <div className="waylo-app">
      <header className="waylo-app__topp">
        <h1>{config.namn}</h1>
        <span className="waylo-app__omrade">{config.omrade}</span>
        <span className="waylo-app__sasong">{sasong}</span>
      </header>

      {arMobil && (
        <nav className="waylo-flikar" role="tablist" aria-label="Vy">
          <button
            role="tab"
            aria-selected={flik === 'karta'}
            onClick={() => setFlik('karta')}
          >
            Karta
          </button>
          <button
            role="tab"
            aria-selected={flik === 'chatt'}
            onClick={() => setFlik('chatt')}
          >
            Chatt
          </button>
        </nav>
      )}

      {fel && <p className="waylo-app__fel">Kunde inte ladda platserna: {fel}</p>}

      <div className="waylo-app__innehall">
        <div className="waylo-app__karta" hidden={!kartanSyns}>
          <Map
            config={config}
            poier={poier}
            markerade={markerade}
            synlig={kartanSyns}
          />
        </div>
        <div className="waylo-app__chatt" hidden={!chattenSyns}>
          <Chat
            onPoi={setMarkerade}
            onVisaKarta={arMobil ? visaPaKartan : null}
          />
        </div>
      </div>
    </div>
  );
}
