# WayLo — Your Local Guide

AI-driven lokalguide byggd helt på Cloudflare. Första instansen är
**Arctic Lodge Katterjokk** (arcticlodge.nu). Ny config + ny databas =
ny instans för vilket område som helst.

Se [`CLAUDE.md`](CLAUDE.md) för arkitekturbeslut och
[`DEPLOY.md`](DEPLOY.md) för hur du sätter upp och deployar.

## Struktur

```
schema/
  migrations/
    0001_schema.sql       D1-schema — körs av deploy-scriptet, en gång
  seed-arctic-lodge.sql   Instans + POI:er för Arctic Lodge
workers/
  api/                    Chatbot-API + D1-queries
    src/index.js          Routing
    src/chat.js           Claude tool use-loop, SSE-streaming
    src/tools.js          search_poi_database / get_weather + Claude web search
    src/poi.js            D1-queries
    src/config.js         Instanskonfig + systemprompt + säsongslogik
  tile-proxy/             Proxar Lantmäteriets WMTS-tiles med cache
frontend/
  src/App.jsx             Fristående sajt: karta + chatt
  src/widget.jsx          Inbäddningsbar widget (dist/widget.js)
  src/components/Map.jsx  Leaflet + Lantmäteriet
  src/components/Chat.jsx Chattwidget med SSE
  src/config/arctic-lodge.js
scripts/
  setup-cloudflare.sh     Skapar D1 + KV + R2, kör schema och seed
  deploy.sh               Deployar workers och Pages
```

## Snabbstart

```bash
./scripts/setup-cloudflare.sh          # skapar resurser + seedar databasen
cd workers/api
npx wrangler secret put ANTHROPIC_API_KEY
cd ../.. && ./scripts/deploy.sh        # deployar allt
```

## API

| Metod | Väg | Beskrivning |
|---|---|---|
| GET | `/health` | Status + vilka bindings som finns |
| GET | `/instans` | Instanskonfiguration och aktuell säsong |
| GET | `/poi` | POI:er för kartan. Filter: `sasong`, `kategori`, `lamplig_for`, `svarighetsgrad`, `fritext` |
| GET | `/poi/:slug` | Full POI med GPS-punkter, media och öppettider |
| GET | `/kategorier` | Kategorier för filtrering |
| POST | `/chat` | Chatbot. Strömmar SSE; `{"stream": false}` ger JSON |

`POST /chat` tar `{ fraga, historik?, sprak?, session_id?, stream? }` och
strömmar händelser: `text` (textdelta), `verktyg` (verktyg körs),
`poi` (POI-id:n att markera på kartan), `kallor` (källhänvisningar från
webbsökning — måste visas för gästen), `klar`, `fel`.

## Lokal utveckling

```bash
# 1. Lokal D1
cd workers/api && npm install
npm run db:migrate:local && npm run db:seed:local
cp .dev.vars.example .dev.vars      # lägg in din API-nyckel
npm run dev

# 2. Frontend mot den lokala workern
cd ../../frontend && npm install
VITE_API_URL=http://127.0.0.1:8787 npm run dev
```
