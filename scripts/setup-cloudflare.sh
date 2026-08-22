#!/usr/bin/env bash
#
# Sätter upp Cloudflare-resurserna för en WayLo-instans och skriver in
# id:n i respektive wrangler.toml. Idempotent — kan köras om.
#
#   ./scripts/setup-cloudflare.sh [instansnamn]
#
# Kräver: wrangler (npx wrangler) och en inloggad Cloudflare-session
# (`npx wrangler login`, eller CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID).

set -euo pipefail

INSTANS="${1:-waylo}"
DB_NAMN="$INSTANS"
BUCKET_NAMN="${INSTANS}-media"
KV_NAMN="${INSTANS}-cache"

ROT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
API_TOML="$ROT/workers/api/wrangler.toml"
TILES_TOML="$ROT/workers/tile-proxy/wrangler.toml"

WRANGLER="npx --yes wrangler@4"

info()  { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
varn()  { printf '\033[1;33m!!\033[0m %s\n' "$*" >&2; }

# --- 0. Kontrollera inloggning ---------------------------------------
info "Kontrollerar Cloudflare-inloggning"
if ! $WRANGLER whoami >/dev/null 2>&1; then
  varn "Inte inloggad. Kör 'npx wrangler login' eller sätt"
  varn "CLOUDFLARE_API_TOKEN och CLOUDFLARE_ACCOUNT_ID."
  exit 1
fi

# --- 1. D1-databas ---------------------------------------------------
info "D1-databas: $DB_NAMN"
DB_ID="$($WRANGLER d1 list --json 2>/dev/null \
  | grep -B2 "\"name\": \"$DB_NAMN\"" \
  | grep -oE '[0-9a-f-]{36}' | head -1 || true)"

if [ -z "$DB_ID" ]; then
  UT="$($WRANGLER d1 create "$DB_NAMN")"
  echo "$UT"
  DB_ID="$(echo "$UT" | grep -oE '[0-9a-f-]{36}' | head -1)"
fi
[ -n "$DB_ID" ] || { varn "Kunde inte hitta database_id"; exit 1; }
info "  database_id = $DB_ID"

# --- 2. KV-namespace -------------------------------------------------
info "KV-namespace: $KV_NAMN"
KV_ID="$($WRANGLER kv namespace list 2>/dev/null \
  | grep -B2 "\"title\": \".*$KV_NAMN\"" \
  | grep -oE '"id": "[0-9a-f]{32}"' | grep -oE '[0-9a-f]{32}' | head -1 || true)"

if [ -z "$KV_ID" ]; then
  UT="$($WRANGLER kv namespace create "$KV_NAMN")"
  echo "$UT"
  KV_ID="$(echo "$UT" | grep -oE '[0-9a-f]{32}' | head -1)"
fi
[ -n "$KV_ID" ] || { varn "Kunde inte hitta KV-id"; exit 1; }
info "  kv id = $KV_ID"

# --- 3. R2-bucket ----------------------------------------------------
info "R2-bucket: $BUCKET_NAMN"
$WRANGLER r2 bucket create "$BUCKET_NAMN" 2>&1 | grep -v "already exists" || true

# --- 4. Skriv in id:n i wrangler.toml --------------------------------
info "Uppdaterar wrangler.toml"
sed -i.bak -E "s|^database_id = \".*\"|database_id = \"$DB_ID\"|" "$API_TOML"
sed -i.bak -E "s|^database_name = \".*\"|database_name = \"$DB_NAMN\"|" "$API_TOML"
sed -i.bak -E "s|^bucket_name = \".*\"|bucket_name = \"$BUCKET_NAMN\"|" "$API_TOML"
sed -i.bak -E "s|^id = \".*\"|id = \"$KV_ID\"|" "$API_TOML"
sed -i.bak -E "s|^id = \".*\"|id = \"$KV_ID\"|" "$TILES_TOML"
rm -f "$API_TOML.bak" "$TILES_TOML.bak"

# --- 5. Schema + seed ------------------------------------------------
info "Kör migreringar mot $DB_NAMN"
(cd "$ROT/workers/api" && $WRANGLER d1 migrations apply DB --remote)

info "Kör seed-data för Arctic Lodge"
$WRANGLER d1 execute "$DB_NAMN" --remote --file="$ROT/schema/seed-arctic-lodge.sql" --yes

cat <<EOF

\033[1;32mKlart.\033[0m Resurserna finns och databasen är seedad.

Nästa steg:
  1. Lägg in hemligheterna (frågar efter värdet interaktivt):
       cd workers/api
       npx wrangler secret put ANTHROPIC_API_KEY

  2. Deploya:
       ./scripts/deploy.sh

EOF
