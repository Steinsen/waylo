#!/usr/bin/env python3
"""
Syr ihop Overpass "out geom" för en gränsrelation till slutna ringar.

Overpass returnerar relationens vägar som osorterade fragment, inte
färdiga polygoner. Det här kedjar ihop dem på matchande ändpunkter.

Hämta först relationen (Sverige = 52822):

    curl -G https://overpass-api.de/api/interpreter \
      --data-urlencode 'data=[out:json];rel(52822);out geom;' > sverige.json

    python3 scripts/osm-till-geojson.py sverige.json data/sweden-osm.geojson
    TOLERANS=0.0001 python3 scripts/generera-sverige.py data/sweden-osm.geojson
"""
import json, sys
from collections import defaultdict

def ringar_av(relation):
    bitar = []
    for m in relation.get('members', []):
        if m.get('role') not in ('outer', '') or 'geometry' not in m:
            continue
        p = [(round(g['lon'], 7), round(g['lat'], 7)) for g in m['geometry']]
        if len(p) > 1:
            bitar.append(p)

    # Indexera på ändpunkt så bitarna kan kedjas ihop
    slutna, oanvanda = [], list(bitar)
    while oanvanda:
        kedja = list(oanvanda.pop())
        vaxte = True
        while vaxte and kedja[0] != kedja[-1]:
            vaxte = False
            for i, b in enumerate(oanvanda):
                if b[0] == kedja[-1]:   kedja += b[1:];            oanvanda.pop(i); vaxte=True; break
                if b[-1] == kedja[-1]:  kedja += b[::-1][1:];      oanvanda.pop(i); vaxte=True; break
                if b[-1] == kedja[0]:   kedja = b[:-1] + kedja;    oanvanda.pop(i); vaxte=True; break
                if b[0] == kedja[0]:    kedja = b[::-1][:-1]+kedja;oanvanda.pop(i); vaxte=True; break
        if kedja[0] != kedja[-1]:
            kedja.append(kedja[0])      # tvinga sluten ring
        slutna.append([list(p) for p in kedja])
    return slutna

if __name__ == '__main__':
    d = json.load(open(sys.argv[1], encoding='utf-8'))
    rel = next(e for e in d['elements'] if e['type'] == 'relation')
    ringar = ringar_av(rel)
    ringar.sort(key=len, reverse=True)
    print(f"ringar: {len(ringar)}, punkter: {sum(len(r) for r in ringar)}", file=sys.stderr)
    print(f"största ringen: {len(ringar[0])} punkter", file=sys.stderr)
    ut = {"type": "Feature",
          "properties": {"NAME": "Sweden", "source": "OSM relation 52822"},
          "geometry": {"type": "MultiPolygon", "coordinates": [[r] for r in ringar]}}
    json.dump(ut, open(sys.argv[2], 'w'), separators=(',', ':'))
    print(f"skrev {sys.argv[2]}", file=sys.stderr)
