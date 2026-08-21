-- ============================================================
--  WayLo — Seed-data för instansen "Arctic Lodge Katterjokk"
--  Kör: wrangler d1 execute turistbot --file=schema/seed-arctic-lodge.sql
--  Kräver att schema/schema.sql körts först.
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


-- ============================================================
--  Fler POI:er — WayLo är inte bara en trailguide
-- ============================================================

-- Nattåget / Riksgränsen station
INSERT OR IGNORE INTO poi (
  id, instans_id, slug,
  namn, kortbeskrivning, beskrivning, praktisk_info, tips,
  kategori_ids, taggar, sasong,
  lamplig_for, tillganglighet,
  lat, lng,
  avstand_fran_lodge_km, restid_min, transport,
  extern_url
) VALUES (
  'poi-riksgransen-station',
  'inst-arctic-lodge',
  'riksgransen-station',
  '{"sv":"Riksgränsen station","en":"Riksgränsen railway station","no":"Riksgrensen stasjon"}',
  '{"sv":"Nattåget Stockholm–Narvik stannar 500 m från lodget","en":"The Stockholm–Narvik night train stops 500m from the lodge","no":"Nattoget Stockholm–Narvik stopper 500 m fra lodgen"}',
  '{"sv":"Malmbanan går genom Riksgränsen och nattåget från Stockholm stannar här. Sträckan Abisko–Narvik räknas som en av världens vackraste tågresor. Från stationen är det en kort promenad till Arctic Lodge.","en":"The Iron Ore Line runs through Riksgränsen and the night train from Stockholm stops here. The Abisko–Narvik stretch is one of the world''s most scenic rail journeys."}',
  '{"sv":"Ingen bemannad biljettförsäljning — köp biljett i förväg via SJ eller Vy. Perrongen är obevakad, ta med pannlampa vintertid.","en":"No staffed ticket office — buy tickets in advance via SJ or Vy. Unlit platform, bring a headlamp in winter."}',
  '{"sv":"Sitt på västra sidan av tåget mot Narvik — utsikten över Rombaksfjorden är oslagbar.","en":"Sit on the west side heading to Narvik for the Rombaksfjord view."}',
  '["kat-kultur"]',
  '["tåg","transport","nattåg","malmbanan","narvik","stockholm"]',
  '["sommar","vinter"]',
  '["familj","senior","nybörjare"]',
  'barnvagn',
  68.4297, 18.1256,
  0.5, 7, '["till fots"]',
  'https://www.sj.se'
);

-- Fjällstation / restaurang i Riksgränsen
INSERT OR IGNORE INTO poi (
  id, instans_id, slug,
  namn, kortbeskrivning, beskrivning, praktisk_info, tips,
  kategori_ids, taggar, sasong,
  lamplig_for, tillganglighet,
  lat, lng,
  avstand_fran_lodge_km, restid_min, transport
) VALUES (
  'poi-riksgransen-mat',
  'inst-arctic-lodge',
  'riksgransen-mat-och-service',
  '{"sv":"Riksgränsen — mat, butik och service","en":"Riksgränsen — food, shop and services","no":"Riksgrensen — mat og service"}',
  '{"sv":"Närmaste restauranger, sportbutik och livsmedel — knappt en kilometer bort","en":"Nearest restaurants, sports shop and groceries — less than a kilometre away"}',
  '{"sv":"I Riksgränsen finns restaurang, after ski, sportbutik med skiduthyrning och ett mindre livsmedelsutbud. Större matinköp gör du i Kiruna eller Narvik — planera inför självhushållet.","en":"Riksgränsen has a restaurant, après-ski, a sports shop with ski rental and a small grocery selection. Do bigger shopping in Kiruna or Narvik."}',
  '{"sv":"Öppettider varierar kraftigt med säsong — verksamheten är som mest igång februari–maj. Ring alltid i förväg utanför högsäsong.","en":"Opening hours vary a lot by season; peak operations are February–May. Always call ahead outside high season."}',
  '{"sv":"Systembolaget saknas — närmaste finns i Kiruna. Norska Narvik har större matbutiker och ligger 4 mil bort.","en":"No state liquor store here — nearest is in Kiruna. Narvik in Norway has larger supermarkets, 40km away."}',
  '["kat-mat"]',
  '["restaurang","butik","livsmedel","skiduthyrning","after ski","service"]',
  '["sommar","vinter"]',
  '["familj","senior","nybörjare","erfaren"]',
  'rullstol',
  68.4283, 18.1281,
  0.9, 10, '["till fots","bil"]'
);

-- Midnattssol vid Katterjåkk
INSERT OR IGNORE INTO poi (
  id, instans_id, slug,
  namn, kortbeskrivning, beskrivning, tips,
  kategori_ids, taggar, sasong,
  svarighetsgrad, lamplig_alder, lamplig_for,
  lat, lng,
  avstand_fran_lodge_km, restid_min, transport,
  langd_km, hojdskillnad_m
) VALUES (
  'poi-midnattssol-katterjokk',
  'inst-arctic-lodge',
  'midnattssol-katterjokk',
  '{"sv":"Midnattssol över Katterjåkk","en":"Midnight sun over Katterjokk","no":"Midnattssol over Katterjokk"}',
  '{"sv":"Kort kvällspromenad till utsiktsplatsen där solen aldrig går ner i juni","en":"A short evening walk to the viewpoint where the sun never sets in June"}',
  '{"sv":"Mellan slutet av maj och mitten av juli går solen aldrig under horisonten här. En dryg kilometers promenad från lodget når du en öppen platå med fri sikt norrut mot norska fjällen — den bästa platsen i närområdet för midnattssol.","en":"From late May to mid-July the sun never sets here. A short walk from the lodge takes you to an open plateau with clear views north to the Norwegian mountains."}',
  '{"sv":"Bäst mellan 23:00 och 01:00. Ta med varm jacka — det blir kyligt trots ljuset. Myggmedel i juli.","en":"Best between 23:00 and 01:00. Bring a warm jacket, and insect repellent in July."}',
  '["kat-utsikt","kat-vandring","kat-barn"]',
  '["midnattssol","utsikt","kväll","familj","fotografering"]',
  '["sommar"]',
  'lätt',
  '{"min":4,"max":null,"notering":"Kort och lätt — funkar bra med små barn"}',
  '["familj","senior","nybörjare"]',
  68.3612, 18.8102,
  1.2, 20, '["till fots"]',
  2.4, 90
);


-- ============================================================
--  GPS-punkter
-- ============================================================
INSERT OR IGNORE INTO poi_punkter (id, poi_id, typ, namn, lat, lng, hojd_m, sortering) VALUES
  ('pt-kungsleden-start',   'poi-kungsleden',        'start',     '{"sv":"Ledstart vid Katterjåkk","en":"Trailhead at Katterjokk"}',        68.3567, 18.7730, 520,  0),
  ('pt-kungsleden-park',    'poi-kungsleden',        'parkering', '{"sv":"Parkering Riksgränsen","en":"Riksgränsen parking"}',              68.4290, 18.1290, 508,  1),
  ('pt-topptur-start',      'poi-riksgransen-topp',  'start',     '{"sv":"Skidstart vid lodgets entré","en":"Ski start at the lodge door"}', 68.3567, 18.8234, 512,  0),
  ('pt-topptur-topp',       'poi-riksgransen-topp',  'topp',      '{"sv":"Toppen","en":"Summit"}',                                          68.4300, 18.1200, 909,  1),
  ('pt-midnattssol-utsikt', 'poi-midnattssol-katterjokk', 'topp', '{"sv":"Utsiktsplatån","en":"The viewpoint plateau"}',                    68.3612, 18.8102, 610,  0);


-- ============================================================
--  Öppettider & priser
-- ============================================================
INSERT OR IGNORE INTO poi_oppettider (id, poi_id, sasong, manad_fran, manad_till, info, pris) VALUES
  ('opp-kungsleden',  'poi-kungsleden',       'sommar', 6,  9,  '{"sv":"Leden är snöfri och framkomlig ca juni–september","en":"Trail is snow-free roughly June–September"}', '{"sv":"Gratis","SEK":0}'),
  ('opp-topptur',     'poi-riksgransen-topp', 'vinter', 12, 5,  '{"sv":"Bäst förhållanden mars–maj","en":"Best conditions March–May"}',                                    '{"sv":"Gratis","SEK":0}'),
  ('opp-mat-vinter',  'poi-riksgransen-mat',  'vinter', 2,  5,  '{"sv":"Full service under vintersäsongen","en":"Full service during the winter season"}',                  '{"sv":"Varierar","SEK":null}'),
  ('opp-mat-sommar',  'poi-riksgransen-mat',  'sommar', 6,  9,  '{"sv":"Begränsad service — ring i förväg","en":"Limited service — call ahead"}',                           '{"sv":"Varierar","SEK":null}'),
  ('opp-midnattssol', 'poi-midnattssol-katterjokk', 'sommar', 5, 7, '{"sv":"Midnattssol ca 26 maj–18 juli","en":"Midnight sun approx. 26 May–18 July"}',                    '{"sv":"Gratis","SEK":0}');
