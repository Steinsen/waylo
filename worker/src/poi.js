/**
 * D1-queries mot POI-databasen.
 *
 * Regler:
 *  - Alltid instans_id i varje query — aldrig globala queries utan filter.
 *  - Flerspråkiga fält lagras som JSON-strängar och plockas ut med
 *    json_extract() eller parsas i kod.
 *  - Media lagras som storage_id (R2-nyckel); URL byggs här, aldrig i DB.
 */

const JSON_FALT = [
  'namn', 'kortbeskrivning', 'beskrivning', 'praktisk_info', 'tips',
  'kategori_ids', 'taggar', 'sasong', 'lamplig_alder', 'lamplig_for',
  'transport',
];

function parseJsonFalt(rad) {
  if (!rad) return rad;
  const ut = { ...rad };
  for (const falt of JSON_FALT) {
    if (typeof ut[falt] === 'string') {
      try {
        ut[falt] = JSON.parse(ut[falt]);
      } catch {
        // Lämna som råtext om det inte är giltig JSON
      }
    }
  }
  return ut;
}

/** Plockar ut ett språk ur ett flerspråkigt fält, med fallback. */
export function sprakvarde(falt, sprak = 'sv') {
  if (falt == null) return null;
  if (typeof falt === 'string') return falt;
  return falt[sprak] ?? falt.sv ?? falt.en ?? Object.values(falt)[0] ?? null;
}

/** Bygger publik media-URL från R2-nyckel. */
export function mediaUrl(env, media) {
  if (!media) return null;
  if (media.extern_url) return media.extern_url;
  if (!media.storage_id) return null;
  const bas = (env.MEDIA_BASE_URL || '').replace(/\/$/, '');
  return `${bas}/${media.storage_id}`;
}

/**
 * Sök POI:er. Alla filter är valfria och kombineras med AND.
 * Används både av chatbotens databasverktyg och av GET /poi.
 */
export async function sokPoi(env, instans_id, filter = {}) {
  const villkor = ['p.instans_id = ?', 'p.aktiv = 1'];
  const params = [instans_id];

  if (filter.sasong) {
    villkor.push(
      `EXISTS (SELECT 1 FROM json_each(p.sasong) WHERE value = ?)`
    );
    params.push(filter.sasong);
  }

  if (filter.kategori) {
    // Matchar både kategori-slug ("vandring") och full id ("kat-vandring")
    villkor.push(
      `EXISTS (
         SELECT 1 FROM json_each(p.kategori_ids) je
          WHERE je.value = ? OR je.value = 'kat-' || ?
       )`
    );
    params.push(filter.kategori, filter.kategori);
  }

  if (filter.lamplig_for) {
    villkor.push(
      `EXISTS (
         SELECT 1 FROM json_each(p.lamplig_for)
          WHERE lower(value) LIKE lower(?)
       )`
    );
    params.push(`%${filter.lamplig_for}%`);
  }

  if (filter.svarighetsgrad) {
    villkor.push('p.svarighetsgrad = ?');
    params.push(filter.svarighetsgrad);
  }

  if (filter.fritext) {
    const q = `%${filter.fritext}%`;
    villkor.push(`(
      json_extract(p.namn, '$.sv')            LIKE ?
      OR json_extract(p.namn, '$.en')         LIKE ?
      OR json_extract(p.kortbeskrivning,'$.sv') LIKE ?
      OR json_extract(p.beskrivning, '$.sv')  LIKE ?
      OR p.taggar                             LIKE ?
    )`);
    params.push(q, q, q, q, q);
  }

  const limit = Math.min(Number(filter.limit) || 10, 50);

  const { results } = await env.DB.prepare(`
    SELECT p.*
      FROM poi p
     WHERE ${villkor.join('\n       AND ')}
     ORDER BY p.avstand_fran_lodge_km IS NULL, p.avstand_fran_lodge_km ASC
     LIMIT ${limit}
  `).bind(...params).all();

  return results.map(parseJsonFalt);
}

/**
 * Lättviktig lista för kartvyn — bara det frontend behöver för markers.
 */
export async function poiForKarta(env, instans_id, sasong) {
  const villkor = ['p.instans_id = ?', 'p.aktiv = 1', 'p.lat IS NOT NULL'];
  const params = [instans_id];

  if (sasong) {
    villkor.push(`EXISTS (SELECT 1 FROM json_each(p.sasong) WHERE value = ?)`);
    params.push(sasong);
  }

  const { results } = await env.DB.prepare(`
    SELECT p.id, p.slug, p.namn, p.kortbeskrivning, p.kategori_ids,
           p.sasong, p.taggar, p.svarighetsgrad, p.lat, p.lng,
           p.avstand_fran_lodge_km, p.restid_min,
           p.langd_km, p.hojdskillnad_m, p.hojdpunkt_m
      FROM poi p
     WHERE ${villkor.join('\n       AND ')}
     ORDER BY p.avstand_fran_lodge_km IS NULL, p.avstand_fran_lodge_km ASC
  `).bind(...params).all();

  return results.map(parseJsonFalt);
}

/** Full POI med punkter, media och öppettider. */
export async function hamtaPoi(env, instans_id, slug) {
  const poi = await env.DB.prepare(
    `SELECT * FROM poi WHERE instans_id = ? AND slug = ? AND aktiv = 1`
  ).bind(instans_id, slug).first();

  if (!poi) return null;

  const [punkter, media, oppettider] = await Promise.all([
    env.DB.prepare(
      `SELECT * FROM poi_punkter WHERE poi_id = ? ORDER BY sortering`
    ).bind(poi.id).all(),
    env.DB.prepare(
      `SELECT * FROM poi_media WHERE poi_id = ? AND aktiv = 1 ORDER BY sortering`
    ).bind(poi.id).all(),
    env.DB.prepare(
      `SELECT * FROM poi_oppettider WHERE poi_id = ?`
    ).bind(poi.id).all(),
  ]);

  return {
    ...parseJsonFalt(poi),
    punkter: punkter.results.map((p) => ({
      ...p,
      namn: p.namn ? safeParse(p.namn) : null,
    })),
    media: media.results.map((m) => ({
      ...m,
      url: mediaUrl(env, m),
      namn: m.namn ? safeParse(m.namn) : null,
      caption: m.caption ? safeParse(m.caption) : null,
      alt_text: m.alt_text ? safeParse(m.alt_text) : null,
    })),
    oppettider: oppettider.results.map((o) => ({
      ...o,
      info: o.info ? safeParse(o.info) : null,
      pris: o.pris ? safeParse(o.pris) : null,
    })),
  };
}

/** Kategorier för en instans (globala + instansspecifika). */
export async function hamtaKategorier(env, instans_id) {
  const { results } = await env.DB.prepare(
    `SELECT * FROM kategorier
      WHERE instans_id IS NULL OR instans_id = ?
      ORDER BY sortering, slug`
  ).bind(instans_id).all();

  return results.map((k) => ({ ...k, namn: safeParse(k.namn) }));
}

/** Loggar en fråga för att kunna förbättra innehållet. */
export async function loggaChatt(env, { instans_id, session_id, fraga, svar, poi_ids, sprak }) {
  try {
    await env.DB.prepare(
      `INSERT INTO chatt_logg
         (instans_id, session_id, fraga, svar, poi_ids_visade, sprak)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(
      instans_id,
      session_id || null,
      fraga,
      svar || null,
      JSON.stringify(poi_ids || []),
      sprak || 'sv'
    ).run();
  } catch (err) {
    // Loggning får aldrig fälla ett svar till gästen
    console.error('chatt_logg misslyckades:', err.message);
  }
}

function safeParse(varde) {
  try {
    return JSON.parse(varde);
  } catch {
    return varde;
  }
}
