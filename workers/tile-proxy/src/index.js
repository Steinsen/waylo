/**
 * Tile-proxy — proxar Lantmäteriets topografiska WMTS-tiles.
 *
 *   GET /tiles/{z}/{x}/{y}.png
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

// Lantmäteriets avgiftsfria WMTS. Kan överridas med WMTS_URL i
// wrangler.toml — {z}/{x}/{y} ersätts per tile.
const STANDARD_WMTS =
  'https://maps.lantmateriet.se/open/topowebb-ccby/v1/wmts' +
  '?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0' +
  '&LAYER=topowebb&STYLE=default&TILEMATRIXSET=3857' +
  '&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&FORMAT=image/png';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const cors = corsHeaders(request.headers.get('Origin'), env);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }
    if (request.method !== 'GET') {
      return new Response('Method not allowed', { status: 405, headers: cors });
    }
    if (url.pathname === '/health') {
      return Response.json({ tjanst: 'waylo-tiles', cache: Boolean(env.CACHE) }, { headers: cors });
    }

    const match = url.pathname.match(/^\/tiles\/(\d+)\/(\d+)\/(\d+)\.png$/);
    if (!match) return new Response('Not found', { status: 404, headers: cors });

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
    const lmUrl = (env.WMTS_URL || STANDARD_WMTS)
      .replace('{z}', z)
      .replace('{x}', x)
      .replace('{y}', y);

    const headers = {};
    if (env.LANTMATERIET_TOKEN) {
      headers.Authorization = `Bearer ${env.LANTMATERIET_TOKEN}`;
    }

    const response = await fetch(lmUrl, { headers });
    if (!response.ok) {
      return new Response('Tile not found', { status: 404, headers: cors });
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
  },
};

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

function corsHeaders(origin, env) {
  const tillatna = (env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  const allow =
    tillatna.length === 0
      ? '*'
      : origin && tillatna.includes(origin)
        ? origin
        : tillatna[0];

  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    Vary: 'Origin',
  };
}
