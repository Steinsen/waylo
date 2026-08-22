/**
 * Verktyg som Claude får anropa (tool use).
 *
 * - search_poi_database → lokal D1-databas (vi kör den)
 * - get_weather         → yr.no / api.met.no (vi kör den, gratis, ingen nyckel)
 * - web_search          → Anthropics server-side tool (de kör den)
 *
 * web_search är ett server tool: Claude utför sökningen på Anthropics
 * sida och resultatet kommer tillbaka som content-block i samma svar.
 * Den dyker aldrig upp som tool_use hos oss och passerar aldrig
 * executeTool. Källhänvisningar följer alltid med och måste visas för
 * gästen — se hanteringen av citations i chat.js.
 */

import { sokPoi, sprakvarde } from './poi.js';
import { sokplats } from './config.js';

/** Verktyg vi kör själva. */
const klientVerktyg = [
  {
    name: 'search_poi_database',
    description:
      'Sök i hotellets lokala databas efter sevärdheter, aktiviteter, ' +
      'restauranger, service och tips. Använd för frågor om lokala ' +
      'aktiviteter, vandring, skidor, MTB, barnvänliga utflykter, ' +
      'mat och transport i närområdet.',
    input_schema: {
      type: 'object',
      properties: {
        kategori: {
          type: 'string',
          description: 'ex: vandring, skidor, topptur, mtb, kultur, mat, utsikt, snoter',
        },
        sasong: { type: 'string', enum: ['sommar', 'vinter'] },
        lamplig_for: {
          type: 'string',
          description: 'ex: familj, erfaren, nybörjare, senior',
        },
        svarighetsgrad: {
          type: 'string',
          enum: ['lätt', 'medel', 'svår', 'expert'],
        },
        fritext: { type: 'string', description: 'fritextsökning' },
      },
    },
  },
  {
    name: 'get_weather',
    description:
      'Hämta aktuellt väder och prognos för området kring hotellet.',
    input_schema: { type: 'object', properties: {} },
  },
];

/**
 * Hela verktygslistan för en instans — klientverktygen plus Anthropics
 * web search, lokaliserad till instansens ort så att frågor som
 * "närmaste apotek" ger träffar i rätt del av världen.
 */
export function byggTools(instans_id) {
  const plats = sokplats(instans_id);
  return [
    ...klientVerktyg,
    {
      type: 'web_search_20260318',
      name: 'web_search',
      max_uses: 5,
      ...(plats ? { user_location: plats } : {}),
    },
  ];
}

/** True för verktyg vi kör själva (server tools kör Anthropic). */
export function arKlientVerktyg(namn) {
  return klientVerktyg.some((t) => t.name === namn);
}

/** Kör ett verktyg. Returnerar alltid en sträng (tool_result-innehåll). */
export async function executeTool(name, input, env, ctx) {
  switch (name) {
    case 'search_poi_database':
      return await sokDatabas(input, env, ctx);
    case 'get_weather':
      return await hamtaVader(ctx.instans);
    default:
      return `Okänt verktyg: ${name}`;
  }
}

async function sokDatabas(input, env, ctx) {
  const traffar = await sokPoi(env, ctx.instans_id, { ...input, limit: 10 });

  // Spara vilka POI:er som visats — används av kartan och chatt_logg
  for (const poi of traffar) ctx.poi_ids.add(poi.id);

  if (!traffar.length) {
    return 'Inga träffar i den lokala databasen för den sökningen.';
  }

  const sprak = ctx.sprak;
  return JSON.stringify(
    traffar.map((p) => ({
      slug: p.slug,
      namn: sprakvarde(p.namn, sprak),
      kort: sprakvarde(p.kortbeskrivning, sprak),
      beskrivning: sprakvarde(p.beskrivning, sprak),
      tips: sprakvarde(p.tips, sprak),
      praktisk_info: sprakvarde(p.praktisk_info, sprak),
      sasong: p.sasong,
      taggar: p.taggar,
      svarighetsgrad: p.svarighetsgrad,
      lamplig_for: p.lamplig_for,
      lamplig_alder: p.lamplig_alder,
      tillganglighet: p.tillganglighet,
      avstand_km: p.avstand_fran_lodge_km,
      restid_min: p.restid_min,
      transport: p.transport,
      langd_km: p.langd_km,
      hojdskillnad_m: p.hojdskillnad_m,
      hojdpunkt_m: p.hojdpunkt_m,
    }))
  );
}

async function hamtaVader(instans) {
  const lat = instans?.center_lat ?? 68.356;
  const lon = instans?.center_lng ?? 18.823;

  const res = await fetch(
    'https://api.met.no/weatherapi/locationforecast/2.0/compact' +
      `?lat=${lat.toFixed(4)}&lon=${lon.toFixed(4)}`,
    { headers: { 'User-Agent': 'waylo/1.0 info@arcticlodge.nu' } }
  );

  if (!res.ok) return `Väderdata är inte tillgänglig just nu (${res.status}).`;

  const data = await res.json();
  const serie = data.properties.timeseries;
  const nu = serie[0].data.instant.details;

  // Prognos ~24h fram (yr.no ger timupplösning de första dygnen)
  const prognos = serie.slice(1, 25).filter((_, i) => i % 6 === 5).map((t) => ({
    tid: t.time,
    temperatur: t.data.instant.details.air_temperature,
    vind_ms: t.data.instant.details.wind_speed,
    symbol: t.data.next_6_hours?.summary?.symbol_code ?? null,
  }));

  return JSON.stringify({
    plats: { lat, lon },
    nu: {
      temperatur: nu.air_temperature,
      vind_ms: nu.wind_speed,
      vindby_ms: nu.wind_speed_of_gust ?? null,
      luftfuktighet: nu.relative_humidity,
    },
    prognos_kommande_dygn: prognos,
  });
}
