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
import { kallordning, rutansMitt, iSverige } from './geo.js';
import { VERSION } from './version.js';

const CACHE_TTL = 86400; // 24h
// Deras TileMatrixSet 3857 går 0–15 enligt GetCapabilities.
const MAX_ZOOM = 15;

// Lantmäteriet svarar 200 med en tom vit ruta utanför svensk täckning
// istället för ett fel, så fallbacken utlöses aldrig av statuskoden.
// En enfärgad 256x256-PNG komprimeras till några hundra byte medan en
// riktig topografisk ruta är tiotusentals — gapet är stort nog att
// skilja på dem. Justeras med TOM_RUTA_BYTES.
const TOM_RUTA_BYTES = 1500;

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
  // Diagnostik: hämtar ett rutnät från båda källorna och rapporterar
  // status och storlek. Gör gränsen för "tom ruta" mätbar istället för
  // gissad — svenska rutor över Norge är inte tomma utan innehåller en
  // generaliserad bakgrund, så storleken måste läsas av.
  if (url.pathname === '/tiles/prov') {
    return await provaRutor(env, cors, url.searchParams);
  }

  if (url.pathname === '/tiles/capabilities') {
    return await hamtaCapabilities(
      env,
      cors,
      url.searchParams.has('raw'),
      url.searchParams.get('kalla') === 'no' ? 'no' : 'se'
    );
  }

  const match = url.pathname.match(
    /^\/tiles\/(se\/|no\/)?(\d+)\/(\d+)\/(\d+)\.png$/
  );
  if (!match) return null;
  if (request.method !== 'GET') {
    return new Response('Method not allowed', { status: 405, headers: cors });
  }

  const [, prefix, z, x, y] = match;
  // Rutans position avgör källa. Den andra källan står kvar som reserv:
  // Natural Earths gräns är några hundra meter oprecis just vid
  // Riksgränsen, och där fångar innehållskontrollen längre ner felet.
  // Med prefix tvingas ett land, för felsökning.
  const land =
    prefix === 'no/' ? ['no'] : prefix === 'se/' ? ['se'] : kallordning(z, x, y);
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

  let buffer = null;
  let anvant = null;
  let reserv = null;          // tom ruta att falla tillbaka på i värsta fall
  const fel = [];
  const tomGrans = Number(env.TOM_RUTA_BYTES) || TOM_RUTA_BYTES;

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
    if (!svar.ok) {
      fel.push(`${kod}: ${svar.status}`);
      await svar.text().catch(() => {});
      continue;
    }

    const data = await svar.arrayBuffer();

    // Tom ruta: spara som sista utväg och fråga nästa källa
    if (data.byteLength <= tomGrans && land.length > 1) {
      fel.push(`${kod}: tom ruta (${data.byteLength} B)`);
      reserv ??= { data, kod };
      continue;
    }

    buffer = data;
    anvant = kod;
    break;
  }

  if (!buffer && reserv) {
    buffer = reserv.data;
    anvant = `${reserv.kod}-tom`;
  }

  if (!buffer) {
    console.error(`Tile ${z}/${x}/${y} misslyckades — ${fel.join(', ')}`);
    return new Response(`Ingen källa hade rutan. ${fel.join(', ')}`, {
      status: 502,
      headers: { ...cors, 'X-Upstream-Status': fel.join(', ') },
    });
  }

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

async function provaRutor(env, cors, p) {
  const z = Number(p.get('z') ?? 9);
  const x0 = Number(p.get('x') ?? 0);
  const y0 = Number(p.get('y') ?? 0);
  const n = Math.min(Math.max(Number(p.get('n')) || 3, 1), 4);
  const alla = mallar(env);

  if (!Number.isInteger(z) || !Number.isInteger(x0) || !Number.isInteger(y0)) {
    return Response.json({ fel: 'z, x och y måste vara heltal' }, { status: 400, headers: cors });
  }

  const rutor = [];
  for (let dy = 0; dy < n; dy++) {
    for (let dx = 0; dx < n; dx++) {
      rutor.push({ x: x0 + dx, y: y0 + dy });
    }
  }

  const resultat = await Promise.all(
    rutor.map(async ({ x, y }) => {
      const rad = { x, y };
      for (const kod of ['se', 'no']) {
        const upstream = alla[kod]
          .replaceAll('{z2}', String(z).padStart(2, '0'))
          .replaceAll('{z}', String(z))
          .replaceAll('{x}', String(x))
          .replaceAll('{y}', String(y))
          .replaceAll('{token}', env.LANTMATERIET_TOKEN || '');
        const headers =
          kod === 'se' && !alla[kod].includes('{token}')
            ? await authHeaders(env)
            : {};
        try {
          const res = await fetch(upstream, { headers });
          const bytes = res.ok ? (await res.arrayBuffer()).byteLength : 0;
          rad[kod] = { status: res.status, bytes };
        } catch (e) {
          rad[kod] = { status: 0, fel: e.message };
        }
      }
      return rad;
    })
  );

  const storlekar = (kod) =>
    resultat.map((r) => r[kod]?.bytes).filter((b) => b > 0).sort((a, b) => a - b);

  const se = storlekar('se');
  const no = storlekar('no');
  const spann = (v) =>
    v.length ? { minsta: v[0], median: v[Math.floor(v.length / 2)], storsta: v[v.length - 1] } : null;

  return Response.json(
    {
      z,
      nuvarande_grans: Number(env.TOM_RUTA_BYTES) || TOM_RUTA_BYTES,
      se_storlekar: spann(se),
      no_storlekar: spann(no),
      rutor: resultat,
    },
    { headers: cors }
  );
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
      'X-Tile-Bytes': String(buffer.byteLength ?? ''),
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
