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

const CACHE_TTL = 86400; // 24h
const MAX_ZOOM = 14;

// Lantmäteriets öppna WMTS, avgiftsfri och utan token.
//
// Sätt WMTS_URL i wrangler.toml för att peka någon annanstans — t.ex.
// den token-baserade api.lantmateriet.se, eller den betalversion som
// tar vid när avgiftsfriheten utgår 2026-12-31. Platshållarna {z} {x}
// {y} ersätts per tile och {token} med LANTMATERIET_TOKEN. Saknar
// mallen {token} men en token är satt skickas den som
// Authorization: Bearer istället.
const WMTS_BAS = 'https://maps.lantmateriet.se/open/topowebb-ccby/v1/wmts';

const STANDARD_WMTS =
  WMTS_BAS +
  '?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0' +
  '&LAYER=topowebb&STYLE=default&TILEMATRIXSET=3857' +
  '&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&FORMAT=image/png';

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
    return await hamtaCapabilities(env, cors, url.searchParams.has('raw'));
  }

  const match = url.pathname.match(/^\/tiles\/(\d+)\/(\d+)\/(\d+)\.png$/);
  if (!match) return null;
  if (request.method !== 'GET') {
    return new Response('Method not allowed', { status: 405, headers: cors });
  }

  const [, z, x, y] = match;
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

  // 3) Lantmäteriet
  const mall = env.WMTS_URL || STANDARD_WMTS;
  const token = env.LANTMATERIET_TOKEN || '';

  if (mall.includes('{token}') && !token) {
    return new Response(
      'Mallen har {token} men LANTMATERIET_TOKEN är inte satt.',
      { status: 503, headers: { ...cors, 'X-Upstream-Status': 'ingen-token' } }
    );
  }

  const lmUrl = mall
    .replaceAll('{z}', z)
    .replaceAll('{x}', x)
    .replaceAll('{y}', y)
    .replaceAll('{token}', token);

  // Token i sökvägen är ett av Lantmäteriets mönster; annars går
  // inloggningen via Authorization-headern.
  const headers = mall.includes('{token}') ? {} : await authHeaders(env);

  const response = await fetch(lmUrl, { headers });
  if (!response.ok) {
    // Svälj inte vad upstream sa — utan det går felet inte att felsöka.
    const detalj = (await response.text().catch(() => '')).slice(0, 200);
    console.error(
      `Tile ${z}/${x}/${y}: upstream ${response.status} ${response.statusText} ${detalj}`
    );
    return new Response(
      `Upstream svarade ${response.status}. ${detalj}`,
      {
        status: 502,
        headers: { ...cors, 'X-Upstream-Status': String(response.status) },
      }
    );
  }

  const buffer = await response.arrayBuffer();
  const svar = tileSvar(buffer, cors, 'MISS');

  ctx.waitUntil(
    Promise.all([
      env.CACHE
        ? env.CACHE.put(`tile:${z}:${x}:${y}`, buffer, { expirationTtl: CACHE_TTL })
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

async function hamtaCapabilities(env, cors, ra) {
  const capUrl =
    (env.WMTS_CAPABILITIES_URL || WMTS_BAS) +
    '?SERVICE=WMTS&REQUEST=GetCapabilities&VERSION=1.0.0';

  const auth = await authStatus(env);
  const res = await fetch(capUrl, { headers: await authHeaders(env) });
  const xml = await res.text();

  if (ra) {
    return new Response(xml, {
      status: res.status,
      headers: { ...cors, 'Content-Type': 'application/xml; charset=utf-8' },
    });
  }

  if (!res.ok) {
    return Response.json(
      { url: capUrl, status: res.status, auth, svar: xml.slice(0, 500) },
      { status: 502, headers: cors }
    );
  }

  // ResourceURL-mallar är det RESTful mönstret, om tjänsten erbjuder ett
  const mallar = [...xml.matchAll(/template="([^"]+)"/g)].map((m) => m[1]);

  return Response.json(
    {
      url: capUrl,
      status: res.status,
      auth,
      storlek_kb: Math.round(xml.length / 1024),
      identifierare: taggar(xml, 'Identifier').slice(0, 40),
      format: taggar(xml, 'Format'),
      tilematrixset: taggar(xml, 'TileMatrixSet'),
      supported_crs: taggar(xml, 'SupportedCRS'),
      resource_url_mallar: mallar,
      nuvarande_mall: env.WMTS_URL || STANDARD_WMTS,
    },
    { headers: cors }
  );
}

function tileSvar(buffer, cors, kalla) {
  return new Response(buffer, {
    headers: {
      ...cors,
      'Content-Type': 'image/png',
      'Cache-Control': `public, max-age=${CACHE_TTL}`,
      'X-Cache': kalla,
    },
  });
}

function medHeaders(svar, cors, kalla) {
  const headers = new Headers(svar.headers);
  for (const [k, v] of Object.entries(cors)) headers.set(k, v);
  headers.set('X-Cache', kalla);
  return new Response(svar.body, { status: svar.status, headers });
}
