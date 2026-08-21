/**
 * Verktyg som Claude får anropa (tool use).
 *
 * - search_poi_database → lokal D1-databas
 * - search_web          → Brave Search (aktuell info, GDPR-ok)
 * - get_weather         → yr.no / api.met.no (gratis, ingen nyckel)
 */

import { sokPoi, sprakvarde } from './poi.js';

export const tools = [
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
    name: 'search_web',
    description:
      'Sök aktuell info på internet — öppettider, events, butiker, ' +
      'transport, priser. Använd när frågan gäller något som kan ha ' +
      'förändrats eller inte finns i den lokala databasen.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_weather',
    description:
      'Hämta aktuellt väder och prognos för området kring hotellet.',
    input_schema: { type: 'object', properties: {} },
  },
];

/** Kör ett verktyg. Returnerar alltid en sträng (tool_result-innehåll). */
export async function executeTool(name, input, env, ctx) {
  switch (name) {
    case 'search_poi_database':
      return await sokDatabas(input, env, ctx);
    case 'search_web':
      return await sokWebb(input, env);
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

async function sokWebb(input, env) {
  if (!env.BRAVE_API_KEY) {
    return 'Webbsökning är inte konfigurerad. Hänvisa gästen till receptionen.';
  }

  const res = await fetch(
    'https://api.search.brave.com/res/v1/web/search' +
      `?q=${encodeURIComponent(input.query)}&count=5&country=se`,
    {
      headers: {
        Accept: 'application/json',
        'X-Subscription-Token': env.BRAVE_API_KEY,
      },
    }
  );

  if (!res.ok) {
    return `Webbsökningen misslyckades (${res.status}).`;
  }

  const data = await res.json();
  const snippets = data.web?.results
    ?.slice(0, 3)
    .map((r) => `${r.title}: ${r.description} (${r.url})`)
    .join('\n');

  return snippets || 'Inga resultat hittades.';
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
