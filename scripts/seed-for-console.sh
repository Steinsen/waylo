#!/usr/bin/env bash
#
# Skriver ut seed-filen utan kommentarer och tomrader, för att klistras
# in i D1-konsolen i Cloudflares dashboard.
#
# D1-konsolen delar upp inklistrad SQL på semikolon och kör varje bit
# som en egen query. Bitar som bara innehåller kommentarer blir tomma
# och avvisas med "Requests without any query are not supported".
#
#   ./scripts/seed-for-console.sh > /tmp/seed.sql
#
# Den genererade schema/seed-arctic-lodge.console.sql är resultatet av
# det här scriptet — kör om det när seed-filen ändrats.

set -euo pipefail
ROT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
KALLA="${1:-$ROT/schema/seed-arctic-lodge.sql}"

# Tar bort rader som börjar med -- och tomrader. Säkert här eftersom
# inga stränglitteraler i seeden inleder en rad med --.
sed -e 's/[[:space:]]*$//' "$KALLA" \
  | grep -v '^[[:space:]]*--' \
  | grep -v '^[[:space:]]*$'
