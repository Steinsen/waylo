import { useEffect, useState } from 'react';
import Map from './components/Map.jsx';
import Chat from './components/Chat.jsx';
import config, { aktuellSasong } from './config/arctic-lodge.js';
import { hamtaPoi } from './api.js';

export default function App() {
  const [poier, setPoier] = useState([]);
  const [markerade, setMarkerade] = useState([]);
  const [fel, setFel] = useState(null);
  const sasong = aktuellSasong();

  useEffect(() => {
    hamtaPoi(config.api_url).then(setPoier).catch((e) => setFel(e.message));
  }, []);

  return (
    <div className="waylo-app">
      <header className="waylo-app__topp">
        <h1>{config.namn}</h1>
        <span>{config.omrade} — säsong: {sasong}</span>
        {fel && <span style={{ color: '#b5441e' }}>Kunde inte ladda POI:er: {fel}</span>}
      </header>
      <div className="waylo-app__innehall">
        <div className="waylo-app__karta">
          <Map config={config} poier={poier} markerade={markerade} />
        </div>
        <div className="waylo-app__chatt">
          <Chat onPoi={setMarkerade} />
        </div>
      </div>
    </div>
  );
}
