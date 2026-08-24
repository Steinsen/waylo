import { useEffect, useRef } from 'react';
import L from 'leaflet';

const IKONER = {
  'kat-vandring': '🥾', 'kat-skidor': '⛷️', 'kat-topptur': '🎿',
  'kat-mtb': '🚵', 'kat-kultur': '🏛️', 'kat-mat': '🍽️',
  'kat-barnvanligt': '👨‍👩‍👧‍👦', 'kat-utsikt': '👁️',
  'kat-fjalltopp': '⛰️', 'kat-vatten': '💧', 'kat-snoter': '🛷',
};

function ikonFor(poi) {
  const kat = (poi.kategori_ids || [])[0];
  return IKONER[kat] ?? '📍';
}

function text(falt, sprak = 'sv') {
  if (!falt) return '';
  return typeof falt === 'string' ? falt : falt[sprak] ?? falt.sv ?? falt.en ?? '';
}

/**
 * Leaflet-karta med Lantmäteriets topografiska tiles via tile-proxyn.
 * `markerade` är en lista med POI-id som ska lyftas fram (från chatten).
 */
export default function Map({ config, poier = [], markerade = [], synlig = true }) {
  const containerRef = useRef(null);
  const kartaRef = useRef(null);
  const lagerRef = useRef(null);
  const markorerRef = useRef({});

  // Initiera kartan en gång
  useEffect(() => {
    if (kartaRef.current) return;

    const karta = L.map(containerRef.current, {
      center: [config.center.lat, config.center.lng],
      zoom: config.zoom,
      scrollWheelZoom: true,
    });

    L.tileLayer(`${config.tiles_url}/tiles/{z}/{x}/{y}.png`, {
      attribution: '© Lantmäteriet CC BY · © Kartverket',
      maxZoom: 15,
      minZoom: 5,
    }).addTo(karta);

    L.marker([config.center.lat, config.center.lng], {
      icon: L.divIcon({
        className: 'waylo-markor waylo-markor--hem',
        html: '<span class="waylo-markor__cirkel">🏠</span>',
        iconSize: [44, 44],
      }),
    })
      .addTo(karta)
      .bindPopup(`<strong>${config.namn}</strong>`);

    lagerRef.current = L.layerGroup().addTo(karta);
    kartaRef.current = karta;

    return () => {
      karta.remove();
      kartaRef.current = null;
    };
  }, [config]);

  // Rita om markörerna när POI-listan ändras
  useEffect(() => {
    const lager = lagerRef.current;
    if (!lager) return;

    lager.clearLayers();
    markorerRef.current = {};

    for (const poi of poier) {
      if (poi.lat == null || poi.lng == null) continue;

      const markor = L.marker([poi.lat, poi.lng], {
        icon: L.divIcon({
          className: 'waylo-markor',
          html: `<span class="waylo-markor__cirkel">${ikonFor(poi)}</span>`,
          iconSize: [44, 44],
        }),
      }).bindPopup(`
        <strong>${text(poi.namn)}</strong><br/>
        ${text(poi.kortbeskrivning)}
        ${poi.avstand_fran_lodge_km != null
          ? `<br/><small>${poi.avstand_fran_lodge_km} km från lodget</small>`
          : ''}
      `);

      markor.addTo(lager);
      markorerRef.current[poi.id] = markor;
    }
  }, [poier]);

  // Leaflet mäter containern vid skapandet. Byter man flik på mobil har
  // den varit dold (0x0) och måste mätas om när den visas igen.
  useEffect(() => {
    if (!synlig || !kartaRef.current) return;
    const id = setTimeout(() => kartaRef.current?.invalidateSize(), 0);
    return () => clearTimeout(id);
  }, [synlig]);

  // Zooma till de POI:er chatten just nämnt
  useEffect(() => {
    const karta = kartaRef.current;
    if (!karta || !synlig || !markerade.length) return;

    // Kommer vi hit direkt efter ett flikbyte har containern nyss varit
    // dold — mät om innan vi räknar ut zoomnivån, annars beräknas den
    // mot 0x0 och kartan hamnar fel.
    karta.invalidateSize();

    const punkter = markerade
      .map((id) => markorerRef.current[id])
      .filter(Boolean)
      .map((m) => m.getLatLng());

    if (!punkter.length) return;

    if (punkter.length === 1) {
      karta.setView(punkter[0], 12);
      markorerRef.current[markerade[0]]?.openPopup();
    } else {
      karta.fitBounds(L.latLngBounds(punkter).pad(0.25));
    }
  }, [markerade, synlig]);

  return <div className="waylo-karta" ref={containerRef} />;
}
