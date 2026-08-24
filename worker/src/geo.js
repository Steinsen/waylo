/**
 * Geografisk routning av kartrutor.
 *
 * Lantmäteriet svarar 200 med en generaliserad bakgrund utanför svensk
 * täckning istället för ett fel, så vilken källa som har data går inte
 * att avgöra av svaret. Positionen avgör istället: ligger rutans mitt i
 * Sverige hämtas den från Lantmäteriet, annars från Kartverket.
 */

import { SVERIGE } from './sverige.js';

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

/** Källordning för en ruta: den som har data först, den andra som reserv. */
export function kallordning(z, x, y) {
  const [lon, lat] = rutansMitt(z, x, y);
  return iSverige(lon, lat) ? ['se', 'no'] : ['no', 'se'];
}
