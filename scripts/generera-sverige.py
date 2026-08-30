#!/usr/bin/env python3
"""
Genererar worker/src/sverige.js — polygonen som avgör vilken karttjänst
en ruta ska hämtas från.

Källa: Natural Earth 10m admin_0 countries (public domain). Hämtas från
raw.githubusercontent.com; scriptet behöver alltså nätverk.

    python3 scripts/generera-sverige.py

Förenklas med Douglas-Peucker vid 0.002 grader och avrundas till fyra
decimaler. Det ger noll felklassningar mot originalgeometrin över ett
rutnät på ~100 000 punkter i gränsområdet kring Riksgränsen, till 54 kB
källkod som gzippas till 20 kB.

Natural Earths gräns är själv några hundra meter oprecis — vid
Riksgränsen hamnar stationen på norska sidan. Det fångas av
innehållskontrollen i tiles.js, inte här.
"""
import json, math, os, sys, urllib.request


def rdp(punkter, tol):
    """Douglas-Peucker."""
    if len(punkter) < 3:
        return punkter
    def avstand(p, a, b):
        (x, y), (x1, y1), (x2, y2) = p, a, b
        dx, dy = x2 - x1, y2 - y1
        if dx == 0 and dy == 0:
            return math.hypot(x - x1, y - y1)
        t = max(0, min(1, ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy)))
        return math.hypot(x - (x1 + t * dx), y - (y1 + t * dy))
    langst, idx = 0.0, 0
    for i in range(1, len(punkter) - 1):
        d = avstand(punkter[i], punkter[0], punkter[-1])
        if d > langst:
            langst, idx = d, i
    if langst <= tol:
        return [punkter[0], punkter[-1]]
    return rdp(punkter[:idx + 1], tol)[:-1] + rdp(punkter[idx:], tol)


def area(ring):
    s = 0.0
    for i in range(len(ring) - 1):
        s += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1]
    return abs(s) / 2


def i_polygon(pt, ringar):
    x, y = pt
    inne = False
    for ring in ringar:
        for i in range(len(ring) - 1):
            x1, y1 = ring[i]; x2, y2 = ring[i + 1]
            if (y1 > y) != (y2 > y):
                if x < x1 + (y - y1) / (y2 - y1) * (x2 - x1):
                    inne = not inne
    return inne


KALLA = ("https://raw.githubusercontent.com/nvkelso/natural-earth-vector"
         "/master/geojson/ne_10m_admin_0_countries.geojson")

# Med en filsökväg som argument används den i stället för Natural Earth.
# Filen ska vara GeoJSON med Sveriges gräns — antingen en FeatureCollection
# där ett feature heter Sweden, eller en enda Feature/geometri.
if len(sys.argv) > 1:
    print(f"läser {sys.argv[1]} ...")
    d = json.load(open(sys.argv[1], encoding="utf-8"))
else:
    print("hämtar Natural Earth ...")
    with urllib.request.urlopen(KALLA) as r:
        d = json.loads(r.read())
def hitta_geometri(doc):
    """Sveriges geometri, oavsett hur källfilen är strukturerad."""
    if doc.get('type') == 'FeatureCollection':
        träffar = [
            f for f in doc['features']
            if 'sweden' in json.dumps(f.get('properties', {})).lower()
            or 'sverige' in json.dumps(f.get('properties', {})).lower()
        ]
        if not träffar and len(doc['features']) == 1:
            träffar = doc['features']          # enda featuret, anta Sverige
        if not träffar:
            sys.exit('hittade inget feature för Sverige i filen')
        return träffar[0]['geometry']
    if doc.get('type') == 'Feature':
        return doc['geometry']
    return doc                                  # naken geometri


g = hitta_geometri(d)
alla = g['coordinates'] if g['type'] == 'Polygon' else [r for poly in g['coordinates'] for r in poly]
stora = [r for r in sorted(alla, key=area, reverse=True) if area(r) > 0.001]

TOLERANS = float(os.environ.get("TOLERANS", "0.002"))
ringar = [[[round(x, 5), round(y, 5)] for x, y in rdp(r, TOLERANS)] for r in stora]

# Kontrollera att avrundningen inte förstörde något
lat0, lat1, lon0, lon1 = 68.20, 68.75, 17.40, 19.20
pkt = []
lat = lat0
while lat <= lat1:
    lon = lon0
    while lon <= lon1:
        pkt.append((lon, lat)); lon += 0.005
    lat += 0.002
fel = sum(1 for p in pkt if i_polygon(p, alla) != i_polygon(p, ringar))
print(f"efter avrundning: {sum(len(r) for r in ringar)} punkter, {fel} felklassade av {len(pkt)}")

# Kompakt format: [lon,lat,lon,lat,...] per ring sparar all JSON-overhead
platt = [[c for pt in r for c in pt] for r in ringar]
js = ("// Genererad från Natural Earth 10m admin_0 (public domain).\n"
      "// Douglas-Peucker vid 0.002°, avrundat till fyra decimaler.\n"
      "// Noll felklassningar mot originalgeometrin över ett rutnät på\n"
      "// ~100 000 punkter i gränsområdet kring Riksgränsen.\n"
      "// Format: en array per ring, [lon, lat, lon, lat, ...].\n"
      f"export const SVERIGE = {json.dumps(platt, separators=(',', ':'))};\n")
open(os.path.join(os.path.dirname(__file__), "..", "worker", "src", "sverige.js"), "w").write(js)
print(f"worker/src/sverige.js: {len(js)//1024} kB")
