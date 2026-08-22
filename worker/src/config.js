/**
 * Instans-konfiguration och systemprompt.
 *
 * En instans = ett område/en kund. Konfigurationen hämtas från
 * `instanser`-tabellen i D1 och cachas i KV, så en ny instans kräver
 * ingen kodändring — bara en ny rad i databasen och en ny INSTANS_ID.
 */

const CONFIG_TTL = 300; // sekunder

/** Instansspecifika säljargument som chatboten får nämna när det passar. */
const FORDELAR = {
  'inst-arctic-lodge': [
    'Ski-in/ski-out för topptur — fjällterräng direkt från dörren',
    'Snöskoteruppställning direkt vid entrén',
    'Självhushåll — egna lägenheter med kök, billigare för grupper',
    '500m till nattåget Stockholm–Narvik',
  ],
};

/**
 * Var Anthropics web search ska anses stå geografiskt. Utan detta
 * tolkas "närmaste apotek" utifrån var Anthropics servrar råkar ligga.
 */
const SOKPLATS = {
  'inst-arctic-lodge': {
    type: 'approximate',
    city: 'Riksgränsen',
    region: 'Norrbotten',
    country: 'SE',
    timezone: 'Europe/Stockholm',
  },
};

export function sokplats(instans_id) {
  return SOKPLATS[instans_id] ?? null;
}

/**
 * Arktisk säsongslogik: lång vinter, kort sommar.
 * Juni–september räknas som sommar, resten som vinter.
 */
export function aktuellSasong(date = new Date()) {
  const manad = date.getUTCMonth() + 1;
  return manad >= 6 && manad <= 9 ? 'sommar' : 'vinter';
}

export function andraSasongen(sasong) {
  return sasong === 'sommar' ? 'vinter' : 'sommar';
}

/** Hämtar instansen från D1, med KV som cache. */
export async function hamtaInstans(env, instans_id) {
  const cacheKey = `instans:${instans_id}`;

  if (env.CACHE) {
    const cached = await env.CACHE.get(cacheKey, 'json');
    if (cached) return cached;
  }

  const instans = await env.DB.prepare(
    `SELECT id, slug, namn, beskrivning, center_lat, center_lng,
            zoom_default, sprak
       FROM instanser
      WHERE id = ? AND aktiv = 1`
  ).bind(instans_id).first();

  if (!instans) throw new Error(`Okänd instans: ${instans_id}`);

  if (env.CACHE) {
    await env.CACHE.put(cacheKey, JSON.stringify(instans), {
      expirationTtl: CONFIG_TTL,
    });
  }
  return instans;
}

/** Bygger systemprompten för en instans. */
export function byggSystemPrompt(instans, { sasong, sprak, datum }) {
  const fordelar = (FORDELAR[instans.id] || [])
    .map((rad) => `- ${rad}`)
    .join('\n');

  return `Du är turistguide och assistent för ${instans.namn}.
${instans.beskrivning ? `\nOM PLATSEN: ${instans.beskrivning}\n` : ''}
AKTUELL SÄSONG: ${sasong} (${datum})
SPRÅK: Svara på ${sprak} om inte gästen skriver på annat språk.

Du har tillgång till en lokal databas med sevärdheter och aktiviteter,
samt möjlighet att söka på internet för aktuell information.
${fordelar ? `\nHOTELLETS UNIKA FÖRDELAR (nämn när relevant):\n${fordelar}\n` : ''}
Regler:
- Sök alltid i databasen innan du svarar på frågor om aktiviteter
- Boka aldrig rum eller lova priser — hänvisa till receptionen
- Om du inte vet, säg det och hänvisa till personal
- Håll svar kortfattade (3-5 meningar) men lägg gärna till ett
  oväntat tips som gästen inte frågat om
- Nämn gärna att det finns aktiviteter för andra säsonger också —
  gäster bokar långt i förväg och vill veta vad som finns året om`;
}
