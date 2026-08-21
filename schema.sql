-- ============================================================
--  TURISTCHATBOT — POI-databas
--  Cloudflare D1 (SQLite) — kompatibel syntax
--  Kör: wrangler d1 execute turistbot --file=schema/schema.sql
-- ============================================================


-- ============================================================
-- 1. INSTANSER — en rad per område/kund
-- ============================================================
CREATE TABLE IF NOT EXISTS instanser (
  id            TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  slug          TEXT UNIQUE NOT NULL,
  namn          TEXT NOT NULL,
  beskrivning   TEXT,
  center_lat    REAL,
  center_lng    REAL,
  zoom_default  INTEGER DEFAULT 12,
  sprak         TEXT DEFAULT '["sv","en"]',   -- JSON: ["sv","en","no"]
  aktiv         INTEGER DEFAULT 1,            -- 0/1 (SQLite har ingen boolean)
  skapad_at     TEXT DEFAULT (datetime('now'))
);


-- ============================================================
-- 2. KATEGORIER — hierarkiska, flerspråkiga
-- ============================================================
CREATE TABLE IF NOT EXISTS kategorier (
  id            TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  instans_id    TEXT REFERENCES instanser(id),  -- NULL = global
  slug          TEXT NOT NULL,
  namn          TEXT NOT NULL,   -- JSON: {"sv":"Vandring","en":"Hiking","no":"Fotturer"}
  ikon          TEXT,            -- emoji: '🥾'
  parent_id     TEXT REFERENCES kategorier(id),
  sortering     INTEGER DEFAULT 0
);

-- Globala kategorier (delas av alla instanser)
INSERT OR IGNORE INTO kategorier (id, slug, namn, ikon) VALUES
  ('kat-vandring',    'vandring',    '{"sv":"Vandring","en":"Hiking","no":"Fotturer"}',              '🥾'),
  ('kat-skidor',      'skidor',      '{"sv":"Skidåkning","en":"Skiing","no":"Skiing"}',               '⛷️'),
  ('kat-topptur',     'topptur',     '{"sv":"Topptur","en":"Ski touring","no":"Topptur"}',            '🎿'),
  ('kat-mtb',         'mtb',         '{"sv":"MTB","en":"Mountain biking","no":"Terrengsykling"}',     '🚵'),
  ('kat-kultur',      'kultur',      '{"sv":"Kultur & historia","en":"Culture","no":"Kultur"}',       '🏛️'),
  ('kat-mat',         'mat',         '{"sv":"Mat & dryck","en":"Food & drink","no":"Mat"}',           '🍽️'),
  ('kat-barn',        'barnvanligt', '{"sv":"Barnvänligt","en":"Family friendly","no":"Familievennlig"}', '👨‍👩‍👧‍👦'),
  ('kat-utsikt',      'utsikt',      '{"sv":"Utsiktsplats","en":"Viewpoint","no":"Utsiktspunkt"}',   '👁️'),
  ('kat-fjalltopp',   'fjalltopp',   '{"sv":"Fjälltopp","en":"Mountain summit","no":"Fjelltopp"}',   '⛰️'),
  ('kat-vatten',      'vatten',      '{"sv":"Sjöar & vatten","en":"Lakes & water","no":"Vann"}',     '💧'),
  ('kat-snoter',      'snoter',      '{"sv":"Snöskoter","en":"Snowmobile","no":"Snøscooter"}',       '🛷');


-- ============================================================
-- 3. POI — hjärtat i databasen
-- ============================================================
CREATE TABLE IF NOT EXISTS poi (
  id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  instans_id      TEXT NOT NULL REFERENCES instanser(id),
  slug            TEXT NOT NULL,

  -- Flerspråkigt innehåll (JSON-strängar)
  namn            TEXT NOT NULL,         -- {"sv":"Kungsleden","en":"Kungsleden"}
  kortbeskrivning TEXT,                  -- En mening — visas i listor
  beskrivning     TEXT,                  -- Lång text — detaljsida + chatbot
  praktisk_info   TEXT,                  -- Parkering, toaletter, transport (JSON)
  tips            TEXT,                  -- Insidertips (JSON)

  -- Klassificering
  kategori_ids    TEXT DEFAULT '[]',     -- JSON: ["kat-vandring","kat-barn"]
  taggar          TEXT DEFAULT '[]',     -- JSON: ["midnattssol","utsikt","hund-ok"]
  sasong          TEXT DEFAULT '[]',     -- JSON: ["sommar"] eller ["sommar","vinter"]

  -- Svårighetsgrad & lämplighet
  svarighetsgrad  TEXT,                  -- 'lätt','medel','svår','expert'
  lamplig_alder   TEXT,                  -- JSON: {"min":5,"max":null,"notering":"bra för barn"}
  lamplig_for     TEXT DEFAULT '[]',     -- JSON: ["familj","senior","erfaren","nybörjare"]
  tillganglighet  TEXT,                  -- 'rullstol','barnvagn','inga begränsningar'

  -- Geografi
  lat             REAL,
  lng             REAL,

  -- Avstånd & logistik
  avstand_fran_lodge_km  REAL,
  restid_min             INTEGER,
  transport              TEXT DEFAULT '[]',  -- JSON: ["bil","till fots","buss"]

  -- Fysiska mått
  langd_km        REAL,
  hojdskillnad_m  INTEGER,
  hojdpunkt_m     INTEGER,

  -- Media (hanteras via poi_media)
  omslagsbild_id  TEXT,                  -- FK till poi_media.id

  -- Externa länkar
  extern_url      TEXT,
  extern_karta    TEXT,

  -- Status
  aktiv           INTEGER DEFAULT 1,
  verifierad      INTEGER DEFAULT 0,
  skapad_at       TEXT DEFAULT (datetime('now')),
  uppdaterad_at   TEXT DEFAULT (datetime('now')),

  UNIQUE(instans_id, slug)
);

-- Index för vanliga chatbot-queries
CREATE INDEX IF NOT EXISTS idx_poi_instans ON poi(instans_id, aktiv);
CREATE INDEX IF NOT EXISTS idx_poi_svarighetsgrad ON poi(svarighetsgrad);


-- ============================================================
-- 4. POI_PUNKTER — enstaka GPS-punkter per POI
-- ============================================================
CREATE TABLE IF NOT EXISTS poi_punkter (
  id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  poi_id      TEXT NOT NULL REFERENCES poi(id) ON DELETE CASCADE,
  typ         TEXT NOT NULL,   -- 'start','slut','parkering','topp','vändpunkt','fara'
  namn        TEXT,            -- JSON: {"sv":"Parkeringen vid Riksgränsen"}
  lat         REAL NOT NULL,
  lng         REAL NOT NULL,
  hojd_m      INTEGER,
  notering    TEXT,
  sortering   INTEGER DEFAULT 0
);


-- ============================================================
-- 5. POI_MEDIA — bilder, GPX, video, dokument
-- ============================================================
CREATE TABLE IF NOT EXISTS poi_media (
  id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  poi_id          TEXT NOT NULL REFERENCES poi(id) ON DELETE CASCADE,

  -- Typ: 'bild','gpx','video','dokument','360'
  typ             TEXT NOT NULL,

  -- Lagring: storage_id = R2-nyckel, bygg URL i kod
  -- Mönster: https://media.arcticlodge.nu/{storage_id}
  storage_id      TEXT,   -- för R2-filer
  extern_url      TEXT,   -- för YouTube/externa kartor

  -- Metadata
  namn            TEXT,   -- JSON: {"sv":"Utsikt från toppen","en":"Summit view"}
  alt_text        TEXT,   -- JSON: tillgänglighet
  caption         TEXT,   -- JSON: bildtext
  fotograf        TEXT,
  licens          TEXT,   -- 'CC-BY','egen','köpt'

  -- Teknisk info
  filnamn         TEXT,
  filstorlek_kb   INTEGER,
  bredd_px        INTEGER,
  hojd_px         INTEGER,
  mime_type       TEXT,

  -- GPX-specifikt
  gpx_typ         TEXT,            -- 'tur-retur','rund','enkel'
  gpx_langd_km    REAL,
  gpx_hojdskillnad_m INTEGER,
  gpx_sasong      TEXT DEFAULT '[]',  -- JSON

  -- Visning
  sortering       INTEGER DEFAULT 0,
  visa_i_lista    INTEGER DEFAULT 0,  -- 1 = visas som thumbnail
  aktiv           INTEGER DEFAULT 1,

  skapad_at       TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_media_poi ON poi_media(poi_id, typ);


-- ============================================================
-- 6. POI_OPPETTIDER
-- ============================================================
CREATE TABLE IF NOT EXISTS poi_oppettider (
  id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  poi_id      TEXT NOT NULL REFERENCES poi(id) ON DELETE CASCADE,
  sasong      TEXT,        -- 'sommar','vinter', NULL = alltid
  manad_fran  INTEGER,     -- 1-12
  manad_till  INTEGER,
  info        TEXT,        -- JSON: {"sv":"Öppet dygnet runt","en":"Open 24/7"}
  pris        TEXT         -- JSON: {"sv":"Gratis","SEK":0}
);


-- ============================================================
-- 7. POI_KOMMENTARER (avstängt från start — aktiv=0)
-- ============================================================
CREATE TABLE IF NOT EXISTS poi_kommentarer (
  id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  poi_id      TEXT NOT NULL REFERENCES poi(id) ON DELETE CASCADE,
  instans_id  TEXT REFERENCES instanser(id),
  namn        TEXT,
  text        TEXT NOT NULL,
  betyg       INTEGER CHECK (betyg BETWEEN 1 AND 5),
  godkand     INTEGER DEFAULT 0,
  skapad_at   TEXT DEFAULT (datetime('now'))
);


-- ============================================================
-- 8. CHATT_LOGG — analysera vad gäster frågar om
-- ============================================================
CREATE TABLE IF NOT EXISTS chatt_logg (
  id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  instans_id      TEXT REFERENCES instanser(id),
  session_id      TEXT,
  fraga           TEXT NOT NULL,
  svar            TEXT,
  poi_ids_visade  TEXT DEFAULT '[]',  -- JSON: ["poi-id-1","poi-id-2"]
  sprak           TEXT DEFAULT 'sv',
  skapad_at       TEXT DEFAULT (datetime('now'))
);


-- ============================================================
-- SEED — Arctic Lodge (första instansen)
-- ============================================================
INSERT OR IGNORE INTO instanser (id, slug, namn, beskrivning, center_lat, center_lng, sprak)
VALUES (
  'inst-arctic-lodge',
  'arctic-lodge',
  'Arctic Lodge Katterjokk',
  'Självhushållshotell vid Kungsleden och Riksgränsen i svenska Lappland. ' ||
  'Ski-in/ski-out för topptur, snöskoteruppställning vid entrén, ' ||
  '500m till nattåget Stockholm–Narvik.',
  68.3567, 18.8234,
  '["sv","en","no"]'
);

-- Exempel-POI: Kungsleden
INSERT OR IGNORE INTO poi (
  id, instans_id, slug,
  namn, kortbeskrivning, beskrivning, tips,
  kategori_ids, taggar, sasong,
  svarighetsgrad, lamplig_alder, lamplig_for,
  lat, lng,
  avstand_fran_lodge_km, restid_min, transport,
  langd_km, hojdskillnad_m
) VALUES (
  'poi-kungsleden',
  'inst-arctic-lodge',
  'kungsleden-start',
  '{"sv":"Kungsleden","en":"Kungsleden Trail","no":"Kungsleden"}',
  '{"sv":"Sveriges mest kända vandringsled — startpunkt 500m från lodget","en":"Sweden''s most famous hiking trail, 500m from the lodge"}',
  '{"sv":"Kungsleden sträcker sig 440 km från Abisko i norr till Hemavan i söder. Från Arctic Lodge når du startpunkten på under en timme med tåg, eller vandrar direkt norrut längs leden. Terrängen varierar från fjällplatåer till dalgångar med enorm vildmarkskänsla.","en":"The Kungsleden stretches 440km from Abisko to Hemavan. From Arctic Lodge you reach the trailhead by train in under an hour, or head north directly."}',
  '{"sv":"Starta tidigt för bäst ljus och färre människor. Ta med myggnät juni–juli. Fjällstationen i Abisko har café och utrustning.","en":"Start early for best light. Bring mosquito net June–July."}',
  '["kat-vandring","kat-barn"]',
  '["kungsleden","UNESCO","vildmark","fjäll","midnattssol","familj"]',
  '["sommar"]',
  'medel',
  '{"min":10,"max":null,"notering":"Kortare dagsetapper passar familjer med barn från ca 10 år"}',
  '["familj","nybörjare","erfaren"]',
  68.3567, 18.7730,
  0.5, 5, '["till fots","tåg"]',
  440.0, 1200
);

-- Exempel-POI: Topptur Riksgränsen
INSERT OR IGNORE INTO poi (
  id, instans_id, slug,
  namn, kortbeskrivning, beskrivning, tips,
  kategori_ids, taggar, sasong,
  svarighetsgrad, lamplig_alder, lamplig_for,
  lat, lng,
  avstand_fran_lodge_km, restid_min, transport,
  langd_km, hojdskillnad_m, hojdpunkt_m
) VALUES (
  'poi-riksgransen-topp',
  'inst-arctic-lodge',
  'riksgransentopp-topptur',
  '{"sv":"Riksgränsen — topptur","en":"Riksgränsen ski touring","no":"Riksgrensen topptur"}',
  '{"sv":"Klassisk topptur direkt från lodgets dörr — ski-in/ski-out på riktigt","en":"Classic ski tour directly from the lodge door — true ski-in/ski-out"}',
  '{"sv":"En av de mest tillgängliga topptursupplevelserna i Sverige. Fjällterrängen börjar bokstavligen vid lodgets ytterdörr — ingen bil, ingen parkering. Följ ryggen norrut, njut av utsikten mot Norge och Torneträsk. Perfekt för första toppturen.","en":"One of the most accessible ski touring experiences in Sweden. Mountain terrain starts literally at the lodge front door."}',
  '{"sv":"Bäst i mars–maj när dagarna är långa och snön fortfarande bär. Kontrollera lavinprognos på lavinprognoser.se. Tag med kompass — dimma kan komma snabbt.","en":"Best March–May. Check avalanche forecast. Bring compass."}',
  '["kat-topptur","kat-skidor","kat-fjalltopp"]',
  '["topptur","ski-in-ski-out","lavin","vinter","utsikt","norge"]',
  '["vinter"]',
  'medel',
  '{"min":16,"max":null,"notering":"Kräver grundläggande skidvana och lavinkunskap"}',
  '["erfaren","nybörjare"]',
  68.430, 18.120,
  2.0, 30, '["till fots"]',
  12.0, 750, 909
);
