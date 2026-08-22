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

const CACHE_TTL = 86400; // 24h
const MAX_ZOOM = 14;

// Lantmäteriets öppna WMTS. Kräver en token som hämtas gratis via
// opendata.lantmateriet.se — den sitter i sökvägen, inte som header.
//
// Sätt WMTS_URL i wrangler.toml för att peka någon annanstans.
// Platshållarna {z} {x} {y} ersätts per tile, {token} med
// LANTMATERIET_TOKEN. Saknas {token} i URL:en men token finns skickas
// den istället som Authorization: Bearer, för endpoints som vill ha
// det så.
const STANDARD_WMTS =
  'https://api.lantmateriet.se/open/topowebb-ccby/v1/wmts' +
  '/token/{token}/1.0.0/topowebb/default/3857/{z}/{y}/{x}.png';

/**
 * Hanterar GET /tiles/{z}/{x}/{y}.png. Returnerar null om vägen inte
 * matchar, så routern kan gå vidare.
 */
export async function hanteraTile(request, env, ctx, cors) {
  const url = new URL(request.url);

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
      'LANTMATERIET_TOKEN saknas. Hämta en gratis token på ' +
        'opendata.lantmateriet.se och lägg in den som secret.',
      { status: 503, headers: { ...cors, 'X-Upstream-Status': 'ingen-token' } }
    );
  }

  const lmUrl = mall
    .replaceAll('{z}', z)
    .replaceAll('{x}', x)
    .replaceAll('{y}', y)
    .replaceAll('{token}', token);

  // Token i sökvägen är Lantmäteriets eget mönster. Bearer-varianten
  // finns kvar för endpoints som vill ha den så.
  const headers = {};
  if (token && !mall.includes('{token}')) {
    headers.Authorization = `Bearer ${token}`;
  }

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
