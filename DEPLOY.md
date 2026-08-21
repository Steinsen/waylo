# Deploy — WayLo

Allt körs i Cloudflare: D1 (databas), R2 (media), KV (cache), Workers
(API + tiles) och Pages (frontend).

> **Obs:** stegen nedan kräver ett inloggat Cloudflare-konto. Koden i
> repot är testad lokalt mot Wrangler (lokal D1, lokal KV), men själva
> resurserna måste skapas med dina egna Cloudflare-uppgifter.

## Förutsättningar

```bash
npx wrangler login                  # eller:
export CLOUDFLARE_API_TOKEN=...     # token med Workers/D1/R2/KV/Pages-rättigheter
export CLOUDFLARE_ACCOUNT_ID=...
```

Du behöver också:

- **ANTHROPIC_API_KEY** — console.anthropic.com
- **BRAVE_API_KEY** — brave.com/search/api (fri nivå räcker till att börja)

## Steg 1 — Skapa resurser och seeda databasen

```bash
./scripts/setup-cloudflare.sh
```

Scriptet är idempotent och gör följande:

1. `wrangler d1 create turistbot` (hoppas över om den finns)
2. `wrangler kv namespace create turistbot-cache`
3. `wrangler r2 bucket create turistbot-media`
4. Skriver in `database_id` och KV-`id` i båda `wrangler.toml`
5. Kör `schema/schema.sql` och `schema/seed-arctic-lodge.sql`

Vill du göra det för hand:

```bash
wrangler d1 create turistbot
wrangler kv namespace create turistbot-cache
wrangler r2 bucket create turistbot-media
# klistra in id:n i workers/api/wrangler.toml och workers/tile-proxy/wrangler.toml
wrangler d1 execute turistbot --remote --file=schema/schema.sql
wrangler d1 execute turistbot --remote --file=schema/seed-arctic-lodge.sql
```

## Steg 2 — Hemligheter

Aldrig i kod eller `wrangler.toml` — alltid som secrets:

```bash
cd workers/api
npx wrangler secret put ANTHROPIC_API_KEY
npx wrangler secret put BRAVE_API_KEY
```

`LANTMATERIET_TOKEN` behövs först när den avgiftsfria tjänsten utgår
**2026-12-31**. Sätt då `WMTS_URL` i `workers/tile-proxy/wrangler.toml`
till den nya endpointen och lägg in token som secret — proxyn skickar den
automatiskt som `Authorization: Bearer`.

## Steg 3 — Deploya

```bash
./scripts/deploy.sh            # allt
./scripts/deploy.sh api        # bara API-workern
./scripts/deploy.sh tiles      # bara tile-proxyn
./scripts/deploy.sh frontend   # bara Pages
```

Verifiera:

```bash
curl https://api.arcticlodge.nu/health
curl https://api.arcticlodge.nu/poi | head
curl -N -X POST https://api.arcticlodge.nu/chat \
  -H 'Content-Type: application/json' \
  -d '{"fraga":"Vad kan vi göra med barnen i sommar?"}'
```

`/health` visar vilka bindings och nycklar som är på plats — börja alltid
felsökningen där.

## Steg 4 — Domäner

I Cloudflare-dashboarden, under Workers & Pages → respektive projekt →
Settings → Domains & Routes:

| Värdnamn | Pekar på |
|---|---|
| `api.arcticlodge.nu` | Worker `turistbot-api` |
| `tiles.arcticlodge.nu` | Worker `turistbot-tiles` |
| `chat.arcticlodge.nu` | Pages-projektet `turistbot` |
| `media.arcticlodge.nu` | R2-bucketen `turistbot-media` (Public bucket → Custom domain) |

Byter du domäner: uppdatera `ALLOWED_ORIGINS` och `MEDIA_BASE_URL` i
`workers/api/wrangler.toml` samt `api_url`/`tiles_url` i
`frontend/src/config/arctic-lodge.js`.

## Steg 5 — WordPress

Lägg till detta via pluginet "Insert Headers and Footers" (eller i temats
footer). Ingen annan kod behövs i WordPress:

```html
<script src="https://chat.arcticlodge.nu/widget.js"></script>
<div id="turistbot"></div>
```

Widgeten monterar sig själv i `#turistbot`, tar med sin egen CSS och
pratar direkt med `api.arcticlodge.nu`.

## Ladda upp media till R2

Bilder och GPX-filer lagras med nyckelmönstret
`{instans_id}/{poi_slug}/{filnamn}`:

```bash
wrangler r2 object put \
  turistbot-media/arctic-lodge/midnattssol-katterjokk/utsikt.jpg \
  --file=./utsikt.jpg --content-type=image/jpeg
```

Registrera sedan filen i databasen — spara **bara** `storage_id`, aldrig
full URL (URL:en byggs i koden från `MEDIA_BASE_URL`):

```sql
INSERT INTO poi_media (poi_id, typ, storage_id, namn, visa_i_lista)
VALUES ('poi-midnattssol-katterjokk', 'bild',
        'arctic-lodge/midnattssol-katterjokk/utsikt.jpg',
        '{"sv":"Utsikt mot norr","en":"View to the north"}', 1);
```

## Ny instans

```bash
# 1. Ny databas + schema + egen seed-fil
wrangler d1 create turistbot-riksgransenturism
wrangler d1 execute turistbot-riksgransenturism --remote --file=schema/schema.sql
wrangler d1 execute turistbot-riksgransenturism --remote --file=schema/seed-riksgransenturism.sql

# 2. Kopiera workers/api/wrangler.toml → ny name, database_id och INSTANS_ID
# 3. Ny config-fil i frontend/src/config/
```

Samma kodbas, ny config + ny databas.

## Kostnad

Allt ryms i Cloudflares gratisnivå vid normal trafik: Workers 100k
requests/dygn, D1 5 GB, R2 10 GB, KV 100k läsningar/dygn. De rörliga
kostnaderna är Claude API-anropen och Brave Search.
