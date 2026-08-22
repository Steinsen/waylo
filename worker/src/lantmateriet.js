/**
 * Inloggning mot Lantmäteriets API:er.
 *
 * Deras öppna data ligger bakom ett API-konto: du registrerar en klient
 * på opendata.lantmateriet.se, prenumererar på tjänsten och får ett
 * consumer key/secret-par. Paret växlas in mot en tidsbegränsad token
 * som skickas med varje anrop.
 *
 * Två hemligheter behövs:
 *   LANTMATERIET_CLIENT_ID
 *   LANTMATERIET_CLIENT_SECRET
 *
 * Tokenen cachas i KV tills den går ut, så vi inte växlar in en ny
 * för varje kartruta.
 *
 * maps.lantmateriet.se svarar med en nginx-401, alltså HTTP Basic på
 * webbservernivå — därför är "basic" förval. Tjänster bakom deras
 * API-gateway vill istället ha OAuth2: sätt LANTMATERIET_AUTH =
 * "oauth2" så växlas uppgifterna in mot en token som cachas i KV.
 */

const TOKEN_URL = 'https://apimanager.lantmateriet.se/oauth2/token';
const KV_NYCKEL = 'lm:token';
const MARGINAL_S = 60;   // förnya en minut innan utgång

/**
 * Bygger Authorization-header för ett anrop till Lantmäteriet.
 * Returnerar ett tomt objekt när inga uppgifter är konfigurerade, så
 * avgiftsfria endpoints utan inloggning fungerar som förut.
 */
export async function authHeaders(env) {
  // Statisk token har företräde — enklaste fallet, ingen inväxling
  if (env.LANTMATERIET_TOKEN) {
    return { Authorization: `Bearer ${env.LANTMATERIET_TOKEN}` };
  }

  const id = env.LANTMATERIET_CLIENT_ID;
  const hemlighet = env.LANTMATERIET_CLIENT_SECRET;
  if (!id || !hemlighet) return {};

  const uppgifter = base64(`${id}:${hemlighet}`);

  if ((env.LANTMATERIET_AUTH || 'basic').toLowerCase() === 'basic') {
    return { Authorization: `Basic ${uppgifter}` };
  }

  const token = await hamtaToken(env, uppgifter);
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/**
 * btoa() kastar på tecken utanför Latin-1, så ett lösenord med å ä ö
 * hade fällt hela inloggningen. Koda som UTF-8 först.
 */
function base64(text) {
  const bytes = new TextEncoder().encode(text);
  let binärt = '';
  for (const b of bytes) binärt += String.fromCharCode(b);
  return btoa(binärt);
}

/** Växlar in client credentials mot en token, med KV som cache. */
async function hamtaToken(env, uppgifter) {
  if (env.CACHE) {
    const cachad = await env.CACHE.get(KV_NYCKEL);
    if (cachad) return cachad;
  }

  const res = await fetch(env.LANTMATERIET_TOKEN_URL || TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${uppgifter}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });

  if (!res.ok) {
    const detalj = (await res.text().catch(() => '')).slice(0, 200);
    console.error(`Lantmäteriet token ${res.status}: ${detalj}`);
    return null;
  }

  const data = await res.json();
  const token = data.access_token;
  if (!token) return null;

  const livslangd = Number(data.expires_in) || 3600;
  if (env.CACHE && livslangd > MARGINAL_S) {
    await env.CACHE.put(KV_NYCKEL, token, {
      expirationTtl: livslangd - MARGINAL_S,
    });
  }
  return token;
}

/** Status för /tiles/capabilities — aldrig några värden, bara läget. */
export async function authStatus(env) {
  const har = {
    LANTMATERIET_TOKEN: Boolean(env.LANTMATERIET_TOKEN),
    LANTMATERIET_CLIENT_ID: Boolean(env.LANTMATERIET_CLIENT_ID),
    LANTMATERIET_CLIENT_SECRET: Boolean(env.LANTMATERIET_CLIENT_SECRET),
    metod: env.LANTMATERIET_AUTH || 'basic',
  };
  const headers = await authHeaders(env);
  return {
    ...har,
    inloggad: Boolean(headers.Authorization),
    header_typ: headers.Authorization?.split(' ')[0] ?? null,
  };
}
