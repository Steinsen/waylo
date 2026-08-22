# Deploy — WayLo

Allt körs i Cloudflare: D1 (databas), R2 (media), KV (cache), Workers
(API + tiles) och Pages (frontend).

Det finns två vägar: helt via dashboarden och GitHub, eller från din
egen maskin med Wrangler. Den första kräver ingenting installerat.

## Deploy helt från webbläsaren

Inget lokalt behövs. **Ett** Cloudflare-projekt räcker — samma Worker
serverar sajten, API:t och kartrutorna.

### 1. Skapa resurserna i dashboarden

| Vad | Var | Namn |
|---|---|---|
| D1-databas | Storage & Databases → D1 → Create | `waylo` |
| KV-namespace | Storage & Databases → KV → Create | `waylo-cache` |
| R2-bucket | R2 → Create bucket | `waylo-media` |

Lägg in **Database ID** och **Namespace ID** i `wrangler.toml` i
repo-roten. De är identifierare, inte hemligheter.

### 2. Koppla repot

Workers & Pages → Create → Workers → Connect to Git. Välj repot.

**Root directory: repo-roten.** Inget att ställa in — `wrangler.toml`
och `package.json` ligger där. Cloudflare plockar upp deploy-scriptet:

```
wrangler d1 migrations apply DB --remote && wrangler deploy
```

Build-kommandot är `npm run build`, som bygger frontend till
`frontend/dist`. Migreringarna körs före varje deploy, spåras i
`d1_migrations` och appliceras exakt en gång var.

### 3. Lägg in API-nyckeln

`waylo` → Settings → Variables and Secrets → Add → **Secret**:
`ANTHROPIC_API_KEY`. Det är den enda nyckeln.

### 4. Seeda instansdatan — en gång

Migreringarna skapar tabellerna men lägger inte in någon data. Seeden
är instansspecifik, så den ska inte köras automatiskt för varje ny
databas. D1 → `waylo` → **Console**, klistra in
**`schema/console/seed-arctic-lodge.console.sql`**.

Har bygget inte gått igenom än kan du skapa tabellerna för hand först
med `schema/console/0001_schema.console.sql`. Båda är idempotenta, och
nästa bygge bokför migreringen utan att göra om något.

> **Använd filerna i `schema/console/`, inte originalen.** D1-konsolen
> delar inklistrad SQL på semikolon och kör varje bit som en egen query.
> Bitar som bara innehåller kommentarer avvisas med *"Requests without
> any query are not supported"*. Filerna i `schema/console/` är samma
> SQL utan kommentarer, genererad med `./scripts/sql-for-console.py`.

### 5. Verifiera

Öppna `https://waylo.<ditt-konto>.workers.dev/` — sajten ska ladda med
karta och chatt. Sen `/health`, som ska visa `db_ok: true` och alla fem
bindings som `true`.

## Alternativ: deploy från din egen maskin

```bash
npx wrangler login
npm install
npm run deploy       # migrerar och deployar
npm run db:seed      # en gång, för instansdatan
```

## Domäner

I Cloudflare-dashboarden, under Workers & Pages → respektive projekt →
Settings → Domains & Routes:

| Värdnamn | Pekar på |
|---|---|
| `api.arcticlodge.nu` | Worker `waylo` |
| `chat.arcticlodge.nu` | Pages-projektet `waylo` |
| `media.arcticlodge.nu` | R2-bucketen `waylo-media` (Public bucket → Custom domain) |

Byter du domäner: uppdatera `ALLOWED_ORIGINS` och `MEDIA_BASE_URL` i
`wrangler.toml`. Frontend behöver inget — den använder relativa vägar
mot sitt eget origin. Undantaget är widgeten, som byggs med
`VITE_API_URL` satt till workerns adress.

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
wrangler d1 migrations apply DB --remote
wrangler d1 execute waylo-riksgransenturism --remote --file=schema/seed-riksgransenturism.sql

# 2. Kopiera wrangler.toml → ny name, database_id och INSTANS_ID
# 3. Ny config-fil i frontend/src/config/
```

Samma kodbas, ny config + ny databas.

## Kostnad

Allt ryms i Cloudflares gratisnivå vid normal trafik: Workers 100k
requests/dygn, D1 5 GB, R2 10 GB, KV 100k läsningar/dygn. De rörliga
kostnaderna är Claude API-anropen, inklusive webbsökningarna ($10 per
1 000 sökningar).
