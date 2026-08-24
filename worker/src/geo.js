/**
 * Geografisk routning av kartrutor.
 *
 * Lantmäteriet svarar 200 med en generaliserad bakgrund utanför svensk
 * täckning istället för ett fel, så vilken källa som har data går inte
 * att avgöra av svaret. Positionen avgör istället: ligger rutans mitt i
 * Sverige hämtas den från Lantmäteriet, annars från Kartverket.
 */

import { SVERIGE } from './sverige.js';

// Natural Earths gräns är några hundra meter oprecis — vid Riksgränsen
// hamnar stationen på norska sidan. Marginalen gör att ett lager hellre
// stannar kvar än försvinner nära gränsen. Kostar en onödig hämtning i
// utbyte, aldrig en tom ruta.
const MARGINAL_KM = 2;

/** Mittpunkten för en Web Mercator-ruta, som [lon, lat]. */
export function rutansMitt(z, x, y) {
  const n = 2 ** z;
  const lon = ((Number(x) + 0.5) / n) * 360 - 180;
  const t = Math.PI * (1 - (2 * (Number(y) + 0.5)) / n);
  const lat = (Math.atan(Math.sinh(t)) * 180) / Math.PI;
  return [lon, lat];
}

/**
 * Punkt-i-polygon med strålmetoden. Ringarna är plattade till
 * [lon, lat, lon, lat, ...] för att hålla nere buntstorleken.
 */
export function iSverige(lon, lat) {
  let inne = false;
  for (const ring of SVERIGE) {
    for (let i = 0; i + 3 < ring.length; i += 2) {
      const x1 = ring[i], y1 = ring[i + 1];
      const x2 = ring[i + 2], y2 = ring[i + 3];
      if (y1 > lat !== y2 > lat) {
        const skarning = x1 + ((lat - y1) / (y2 - y1)) * (x2 - x1);
        if (lon < skarning) inne = !inne;
      }
    }
  }
  return inne;
}

/** Provpunkter över en ruta: 3x3-rutnät med hörn, kantmitter och centrum. */
function provpunkter(z, x, y) {
  const n = 2 ** z;
  const X = Number(x), Y = Number(y);
  const lonAt = (fx) => ((X + fx) / n) * 360 - 180;
  const latAt = (fy) => {
    const t = Math.PI * (1 - (2 * (Y + fy)) / n);
    return (Math.atan(Math.sinh(t)) * 180) / Math.PI;
  };
  const punkter = [];
  for (const fy of [0, 0.5, 1]) {
    const lat = latAt(fy);
    for (const fx of [0, 0.5, 1]) punkter.push([lonAt(fx), lat]);
  }
  return punkter;
}

/**
 * Samma rutnät men vidgat med ett fast avstånd i kilometer. En marginal
 * räknad i rutbredder krymper med zoomen; gränsfelet gör det inte.
 */
function provpunkterMedMarginal(z, x, y, km) {
  const punkter = provpunkter(z, x, y);
  const lat0 = punkter[4][1];                   // rutans mittlatitud
  const dLat = km / 111.32;
  const dLon = km / (111.32 * Math.cos((lat0 * Math.PI) / 180));
  const ut = [];
  for (const [lon, lat] of punkter) {
    for (const sl of [-dLon, 0, dLon]) {
      for (const st of [-dLat, 0, dLat]) ut.push([lon + sl, lat + st]);
    }
  }
  return ut;
}

/**
 * Hur en ruta förhåller sig till Sverige: 'helt', 'delvis' eller 'inte'.
 *
 * Används för att göra ett lager genomskinligt utan att ens fråga
 * upstream. Att avgöra det på rutans storlek krävde en gräns som måste
 * gissas; det här kräver ingen.
 */
export function motSverige(z, x, y) {
  // Natural Earths gräns är några hundra meter oprecis — vid
  // Riksgränsen hamnar stationen på fel sida. Marginalen gör att ett
  // lager hellre stannar kvar än försvinner nära gränsen, och kostar
  // bara en onödig hämtning i utbyte.
  const nara = provpunkterMedMarginal(z, x, y, MARGINAL_KM).some(([lon, lat]) =>
    iSverige(lon, lat)
  );
  if (!nara) return 'inte';

  const träffar = provpunkter(z, x, y).filter(([lon, lat]) => iSverige(lon, lat));
  return träffar.length === 9 ? 'helt' : 'delvis';
}

/** Källordning för en ruta: den som har data först, den andra som reserv. */
export function kallordning(z, x, y) {
  const [lon, lat] = rutansMitt(z, x, y);
  return iSverige(lon, lat) ? ['se', 'no'] : ['no', 'se'];
}
