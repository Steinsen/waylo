/**
 * WayLo — en Cloudflare Worker som serverar allt.
 *
 *   GET  /health                — status + kontroll av bindings
 *   GET  /instans               — instanskonfiguration för frontend
 *   GET  /poi                   — POI:er för kartvyn (?sasong=&kategori=)
 *   GET  /poi/:slug             — full POI med punkter, media, öppettider
 *   GET  /kategorier            — kategorier för filtrering
 *   POST /chat                  — chatbot med tool use (SSE)
 *   GET  /tiles/{z}/{x}/{y}.png — Lantmäteriets kartrutor via cache
 *   allt annat                  — den byggda React-appen från ASSETS
 *
 * Statiska filer som finns i frontend/dist plockas ut av Cloudflare
 * innan workern ens körs. Bara vägar utan matchande fil hamnar här,
 * och det som inte är en API-väg lämnas vidare till ASSETS så att
 * klientsidans routing fungerar.
 */

import { handleChat } from './chat.js';
import { hanteraTile } from './tiles.js';
import {
  poiForKarta,
  hamtaPoi,
  hamtaKategorier,
  sokPoi,
} from './poi.js';
import { hamtaInstans, aktuellSasong, andraSasongen } from './config.js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin');
    const cors = corsHeaders(origin, env);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    try {
      const svar = await route(request, env, url, ctx, cors);
      const headers = new Headers(svar.headers);
      for (const [k, v] of Object.entries(cors)) headers.set(k, v);
      return new Response(svar.body, { status: svar.status, headers });
    } catch (err) {
      console.error('Ohanterat fel:', err);
      return Response.json(
        { fel: 'Internt fel', detalj: err.message },
        { status: 500, headers: cors }
      );
    }
  },
};

async function route(request, env, url, ctx, cors) {
  const path = url.pathname.replace(/\/+$/, '') || '/';
  const instans_id = env.INSTANS_ID;

  // GET /tiles/{z}/{x}/{y}.png — returnerar null om vägen inte matchar
  const tile = await hanteraTile(request, env, ctx, cors);
  if (tile) return tile;

  // GET /health
  if (path === '/health') {
    const bindings = {
      DB: Boolean(env.DB),
      MEDIA: Boolean(env.MEDIA),
      CACHE: Boolean(env.CACHE),
      ASSETS: Boolean(env.ASSETS),
      ANTHROPIC_API_KEY: Boolean(env.ANTHROPIC_API_KEY),
    };
    let db_ok = false;
    try {
      await env.DB.prepare('SELECT 1').first();
      db_ok = true;
    } catch { /* rapporteras som db_ok: false */ }

    return Response.json({
      tjanst: 'waylo',
      instans_id,
      miljo: env.ENVIRONMENT,
      sasong: aktuellSasong(),
      db_ok,
      bindings,
    });
  }

  // GET /instans
  if (path === '/instans' && request.method === 'GET') {
    const instans = await hamtaInstans(env, instans_id);
    const sasong = aktuellSasong();
    return Response.json({
      ...instans,
      sprak: safeParse(instans.sprak),
      sasong,
      andra_sasongen: andraSasongen(sasong),
    });
  }

  // GET /kategorier
  if (path === '/kategorier' && request.method === 'GET') {
    return Response.json(await hamtaKategorier(env, instans_id));
  }

  // GET /poi/:slug
  const detalj = path.match(/^\/poi\/([a-z0-9-]+)$/i);
  if (detalj && request.method === 'GET') {
    const poi = await hamtaPoi(env, instans_id, detalj[1]);
    if (!poi) return Response.json({ fel: 'POI hittades inte' }, { status: 404 });
    return Response.json(poi);
  }

  // GET /poi
  if (path === '/poi' && request.method === 'GET') {
    const p = url.searchParams;
    const filter = {
      sasong: p.get('sasong') || undefined,
      kategori: p.get('kategori') || undefined,
      lamplig_for: p.get('lamplig_for') || undefined,
      svarighetsgrad: p.get('svarighetsgrad') || undefined,
      fritext: p.get('fritext') || undefined,
    };
    const harFilter = Object.values(filter).some(Boolean);

    const poier = harFilter
      ? await sokPoi(env, instans_id, { ...filter, limit: 50 })
      : await poiForKarta(env, instans_id, undefined);

    return Response.json({ antal: poier.length, poi: poier });
  }

  // POST /chat
  if (path === '/chat' && request.method === 'POST') {
    return await handleChat(request, env);
  }

  // Ingen API-väg matchade. Är det ett API-anrop som stavats fel vill vi
  // svara med JSON; allt annat är sannolikt en klientsideväg och lämnas
  // till ASSETS, som serverar index.html (single-page-application).
  if (API_PREFIX.some((p) => path === p || path.startsWith(`${p}/`))) {
    return Response.json({ fel: 'Hittades inte', path }, { status: 404 });
  }

  if (env.ASSETS) return env.ASSETS.fetch(request);
  return Response.json({ fel: 'Hittades inte', path }, { status: 404 });
}

/** Vägar som hör till API:t — allt annat går till frontend-assets. */
const API_PREFIX = ['/health', '/instans', '/poi', '/kategorier', '/chat', '/tiles'];

function corsHeaders(origin, env) {
  const tillatna = (env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  // Tom lista = tillåt alla (endast för lokal utveckling)
  const allow =
    tillatna.length === 0
      ? '*'
      : origin && tillatna.includes(origin)
        ? origin
        : tillatna[0];

  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function safeParse(varde) {
  try {
    return JSON.parse(varde);
  } catch {
    return varde;
  }
}
