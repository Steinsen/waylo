#!/usr/bin/env node
/**
 * Går igenom varje route och kontrollerar att den svarar med rätt sorts
 * innehåll. Fångar den sortens fel som node --check missar — namnkrockar,
 * trasiga importer, routes som aldrig nås.
 *
 *   node scripts/smoke.mjs [bas-url]
 *
 * Utan argument: http://127.0.0.1:8788
 * Kör mot en lokal `wrangler dev` eller mot den deployade workern.
 */

const bas = (process.argv[2] || 'http://127.0.0.1:8788').replace(/\/$/, '');

const prov = [
  { vag: '/',            typ: 'text/html',        vad: 'React-appen från assets' },
  { vag: '/health',      typ: 'application/json', vad: 'status',
    kolla: (d) => d.db_ok === true || `db_ok är ${d.db_ok}` },
  { vag: '/instans',     typ: 'application/json', vad: 'instanskonfig',
    kolla: (d) => Boolean(d.namn) || 'saknar namn' },
  { vag: '/poi',         typ: 'application/json', vad: 'POI-lista',
    kolla: (d) => d.antal > 0 || 'tom lista' },
  { vag: '/poi/kungsleden-start', typ: 'application/json', vad: 'POI-detalj',
    kolla: (d) => Boolean(d.namn) || 'saknar namn' },
  { vag: '/kategorier',  typ: 'application/json', vad: 'kategorier',
    kolla: (d) => Array.isArray(d) && d.length > 0 || 'tom' },
  // Kollar att endpointen svarar strukturerat, inte att upstream lyckas
  // — den kan vara oåtkomlig från utvecklingsmiljön. Ett kodfel ger
  // {fel: "Internt fel"} utan url, vilket fångas.
  { vag: '/tiles/capabilities', typ: 'application/json', vad: 'WMTS-diagnostik',
    kolla: (d) => Boolean(d.url) || `svarade ${JSON.stringify(d).slice(0, 90)}`,
    notera: (d) => (d.status === 200 ? null : `upstream ${d.status}`) },
  { vag: '/tiles/capabilities?kalla=no', typ: 'application/json', vad: 'Kartverket-diagnostik',
    kolla: (d) => Boolean(d.url) || `svarade ${JSON.stringify(d).slice(0, 90)}`,
    notera: (d) => (d.status === 200 ? null : `upstream ${d.status}`) },
  { vag: '/tiles/prov?z=9&x=280&y=119&n=2', typ: 'application/json', vad: 'rutstorlekar',
    kolla: (d) => Array.isArray(d.rutor) && d.rutor.length === 4 || 'fel antal rutor' },
  { vag: '/tiles/8/143/57.png',    typ: 'image/png', vad: 'kartruta, automatval' },
  { vag: '/tiles/se/8/143/57.png', typ: 'image/png', vad: 'svenska lagret' },
  { vag: '/tiles/no/8/143/57.png', typ: 'image/png', vad: 'norska lagret' },
  { vag: '/tiles/16/1/1.png',   status: 400,        vad: 'zoom utanför gränsen' },
  { vag: '/poi/finns-inte',     status: 404,        vad: 'okänd POI ger JSON-404' },
  { vag: '/nagon/klientvag',    typ: 'text/html',   vad: 'SPA-fallback' },
];

let fel = 0;
for (const p of prov) {
  const url = `${bas}${p.vag}`;
  let rad = `${p.vag.padEnd(30)} ${p.vad.padEnd(26)}`;
  try {
    const res = await fetch(url);
    const typ = (res.headers.get('content-type') || '').split(';')[0];

    if (p.status && res.status !== p.status) {
      rad += `FEL: väntade ${p.status}, fick ${res.status}`; fel++;
    } else if (p.typ && typ !== p.typ) {
      const kropp = (await res.text()).slice(0, 120);
      rad += `FEL: väntade ${p.typ}, fick ${typ} — ${kropp}`; fel++;
    } else if (p.kolla) {
      const data = await res.json();
      const utfall = p.kolla(data);
      if (utfall !== true) { rad += `FEL: ${utfall}`; fel++; }
      else {
        const not = p.notera?.(data);
        rad += `ok (${res.status})${not ? ` — ${not}` : ''}`;
      }
    } else {
      rad += `ok (${res.status})`;
    }
  } catch (e) {
    rad += `FEL: ${e.message}`; fel++;
  }
  console.log(rad);
}

console.log(fel ? `\n${fel} av ${prov.length} misslyckades` : `\nAlla ${prov.length} ok`);
process.exit(fel ? 1 : 0);
