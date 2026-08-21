/**
 * Klient mot WayLo-API:t (Cloudflare Worker).
 */

export async function hamtaInstans(apiUrl) {
  const res = await fetch(`${apiUrl}/instans`);
  if (!res.ok) throw new Error(`Kunde inte hämta instans (${res.status})`);
  return res.json();
}

export async function hamtaPoi(apiUrl, filter = {}) {
  const params = new URLSearchParams(
    Object.entries(filter).filter(([, v]) => v)
  );
  const res = await fetch(`${apiUrl}/poi?${params}`);
  if (!res.ok) throw new Error(`Kunde inte hämta POI:er (${res.status})`);
  const data = await res.json();
  return data.poi ?? [];
}

export async function hamtaKategorier(apiUrl) {
  const res = await fetch(`${apiUrl}/kategorier`);
  if (!res.ok) throw new Error(`Kunde inte hämta kategorier (${res.status})`);
  return res.json();
}

/**
 * Strömmar ett chattsvar. `onHandelse` anropas för varje SSE-händelse:
 *   { typ: 'text' | 'verktyg' | 'poi' | 'klar' | 'fel', ... }
 */
export async function chatta(apiUrl, { fraga, historik, sprak, session_id }, onHandelse, signal) {
  const res = await fetch(`${apiUrl}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fraga, historik, sprak, session_id }),
    signal,
  });

  if (!res.ok || !res.body) {
    const fel = await res.text().catch(() => '');
    throw new Error(fel || `Chattfel (${res.status})`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffert = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffert += decoder.decode(value, { stream: true });
    const delar = buffert.split('\n\n');
    buffert = delar.pop();

    for (const del of delar) {
      const rad = del.split('\n').find((r) => r.startsWith('data: '));
      if (!rad) continue;
      try {
        onHandelse(JSON.parse(rad.slice(6)));
      } catch {
        // Ignorera ofullständiga/trasiga händelser
      }
    }
  }
}

/** Enkelt session-id så att chatt_logg kan gruppera en konversation. */
export function sessionId() {
  const nyckel = 'waylo_session';
  try {
    let id = sessionStorage.getItem(nyckel);
    if (!id) {
      id = crypto.randomUUID();
      sessionStorage.setItem(nyckel, id);
    }
    return id;
  } catch {
    return crypto.randomUUID();
  }
}
