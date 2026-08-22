CREATE TABLE IF NOT EXISTS instanser (
  id            TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  slug          TEXT UNIQUE NOT NULL,
  namn          TEXT NOT NULL,
  beskrivning   TEXT,
  center_lat    REAL,
  center_lng    REAL,
  zoom_default  INTEGER DEFAULT 12,
  sprak         TEXT DEFAULT '["sv","en"]',
  aktiv         INTEGER DEFAULT 1,
  skapad_at     TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS kategorier (
  id            TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  instans_id    TEXT REFERENCES instanser(id),
  slug          TEXT NOT NULL,
  namn          TEXT NOT NULL,
  ikon          TEXT,
  parent_id     TEXT REFERENCES kategorier(id),
  sortering     INTEGER DEFAULT 0
);
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
CREATE TABLE IF NOT EXISTS poi (
  id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  instans_id      TEXT NOT NULL REFERENCES instanser(id),
  slug            TEXT NOT NULL,
  namn            TEXT NOT NULL,
  kortbeskrivning TEXT,
  beskrivning     TEXT,
  praktisk_info   TEXT,
  tips            TEXT,
  kategori_ids    TEXT DEFAULT '[]',
  taggar          TEXT DEFAULT '[]',
  sasong          TEXT DEFAULT '[]',
  svarighetsgrad  TEXT,
  lamplig_alder   TEXT,
  lamplig_for     TEXT DEFAULT '[]',
  tillganglighet  TEXT,
  lat             REAL,
  lng             REAL,
  avstand_fran_lodge_km  REAL,
  restid_min             INTEGER,
  transport              TEXT DEFAULT '[]',
  langd_km        REAL,
  hojdskillnad_m  INTEGER,
  hojdpunkt_m     INTEGER,
  omslagsbild_id  TEXT,
  extern_url      TEXT,
  extern_karta    TEXT,
  aktiv           INTEGER DEFAULT 1,
  verifierad      INTEGER DEFAULT 0,
  skapad_at       TEXT DEFAULT (datetime('now')),
  uppdaterad_at   TEXT DEFAULT (datetime('now')),
  UNIQUE(instans_id, slug)
);
CREATE INDEX IF NOT EXISTS idx_poi_instans ON poi(instans_id, aktiv);
CREATE INDEX IF NOT EXISTS idx_poi_svarighetsgrad ON poi(svarighetsgrad);
CREATE TABLE IF NOT EXISTS poi_punkter (
  id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  poi_id      TEXT NOT NULL REFERENCES poi(id) ON DELETE CASCADE,
  typ         TEXT NOT NULL,
  namn        TEXT,
  lat         REAL NOT NULL,
  lng         REAL NOT NULL,
  hojd_m      INTEGER,
  notering    TEXT,
  sortering   INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS poi_media (
  id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  poi_id          TEXT NOT NULL REFERENCES poi(id) ON DELETE CASCADE,
  typ             TEXT NOT NULL,
  storage_id      TEXT,
  extern_url      TEXT,
  namn            TEXT,
  alt_text        TEXT,
  caption         TEXT,
  fotograf        TEXT,
  licens          TEXT,
  filnamn         TEXT,
  filstorlek_kb   INTEGER,
  bredd_px        INTEGER,
  hojd_px         INTEGER,
  mime_type       TEXT,
  gpx_typ         TEXT,
  gpx_langd_km    REAL,
  gpx_hojdskillnad_m INTEGER,
  gpx_sasong      TEXT DEFAULT '[]',
  sortering       INTEGER DEFAULT 0,
  visa_i_lista    INTEGER DEFAULT 0,
  aktiv           INTEGER DEFAULT 1,
  skapad_at       TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_media_poi ON poi_media(poi_id, typ);
CREATE TABLE IF NOT EXISTS poi_oppettider (
  id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  poi_id      TEXT NOT NULL REFERENCES poi(id) ON DELETE CASCADE,
  sasong      TEXT,
  manad_fran  INTEGER,
  manad_till  INTEGER,
  info        TEXT,
  pris        TEXT
);
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
CREATE TABLE IF NOT EXISTS chatt_logg (
  id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  instans_id      TEXT REFERENCES instanser(id),
  session_id      TEXT,
  fraga           TEXT NOT NULL,
  svar            TEXT,
  poi_ids_visade  TEXT DEFAULT '[]',
  sprak           TEXT DEFAULT 'sv',
  skapad_at       TEXT DEFAULT (datetime('now'))
);
