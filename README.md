# WayLo — Your Local Guide

AI-driven lokalguide byggd helt på Cloudflare. Första instansen är
**Arctic Lodge Katterjokk** (arcticlodge.nu). Ny config + ny databas =
ny instans för vilket område som helst.

Se [`CLAUDE.md`](CLAUDE.md) för arkitekturbeslut och
[`DEPLOY.md`](DEPLOY.md) för hur du sätter upp och deployar.

## Struktur

En enda Cloudflare Worker serverar allt: den byggda React-appen som
statiska assets, chatbot-API:t och kartrutorna.

```
wrangler.toml             Workerns config — allt i ett projekt
worker/src/
  index.js                Routing: API-vägar, tiles, resten till ASSETS
  chat.js                 Claude tool use-loop, SSE-streaming
  tools.js                search_poi_database / get_weather + web search
  poi.js                  D1-queries
  config.js               Instanskonfig, systemprompt, säsongslogik
  tiles.js                Kartrutor: Lantmäteriet och Kartverket
  geo.js                  Avgör vilken karttjänst en ruta hör till
  sverige.js              Sverigepolygon från OSM (genererad)
schema/
  migrations/
    0001_schema.sql       Körs av deploy-scriptet, en gång
  seed-arctic-lodge.sql   Instans + POI:er för Arctic Lodge
  console/                Samma SQL utan kommentarer, för D1-konsolen
data/
  sweden-osm.geojson      Sveriges gräns, OSM-relation 52822
frontend/
  src/App.jsx             Karta + chatt, flikar på mobil
  src/widget.jsx          Inbäddningsbar widget (dist/widget.js)
  src/components/         Map.jsx, Chat.jsx
scripts/
  sql-for-console.py      Genererar de kommentarsfria SQL-filerna
  generera-sverige.py     Bygger om sverige.js ur en gränskälla
  osm-till-geojson.py     Syr ihop Overpass-fragment till ringar
  smoke.mjs               Kontrollerar att varje route svarar rätt
```

## Snabbstart

```bash
npm install
npm run build          # bygger frontend till frontend/dist
npm run deploy         # migrerar databasen och deployar workern
```

## API

| Metod | Väg | Beskrivning |
|---|---|---|
| GET | `/health` | Status + vilka bindings som finns |
| GET | `/tiles/{z}/{x}/{y}.png` | Lantmäteriets kartrutor via cache |
| GET | `/instans` | Instanskonfiguration och aktuell säsong |
| GET | `/poi` | POI:er för kartan. Filter: `sasong`, `kategori`, `lamplig_for`, `svarighetsgrad`, `fritext` |
| GET | `/poi/:slug` | Full POI med GPS-punkter, media och öppettider |
| GET | `/kategorier` | Kategorier för filtrering |
| POST | `/chat` | Chatbot. Strömmar SSE; `{"stream": false}` ger JSON |

`POST /chat` tar `{ fraga, historik?, sprak?, session_id?, stream? }` och
strömmar händelser: `text` (textdelta), `verktyg` (verktyg körs),
`poi` (POI-id:n att markera på kartan), `kallor` (källhänvisningar från
webbsökning — måste visas för gästen), `klar`, `fel`.

Alla andra vägar serveras från `frontend/dist` — statiska filer direkt,
okända vägar som `index.html` så att klientsidans routing fungerar.

## Lokal utveckling

```bash
npm install
cp .dev.vars.example .dev.vars      # lägg in din API-nyckel
npm run db:migrate:local && npm run db:seed:local
npm run dev                         # bygger frontend och startar workern
```

Kontrollera att allt svarar, mot en lokal worker eller den deployade:

```bash
npm run smoke
node scripts/smoke.mjs https://waylo.<konto>.workers.dev
```

Sajt och API ligger på samma origin, så ingen CORS-konfiguration behövs
för utveckling. Widgeten är undantaget — den körs på arcticlodge.nu och
byggs med en absolut URL:

```bash
VITE_API_URL=https://waylo.<konto>.workers.dev \
  npm --prefix frontend run build:widget
```
