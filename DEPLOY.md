# Deploy — WayLo

Allt körs i Cloudflare: D1 (databas), R2 (media), KV (cache), Workers
(API + tiles) och Pages (frontend).

Det finns två vägar: helt via dashboarden och GitHub, eller från din
egen maskin med Wrangler. Den första kräver ingenting installerat.

## Deploy helt från webbläsaren (rekommenderas)

Inget lokalt behövs — allt görs i Cloudflares dashboard, och koden
kommer från GitHub. Databasen migrerar sig själv vid varje deploy.

### 1. Skapa resurserna i dashboarden

| Vad | Var | Namn |
|---|---|---|
| D1-databas | Storage & Databases → D1 → Create | `waylo` |
| KV-namespace | Storage & Databases → KV → Create | `waylo-cache` |
| R2-bucket | R2 → Create bucket | `waylo-media` |

Kopiera **Database ID** från D1-databasen och **Namespace ID** från KV.
De är identifierare, inte hemligheter — de hör hemma i `wrangler.toml`.

### 2. Lägg in id:na i repot

Redigera direkt i GitHubs webbeditor:

- `workers/api/wrangler.toml` → `database_id` och `id` (KV)
- `workers/tile-proxy/wrangler.toml` → `id` (samma KV)

Commita. Bygget kan inte hitta databasen förrän det här är gjort.

### 3. Koppla projekten

| Projekt | Typ | Root directory | Build watch path |
|---|---|---|---|
| `waylo` | Worker | `workers/api` | `workers/api/*` |
| `waylo-tiles` | Worker | `workers/tile-proxy` | `workers/tile-proxy/*` |
| `waylo-web` | Pages | `frontend` | `frontend/*` |

Cloudflare plockar upp `deploy`-scriptet ur `package.json` automatiskt.
För api-workern är det:

```
wrangler d1 migrations apply DB --remote && wrangler deploy
```

Migreringarna körs alltså före varje deploy. De är numrerade och spåras
i tabellen `d1_migrations`, så varje migrering körs exakt en gång —
andra bygget är en no-op. Nya tabeller i framtiden lägger du till som
`schema/migrations/0002_*.sql` och de applicerar sig själva vid nästa
push. Pages behöver build-kommando `npm run build` och output `dist`.

### 4. Lägg in API-nyckeln

`waylo` → Settings → Variables and Secrets → Add → **Secret**:
`ANTHROPIC_API_KEY`. Det är den enda nyckeln.

### 5. Seeda instansdatan — en gång

Migreringarna skapar tabellerna men lägger inte in någon data. Seeden
är instansspecifik (Arctic Lodges POI:er), så den ska inte köras
automatiskt för varje ny databas.

Migreringarna skapar tabellerna automatiskt vid deploy. Har bygget inte
gått igenom än kan du skapa dem direkt i konsolen istället — D1 →
`waylo` → **Console** i dashboarden:

1. Klistra in **`schema/console/0001_schema.console.sql`** — skapar de
   nio tabellerna och de globala kategorierna.
2. Klistra in **`schema/console/seed-arctic-lodge.console.sql`** —
   instansen och dess POI:er.

Båda är idempotenta (`CREATE TABLE IF NOT EXISTS` och
`INSERT OR IGNORE`), så det gör ingen skada att köra dem två gånger.
Kör du schemat för hand vet inte `d1_migrations` om det — nästa bygge
applicerar migreringen ändå, konstaterar att allt redan finns och
bokför den. Ingen konflikt.

> **Använd filerna i `schema/console/`, inte originalen.** D1-konsolen
> delar inklistrad SQL på semikolon och kör varje bit som en egen query.
> Bitar som bara innehåller kommentarer blir tomma och avvisas med
> *"Requests without any query are not supported"*. Filerna i
> `schema/console/` är samma SQL utan kommentarer, genererad med
> `./scripts/sql-for-console.py <fil>`. Får du ett enstaka sådant fel
> allra sist är det den tomma raden efter sista semikolonet — allt
> ovanför har körts.

### 6. Verifiera

Öppna `https://waylo.<ditt-konto>.workers.dev/health`. Den ska visa
`db_ok: true` och alla bindings som `true`.

## Alternativ: deploy från din egen maskin

### Förutsättningar

```bash
npx wrangler login                  # eller:
export CLOUDFLARE_API_TOKEN=...     # token med Workers/D1/R2/KV/Pages-rättigheter
export CLOUDFLARE_ACCOUNT_ID=...
```

Du behöver också:

- **ANTHROPIC_API_KEY** — console.anthropic.com

Det är den enda API-nyckeln som behövs. Webbsökningen är Claudes
inbyggda server tool ($10 per 1 000 sökningar, debiteras på samma
konto) och vädret kommer från yr.no som inte kräver nyckel.

### Skapa resurser och seeda databasen

```bash
./scripts/setup-cloudflare.sh
```

Scriptet är idempotent och gör följande:

1. `wrangler d1 create waylo` (hoppas över om den finns)
2. `wrangler kv namespace create waylo-cache`
3. `wrangler r2 bucket create waylo-media`
4. Skriver in `database_id` och KV-`id` i båda `wrangler.toml`
5. Kör migreringarna och `schema/seed-arctic-lodge.sql`

Vill du göra det för hand:

```bash
wrangler d1 create waylo
wrangler kv namespace create waylo-cache
wrangler r2 bucket create waylo-media
# klistra in id:n i workers/api/wrangler.toml och workers/tile-proxy/wrangler.toml
cd workers/api && wrangler d1 migrations apply DB --remote
wrangler d1 execute waylo --remote --file=schema/seed-arctic-lodge.sql
```

### Hemligheter

Aldrig i kod eller `wrangler.toml` — alltid som secrets:

```bash
cd workers/api
npx wrangler secret put ANTHROPIC_API_KEY
```

`LANTMATERIET_TOKEN` behövs först när den avgiftsfria tjänsten utgår
**2026-12-31**. Sätt då `WMTS_URL` i `workers/tile-proxy/wrangler.toml`
till den nya endpointen och lägg in token som secret — proxyn skickar den
automatiskt som `Authorization: Bearer`.

### Deploya

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

## Domäner

I Cloudflare-dashboarden, under Workers & Pages → respektive projekt →
Settings → Domains & Routes:

| Värdnamn | Pekar på |
|---|---|
| `api.arcticlodge.nu` | Worker `waylo` |
| `tiles.arcticlodge.nu` | Worker `waylo-tiles` |
| `chat.arcticlodge.nu` | Pages-projektet `waylo` |
| `media.arcticlodge.nu` | R2-bucketen `waylo-media` (Public bucket → Custom domain) |

Byter du domäner: uppdatera `ALLOWED_ORIGINS` och `MEDIA_BASE_URL` i
`workers/api/wrangler.toml` samt `api_url`/`tiles_url` i
`frontend/src/config/arctic-lodge.js`.

## WordPress

Lägg till detta via pluginet "Insert Headers and Footers" (eller i temats
footer). Ingen annan kod behövs i WordPress:

```html
<script src="https://chat.arcticlodge.nu/widget.js"></script>
<div id="waylo"></div>
```

Widgeten monterar sig själv i `#waylo`, tar med sin egen CSS och
pratar direkt med `api.arcticlodge.nu`.

## Ladda upp media till R2

Bilder och GPX-filer lagras med nyckelmönstret
`{instans_id}/{poi_slug}/{filnamn}`:

```bash
wrangler r2 object put \
  waylo-media/arctic-lodge/midnattssol-katterjokk/utsikt.jpg \
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
wrangler d1 create waylo-riksgransenturism
cd workers/api && wrangler d1 migrations apply DB --remote
wrangler d1 execute waylo-riksgransenturism --remote --file=schema/seed-riksgransenturism.sql

# 2. Kopiera workers/api/wrangler.toml → ny name, database_id och INSTANS_ID
# 3. Ny config-fil i frontend/src/config/
```

Samma kodbas, ny config + ny databas.

## Kostnad

Allt ryms i Cloudflares gratisnivå vid normal trafik: Workers 100k
requests/dygn, D1 5 GB, R2 10 GB, KV 100k läsningar/dygn. De rörliga
kostnaderna är Claude API-anropen, inklusive webbsökningarna ($10 per
1 000 sökningar).
