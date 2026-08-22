#!/usr/bin/env python3
"""
Skriver ut en SQL-fil utan kommentarer, för inklistring i D1-konsolen.

D1-konsolen i Cloudflares dashboard delar inklistrad SQL på semikolon
och kör varje bit som en egen query. Bitar som bara innehåller
kommentarer blir tomma och avvisas med
"Requests without any query are not supported".

Strippningen är strängmedveten: -- inuti en stränglitteral är data och
lämnas orört, till skillnad från en naiv radbaserad filtrering.

    ./scripts/sql-for-console.py schema/migrations/0001_schema.sql
"""
import sys


def strippa(sql: str) -> str:
    ut, i, n = [], 0, len(sql)
    i_strang = False
    while i < n:
        tecken = sql[i]
        if i_strang:
            ut.append(tecken)
            if tecken == "'":
                # '' är ett escapat apostrof, inte slut på strängen
                if i + 1 < n and sql[i + 1] == "'":
                    ut.append(sql[i + 1])
                    i += 2
                    continue
                i_strang = False
            i += 1
        elif tecken == "'":
            i_strang = True
            ut.append(tecken)
            i += 1
        elif sql.startswith('--', i):
            while i < n and sql[i] != '\n':
                i += 1
        else:
            ut.append(tecken)
            i += 1

    rader = [r.rstrip() for r in ''.join(ut).splitlines()]
    return '\n'.join(r for r in rader if r.strip()) + '\n'


if __name__ == '__main__':
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    sys.stdout.write(strippa(open(sys.argv[1], encoding='utf-8').read()))
