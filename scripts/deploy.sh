#!/usr/bin/env bash
#
# Deployar båda Workers och frontend till Cloudflare Pages.
#
#   ./scripts/deploy.sh [api|tiles|frontend]   (utan argument: allt)

set -euo pipefail

ROT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MAL="${1:-allt}"

info() { printf '\033[1;34m==>\033[0m %s\n' "$*"; }

deploy_api() {
  info "Deployar api-workern"
  cd "$ROT/workers/api"
  npm install --silent
  npx wrangler deploy
}

deploy_tiles() {
  info "Deployar tile-proxy"
  cd "$ROT/workers/tile-proxy"
  npm install --silent
  npx wrangler deploy
}

deploy_frontend() {
  info "Bygger och deployar frontend"
  cd "$ROT/frontend"
  npm install --silent
  npm run build
  npx wrangler pages deploy dist --project-name=turistbot
}

case "$MAL" in
  api)      deploy_api ;;
  tiles)    deploy_tiles ;;
  frontend) deploy_frontend ;;
  allt)     deploy_tiles; deploy_api; deploy_frontend ;;
  *)        echo "Okänt mål: $MAL (api|tiles|frontend)"; exit 1 ;;
esac

info "Klart."
