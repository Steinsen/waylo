/**
 * Tile-proxy — proxar Lantmäteriets topografiska WMTS-tiles.
 *
 *   GET /tiles/{z}/{x}/{y}.png
 *
 * Låg som egen Worker tidigare; bor nu i samma worker som resten.
 *
 * Lägger på CORS-headers och cachar 24h i KV. Cloudflares egen cache
 * används som första lager, KV som andra — så att en kall edge-nod
 * slipper gå till Lantmäteriet.
 *
 * OBS: Lantmäteriets avgiftsfria tjänst utgår 2026-12-31. Byt då
 * LAYER-URL och skicka med: Authorization: Bearer ${env.LANTMATERIET_TOKEN}
 */

import { authHeaders, authStatus } from './lantmateriet.js';
import { VERSION } from './version.js';

const CACHE_TTL = 86400; // 24h
// Deras TileMatrixSet 3857 går 0–15 enligt GetCapabilities.
const MAX_ZOOM = 15;

// Lantmäteriets öppna WMTS, avgiftsfri och utan token.
//
// Sätt WMTS_URL i wrangler.toml för att peka någon annanstans — t.ex.
// den token-baserade api.lantmateriet.se, eller den betalversion som
// tar vid när avgiftsfriheten utgår 2026-12-31. Platshållarna {z} {x}
// {y} ersätts per tile och {token} med LANTMATERIET_TOKEN. Saknar
// mallen {token} men en token är satt skickas den som
// Authorization: Bearer istället.
const WMTS_BAS = 'https://maps.lantmateriet.se/open/topowebb-ccby/v1/wmts';

// Deras egen ResourceURL-mall ur GetCapabilities. TileMatrixSet 3857 är
// GoogleMapsCompatible, så Leaflets z/x/y går rakt in utan omprojicering.
// Lagret styrs av WMTS_LAGER: topowebb eller topowebb_nedtonad.
function standardWmts(lager) {
  return `${WMTS_BAS}/1.0.0/${lager}/default/3857/{z}/{y}/{x}.png`;
}

// Norska Kartverket — gratis och utan inloggning. Deras webmercator
// är samma rutnät som Lantmäteriets 3857, så rutorna passar ihop.
// Lager: topo, topograatone, toporaster (turkart), sjokartraster.
//
// De erbjuder ingen ResourceURL-mall, så KVP är enda vägen. Och deras
// TileMatrix-identifierare är nollutfyllda tvåsiffriga — 08, inte 8 —
// därför {z2} istället för {z}.
const KARTVERKET_BAS = 'https://cache.kartverket.no/v1/service';

function standardKartverket(lager) {
  return (
    `${KARTVERKET_BAS}?service=WMTS&request=GetTile&version=1.0.0` +
    `&layer=${lager}&style=default&tilematrixset=webmercator` +
    '&tilematrix={z2}&tilerow={y}&tilecol={x}&format=image/png'
  );
}

/** Mallarna för respektive land, efter konfiguration. */
function mallar(env) {
  return {
    se: env.WMTS_URL || standardWmts(env.WMTS_LAGER || 'topowebb'),
    no:
      env.KARTVERKET_URL ||
      standardKartverket(env.KARTVERKET_LAGER || 'topo'),
  };
}

/**
 * Hanterar GET /tiles/{z}/{x}/{y}.png. Returnerar null om vägen inte
 * matchar, så routern kan gå vidare.
 */
export async function hanteraTile(request, env, ctx, cors) {
  const url = new URL(request.url);

  // Diagnostik: läser GetCapabilities och plockar ut de identifierare
  // som GetTile-anropen måste stämma med. Workern når Lantmäteriet
  // även när utvecklingsmiljön inte gör det.
  if (url.pathname === '/tiles/capabilities') {
    return await hamtaCapabilities(
      env,
      cors,
      url.searchParams.has('raw'),
      url.searchParams.get('kalla') === 'no' ? 'no' : 'se'
    );
  }

  const match = url.pathname.match(
    /^\/tiles\/(se|no\/)?(\d+)\/(\d+)\/(\d+)\.png$/
  );
  if (!match) return null;
  if (request.method !== 'GET') {
    return new Response('Method not allowed', { status: 405, headers: cors });
  }

  const [, prefix, z, x, y] = match;
  // Utan prefix: svensk ruta först, norsk som reserv där Lantmäteriet
  // saknar täckning. Med prefix: bara det landet, för felsökning.
  const land = prefix === 'no/' ? ['no'] : prefix === 'se' ? ['se'] : ['se', 'no'];
  if (Number(z) > MAX_ZOOM) {
    return new Response('Zoom out of range', { status: 400, headers: cors });
  }

  // 1) Cloudflare edge-cache
  const cache = caches.default;
  const cacheKey = new Request(url.toString(), request);
  const edgeHit = await cache.match(cacheKey);
  if (edgeHit) return medHeaders(edgeHit, cors, 'EDGE');

  // 2) KV-cache
  if (env.CACHE) {
    const kvHit = await env.CACHE.get(`tile:${z}:${x}:${y}`, 'arrayBuffer');
    if (kvHit) {
      const svar = tileSvar(kvHit, cors, 'KV');
      ctx.waitUntil(cache.put(cacheKey, svar.clone()));
      return svar;
    }
  }

  // 3) Upstream — svensk ruta först, norsk som reserv
  const alla = mallar(env);

  const harId = Boolean(env.LANTMATERIET_CLIENT_ID);
  const harHemlighet = Boolean(env.LANTMATERIET_CLIENT_SECRET);
  if (land.includes('se') && harId !== harHemlighet && !env.LANTMATERIET_TOKEN) {
    const saknas = harId
      ? 'LANTMATERIET_CLIENT_SECRET'
      : 'LANTMATERIET_CLIENT_ID';
    return new Response(
      `Bara halva inloggningen är satt — ${saknas} saknas. Ligger den ` +
        'som Text i dashboarden raderas den av varje deploy; lägg in ' +
        'den som Secret.',
      { status: 503, headers: { ...cors, 'X-Upstream-Status': 'halv-inloggning' } }
    );
  }

  let response = null;
  let anvant = null;
  const fel = [];

  for (const kod of land) {
    const mall = alla[kod];
    if (mall.includes('{token}') && !env.LANTMATERIET_TOKEN) {
      fel.push(`${kod}: mallen har {token} men LANTMATERIET_TOKEN saknas`);
      continue;
    }

    const upstreamUrl = mall
      // {z2} före {z}, annars äter den senare upp inledningen
      .replaceAll('{z2}', String(z).padStart(2, '0'))
      .replaceAll('{z}', z)
      .replaceAll('{x}', x)
      .replaceAll('{y}', y)
      .replaceAll('{token}', env.LANTMATERIET_TOKEN || '');

    // Kartverket är öppet; bara Lantmäteriet vill ha inloggning.
    const headers =
      kod === 'se' && !mall.includes('{token}') ? await authHeaders(env) : {};

    const svar = await fetch(upstreamUrl, { headers });
    if (svar.ok) {
      response = svar;
      anvant = kod;
      break;
    }
    fel.push(`${kod}: ${svar.status}`);
    // Töm kroppen så anslutningen kan återanvändas
    await svar.text().catch(() => {});
  }

  if (!response) {
    console.error(`Tile ${z}/${x}/${y} misslyckades — ${fel.join(', ')}`);
    return new Response(`Ingen källa hade rutan. ${fel.join(', ')}`, {
      status: 502,
      headers: { ...cors, 'X-Upstream-Status': fel.join(', ') },
    });
  }

  const buffer = await response.arrayBuffer();
  const svar = tileSvar(buffer, cors, 'MISS', anvant);

  ctx.waitUntil(
    Promise.all([
      env.CACHE
        ? env.CACHE.put(`tile:${land.join('')}:${z}:${x}:${y}`, buffer, {
            expirationTtl: CACHE_TTL,
          })
        : Promise.resolve(),
      cache.put(cacheKey, svar.clone()),
    ])
  );

  return svar;
}

/** Plockar ut alla värden för en namnrymdad tagg. */
function taggar(xml, namn) {
  const träffar = [...xml.matchAll(
    new RegExp(`<(?:\\w+:)?${namn}[^>]*>([^<]*)</(?:\\w+:)?${namn}>`, 'g')
  )];
  return [...new Set(träffar.map((m) => m[1].trim()).filter(Boolean))];
}

async function hamtaCapabilities(env, cors, ra, kalla) {
  const bas =
    kalla === 'no'
      ? env.KARTVERKET_CAPABILITIES_URL || KARTVERKET_BAS
      : env.WMTS_CAPABILITIES_URL || WMTS_BAS;

  const capUrl = `${bas}?SERVICE=WMTS&REQUEST=GetCapabilities&VERSION=1.0.0`;

  // Kartverket är öppet — bara Lantmäteriet behöver inloggning.
  const auth = kalla === 'no' ? { kalla: 'kartverket', oppen: true } : await authStatus(env);
  const res = await fetch(capUrl, {
    headers: kalla === 'no' ? {} : await authHeaders(env),
  });
  const xml = await res.text();

  if (ra) {
    return new Response(xml, {
      status: res.status,
      headers: { ...cors, 'Content-Type': 'application/xml; charset=utf-8' },
    });
  }

  if (!res.ok) {
    return Response.json(
      { version: VERSION, url: capUrl, status: res.status, auth, svar: xml.slice(0, 500) },
      { status: 502, headers: cors }
    );
  }

  // ResourceURL-mallar är det RESTful mönstret, om tjänsten erbjuder ett
  const resursMallar = [...xml.matchAll(/template="([^"]+)"/g)].map((m) => m[1]);

  return Response.json(
    {
      version: VERSION,
      url: capUrl,
      status: res.status,
      auth,
      storlek_kb: Math.round(xml.length / 1024),
      identifierare: taggar(xml, 'Identifier').slice(0, 40),
      format: taggar(xml, 'Format'),
      tilematrixset: taggar(xml, 'TileMatrixSet'),
      supported_crs: taggar(xml, 'SupportedCRS'),
      resource_url_mallar: resursMallar,
      nuvarande_mall: mallar(env)[kalla],
    },
    { headers: cors }
  );
}

function tileSvar(buffer, cors, kalla, land) {
  return new Response(buffer, {
    headers: {
      ...cors,
      'Content-Type': 'image/png',
      'Cache-Control': `public, max-age=${CACHE_TTL}`,
      'X-Cache': kalla,
      ...(land ? { 'X-Tile-Kalla': land } : {}),
    },
  });
}

function medHeaders(svar, cors, kalla) {
  const headers = new Headers(svar.headers);
  for (const [k, v] of Object.entries(cors)) headers.set(k, v);
  headers.set('X-Cache', kalla);
  return new Response(svar.body, { status: svar.status, headers });
}
