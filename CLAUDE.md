# WayLo — Your Local Guide
## Plattform för AI-drivna lokalguider, första instansen: Arctic Lodge

## Vad detta är

WayLo är en konfigurerbar AI-driven lokalguide. Varje installation har
sin egen databas med platsspecifik data men delar samma kodbas och motor.

**Inte bara en trailguide** — WayLo svarar på allt en lokal skulle veta:
aktiviteter, sevärdheter, restauranger, affärer, transport, öppettider.
Lokala frågor hämtas från databasen. Allmänna frågor ("var är närmaste
apotek?") hämtas från webben via Claudes inbyggda web search.

Arctic Lodge (arcticlodge.nu) är första instansen / referenskunden.
Ny config + ny databas = ny instans för vilket område som helst.

---

## Projektstruktur (monorepo)

```
/
├── wrangler.toml           # En Worker för allt — config i repo-roten
├── worker/
│   └── src/
│       ├── index.js        # Routing: API, tiles, resten till ASSETS
│       ├── chat.js         # Claude tool use-logik
│       ├── poi.js          # D1-queries mot POI-databasen
│       ├── tools.js        # Tool-implementationer (db, väder)
│       └── tiles.js        # Lantmäteriets WMTS med cache
│
├── schema/
│   ├── migrations/         # Numrerade D1-migreringar, körs vid deploy
│   │   └── 0001_schema.sql
│   ├── seed-arctic-lodge.sql
│   └── console/            # Samma SQL utan kommentarer, för D1-konsolen
│
├── frontend/               # React + Vite — byggs till frontend/dist och
│   └── src/                # serveras som statiska assets av workern
│       ├── components/
│       │   ├── Map.jsx     # Leaflet-karta med POI-markers och GPX-spår
│       │   └── Chat.jsx    # Chatbot-widget
│       └── config/
│           └── arctic-lodge.js  # Instans-config
│
└── CLAUDE.md               # Den här filen
```

---

## Tech stack

| Del | Val | Anledning |
|---|---|---|
| Databas | Cloudflare D1 (SQLite) | Inbyggt i Cloudflare, ingen extern tjänst, gratis |
| Media/filer | Cloudflare R2 | Bilder och GPX-filer, gratis 10GB |
| Config/cache | Cloudflare KV | Instans-config och tile-caching |
| Backend | Cloudflare Workers | Gratis, globalt, pratar direkt med D1 |
| Frontend | React + Vite | Lätt att bädda in som widget |
| Karta | Leaflet + Lantmäteriet WMTS | Svenska topografiska kartor |
| AI | Claude API med tool use | claude-sonnet-4-6 |
| Webbsökning | Claude web search (server tool) | Inbyggt i API:t, källhänvisningar, ingen extra nyckel |

**Allt lever inom Cloudflare — ingen extern databas.**

---

## Bygga i rätt ordning

### Steg 1 — D1-databas (börja här)
```bash
# Skapa D1-databasen
wrangler d1 create waylo

# Kör schemat (migreringarna körs mot bindningen DB, inte databasnamnet)
wrangler d1 migrations apply DB --remote

# Lägg in testdata för Arctic Lodge
wrangler d1 execute waylo --file=schema/seed-arctic-lodge.sql
```

Spara databas-ID från output — läggs in i `wrangler.toml`.

### Steg 2 — R2-bucket för media
```bash
wrangler r2 bucket create waylo-media
```

Bilder och GPX-filer laddas upp hit. URL-mönster:
`https://media.arcticlodge.nu/{instans_id}/{poi_slug}/{filnamn}`

### Steg 3 — Workern
En Worker (`worker/src/`) med `wrangler.toml` i repo-roten:

- `POST /chat` — chatbot med tool use
- `GET /poi` — hämta POI:er för kartvisning
- `GET /tiles/{z}/{x}/{y}.png` — Lantmäteriets rutor, cachas 24h i KV
- allt annat — den byggda React-appen från ASSETS

Binder D1 direkt (ingen nätverkslatens). Frontend serveras från samma
origin, så CORS behövs bara för WordPress-widgeten.

### Steg 4 — Frontend
```bash
cd frontend && npm create vite@latest . -- --template react
```

Byggs till `frontend/dist` och deployas som en del av workern:
```bash
npm run deploy
```

Bäddas in på arcticlodge.nu via:
```html
<script src="https://chat.arcticlodge.nu/widget.js"></script>
<div id="waylo"></div>
```

### Steg 5 — WordPress-integration
Lägg till script-taggen via "Insert Headers and Footers"-plugin.
Ingen annan kod i WordPress.

---

## wrangler.toml

```toml
name = "waylo"
main = "src/index.js"
compatibility_date = "2024-01-01"

[[d1_databases]]
binding = "DB"          # används i kod som: env.DB.prepare(...)
database_name = "waylo"
database_id = "DITT-D1-ID-HÄR"

[[r2_buckets]]
binding = "MEDIA"
bucket_name = "waylo-media"

[[kv_namespaces]]
binding = "CACHE"
id = "DITT-KV-ID-HÄR"

[vars]
ENVIRONMENT = "production"
```

Miljövariabler (läggs in i Cloudflare Dashboard → Workers → Settings):
```
ANTHROPIC_API_KEY
LANTMATERIET_TOKEN   # när avgiftsfri utgår 2026-12-31
```

---

## Databasen (D1 / SQLite)

### Tabeller (se schema/migrations/0001_schema.sql för komplett schema)

- `instanser` — en rad per område/kund
- `kategorier` — hierarkiska, flerspråkiga (JSON-kolumner)
- `poi` — sevärdheter/aktiviteter, hjärtat i systemet
- `poi_punkter` — enstaka GPS-punkter per POI (start, parkering, topp)
- `poi_media` — bilder, GPX-spår, video — allt media samlat
- `poi_oppettider` — säsongsöppet och priser
- `poi_kommentarer` — recensioner (avstängt från start via aktiv-flagga)
- `chatt_logg` — loggar frågor för att förbättra innehållet

### SQLite vs PostgreSQL — viktiga skillnader

D1 är SQLite. Några anpassningar jämfört med PostgreSQL:

```sql
-- Ingen uuid-funktion — använd TEXT med lower(hex(randomblob(16)))
id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),

-- Ingen jsonb — använd TEXT + JSON-funktioner
namn TEXT NOT NULL,  -- lagras som '{"sv":"...","en":"..."}'
-- Hämta: json_extract(namn, '$.sv')

-- Ingen array-typ — använd TEXT med komma-separering eller JSON
sasong TEXT DEFAULT '[]',  -- '["sommar","vinter"]'
-- Sök: json_each(sasong)

-- Ingen timestamptz — använd TEXT ISO8601
skapad_at TEXT DEFAULT (datetime('now'))
```

### D1-queries i Worker

```javascript
// Hämta POI:er för en säsong och instans
const { results } = await env.DB.prepare(`
  SELECT p.*,
    json_extract(p.namn, '$.sv') as namn_sv,
    json_extract(p.kortbeskrivning, '$.sv') as kortbeskrivning_sv
  FROM poi p
  WHERE p.instans_id = ?
    AND p.aktiv = 1
    AND EXISTS (
      SELECT 1 FROM json_each(p.sasong)
      WHERE value = ?
    )
  ORDER BY p.avstand_fran_lodge_km ASC
`).bind(instans_id, sasong).all();

// Fritextsök
const { results } = await env.DB.prepare(`
  SELECT * FROM poi
  WHERE instans_id = ?
    AND aktiv = 1
    AND (
      json_extract(namn, '$.sv') LIKE ?
      OR json_extract(beskrivning, '$.sv') LIKE ?
      OR taggar LIKE ?
    )
`).bind(instans_id, q, q, q).all();
```

### Viktiga designbeslut

**Flerspråkigt**: alla textfält lagras som JSON-strängar:
`'{"sv": "Kungsleden", "en": "Kungsleden Trail", "no": "Kungsleden"}'`
Hämtas med `json_extract(namn, '$.sv')` i queries.

**Media**: `poi_media`-tabellen hanterar allt. Lagra `storage_id`
(R2-nyckel), bygg URL dynamiskt i kod. Aldrig full URL i databasen.
URL-mönster: `https://media.arcticlodge.nu/{storage_id}`

**Säsong**: skicka alltid BÅDA säsongerna till Claude, markera bara
vilken som är aktuell. Gäster bokar långt i förväg och vill veta
sommaraktiviteter mitt i vintern.

---

## Chatbot — tool use

Claude får tre verktyg — två kör vi, ett kör Anthropic:

```javascript
const tools = [
  {
    name: 'search_poi_database',
    description: 'Sök i hotellets lokala databas efter sevärdheter, ' +
      'aktiviteter, tips. Använd för frågor om lokala aktiviteter, ' +
      'vandring, skidor, MTB, barnvänliga utflykter etc.',
    input_schema: {
      type: 'object',
      properties: {
        kategori:    { type: 'string', description: 'ex: vandring, skidor, mtb, kultur' },
        sasong:      { type: 'string', enum: ['sommar', 'vinter'] },
        lamplig_for: { type: 'string', description: 'ex: familj, erfaren, nybörjare, senior' },
        svarighetsgrad: { type: 'string', enum: ['lätt', 'medel', 'svår', 'expert'] },
        fritext:     { type: 'string', description: 'fritextsökning' }
      }
    }
  },
  // Server tool — Anthropic kör sökningen, vi implementerar ingenting.
  // user_location lokaliserar träffarna till instansens ort.
  {
    type: 'web_search_20260318',
    name: 'web_search',
    max_uses: 5,
    user_location: {
      type: 'approximate',
      city: 'Riksgränsen',
      region: 'Norrbotten',
      country: 'SE',
      timezone: 'Europe/Stockholm'
    }
  },
  {
    name: 'get_weather',
    description: 'Hämta aktuellt väder och prognos för Riksgränsen/Katterjokk.',
    input_schema: { type: 'object', properties: {} }
  }
]
```

### Tool-implementationer

```javascript
// tools.js
export async function executeTool(name, input, env, instans_id) {
  switch (name) {

    case 'search_poi_database': {
      // Bygg dynamisk D1-query utifrån vad Claude skickar
      let query = `SELECT * FROM poi WHERE instans_id = ? AND aktiv = 1`;
      const params = [instans_id];

      if (input.sasong) {
        query += ` AND EXISTS (SELECT 1 FROM json_each(sasong) WHERE value = ?)`;
        params.push(input.sasong);
      }
      if (input.lamplig_for) {
        query += ` AND lamplig_for LIKE ?`;
        params.push(`%${input.lamplig_for}%`);
      }
      if (input.svarighetsgrad) {
        query += ` AND svarighetsgrad = ?`;
        params.push(input.svarighetsgrad);
      }
      if (input.fritext) {
        const q = `%${input.fritext}%`;
        query += ` AND (json_extract(namn,'$.sv') LIKE ? OR taggar LIKE ?)`;
        params.push(q, q);
      }
      query += ` ORDER BY avstand_fran_lodge_km ASC LIMIT 10`;

      const { results } = await env.DB.prepare(query).bind(...params).all();
      return JSON.stringify(results);
    }

    case 'get_weather': {
      const res = await fetch(
        'https://api.met.no/weatherapi/locationforecast/2.0/compact' +
        '?lat=68.356&lon=18.823',
        { headers: { 'User-Agent': 'waylo/1.0 info@arcticlodge.nu' } }
      );
      const data = await res.json();
      const now = data.properties.timeseries[0].data.instant.details;
      return JSON.stringify({
        temperatur: now.air_temperature,
        vind_ms: now.wind_speed,
        vindby_ms: now.wind_speed_of_gust
      });
    }
  }
}
```

### System-prompt (bas)

```
Du är turistguide och assistent för {instans.namn} i {instans.område}.

AKTUELL SÄSONG: {aktuell_sasong} ({datum})
SPRÅK: Svara på {sprak} om inte gästen skriver på annat språk.

Du har tillgång till en lokal databas med sevärdheter och aktiviteter,
samt möjlighet att söka på internet för aktuell information.

HOTELLETS UNIKA FÖRDELAR (nämn när relevant):
- Ski-in/ski-out för topptur — fjällterräng direkt från dörren
- Snöskoteruppställning direkt vid entrén
- Självhushåll — egna lägenheter med kök, billigare för grupper
- 500m till nattåget Stockholm–Narvik

Regler:
- Sök alltid i databasen innan du svarar på frågor om aktiviteter
- Boka aldrig rum eller lova priser — hänvisa till receptionen
- Om du inte vet, säg det och hänvisa till personal
- Håll svar kortfattade (3-5 meningar) men lägg gärna till ett
  oväntat tips som gästen inte frågat om
- Nämn gärna att det finns aktiviteter för andra säsonger också
```

---

## Kartlösning

### Tile-hantering (`worker/src/tiles.js`)

```javascript
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const match = url.pathname.match(/\/tiles\/(\d+)\/(\d+)\/(\d+)\.png/);
    if (!match) return new Response('Not found', { status: 404 });

    const [_, z, x, y] = match;

    // Kolla KV-cache först
    const cacheKey = `tile:${z}:${x}:${y}`;
    const cached = await env.CACHE.get(cacheKey, 'arrayBuffer');
    if (cached) {
      return new Response(cached, {
        headers: {
          'Content-Type': 'image/png',
          'Access-Control-Allow-Origin': '*',
          'X-Cache': 'HIT'
        }
      });
    }

    // Hämta från Lantmäteriet
    const lmUrl = `https://maps.lantmateriet.se/open/topowebb-ccby/v1/wmts` +
      `?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0` +
      `&LAYER=topowebb&STYLE=default&TILEMATRIXSET=3857` +
      `&TILEMATRIX=${z}&TILEROW=${y}&TILECOL=${x}&FORMAT=image/png`;

    const response = await fetch(lmUrl);
    if (!response.ok) return new Response('Tile not found', { status: 404 });

    const buffer = await response.arrayBuffer();

    // Spara i KV-cache 24h
    await env.CACHE.put(cacheKey, buffer, { expirationTtl: 86400 });

    return new Response(buffer, {
      headers: {
        'Content-Type': 'image/png',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=86400',
        'X-Cache': 'MISS'
      }
    });
  }
}

// Tjänsten kräver inloggning med Lantmäteriet-konto (HTTP Basic).
// TileMatrixSet 3857 är GoogleMapsCompatible, zoom 0-15, så Leaflets
// z/x/y går rakt in. Avgiftsfriheten utgår 2026-12-31.
```

### Leaflet-config i frontend

```javascript
L.tileLayer('/tiles/{z}/{x}/{y}.png', {
  attribution: '© Lantmäteriet CC BY',
  maxZoom: 15
}).addTo(map);
```

---

## Instans-config (Arctic Lodge)

```javascript
// frontend/src/config/arctic-lodge.js
export const config = {
  instans_id: 'arctic-lodge',
  namn: 'Arctic Lodge Katterjokk',
  omrade: 'Katterjokk, Riksgränsen, norra svenska Lappland',
  center: { lat: 68.356, lng: 18.823 },
  zoom: 12,
  sprak: ['sv', 'en', 'no'],

  // Arktisk säsong-logik — lång vinter, kort sommar
  sommar_manader: [6, 7, 8, 9],

  kontakt: {
    reception: 'info@arcticlodge.nu',
    telefon: '+46-XXX-XXX XX XX',
    bokning_url: 'https://arcticlodge.nu/boka'
  },

  // Cloudflare-endpoints
  api_url: 'https://api.arcticlodge.nu',
  tiles_url: 'https://tiles.arcticlodge.nu'
}
```

---

## Ny instans (framtida)

```bash
# 1. Ny D1-databas
wrangler d1 create waylo-riksgransenturism

# 2. Kör samma schema
wrangler d1 migrations apply DB --remote

# 3. Ny seed-fil med lokala POI:er
wrangler d1 execute waylo-riksgransenturism --file=schema/seed-riksgransenturism.sql

# 4. Ny Worker med ny wrangler.toml (annan D1-binding)
# 5. Ny config-fil i frontend/src/config/
```

Samma kodbas, ny config + ny databas = ny instans.

---

## Viktiga konventioner

- Aldrig API-nycklar i kod — alltid Cloudflare env vars (Dashboard → Workers → Settings)
- Aldrig full bild-URL i databasen — alltid `storage_id` (R2-nyckel)
- Alltid `instans_id` i D1-queries — aldrig globala queries utan filter
- Flerspråkigt från dag ett — JSON-strängar med minst `sv` och `en`
- SQLite-syntax i schema — ingen PostgreSQL-specifik syntax
- `ON DELETE CASCADE` på alla `poi_*`-tabeller
- Väder-API: yr.no (api.met.no) — gratis, ingen nyckel, täcker Skandinavien
- Webbsökning är Anthropics server tool — källhänvisningarna MÅSTE visas för gästen
