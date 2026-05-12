#!/usr/bin/env bash
# Mortgauger — VPS deploy helper.
#
# Architecture: each app on the VPS lives in its own ~/<app> directory with
# its own docker-compose. All apps join the shared `caddy_net` Docker
# network. A single edge Caddy (the dicegram-caddy container) terminates
# TLS and routes requests, reading per-site server blocks from
# /opt/caddy-sites/*.caddy. Each app owns its own snippet.
#
# This script:
#   1. Brings up the mortgauger container.
#   2. Copies caddy/mortgauger.caddy → /opt/caddy-sites/mortgauger.caddy.
#   3. Reloads the edge Caddy.
#
# First-time on the VPS: run the edge-migration command first (see README),
# then `git clone … && cd mortgauger && ./deploy.sh`.
#
# Subsequent updates:
#   cd ~/mortgauger && git pull && ./deploy.sh
#
# Flags:
#   --no-snippet   Skip copying the snippet / reloading edge Caddy
#                  (only refresh the app container).
#   --help, -h     Show this help.

set -euo pipefail
cd "$(dirname "$0")"

EDGE_CADDY_CONTAINER="${MORTGAUGER_EDGE_CADDY:-dicegram-caddy}"
SITES_DIR="${MORTGAUGER_SITES_DIR:-/opt/caddy-sites}"
SITE_NAME="mortgauger"
SOURCE_BLOCK="caddy/${SITE_NAME}.caddy"

skip_snippet=false
for arg in "$@"; do
  case "$arg" in
    --no-snippet) skip_snippet=true ;;
    --help|-h)
      sed -n '/^# Mortgauger/,/^$/p' "$0" | sed 's/^# \{0,1\}//'
      exit 0 ;;
    *) echo "Unknown arg: $arg" >&2; exit 1 ;;
  esac
done

log()  { printf '\033[1;34m→\033[0m %s\n' "$*"; }
ok()   { printf '\033[1;32m✓\033[0m %s\n' "$*"; }
fail() { printf '\033[1;31m✗\033[0m %s\n' "$*" >&2; exit 1; }

# ---- Pre-flight ----
command -v docker >/dev/null 2>&1 || fail "docker is not installed"
docker compose version >/dev/null 2>&1 || fail "docker compose plugin missing"

for f in index.html app.js calc.js data.js styles.css \
         caddy/site.Caddyfile caddy/mortgauger.caddy docker-compose.yml; do
  [[ -f "$f" ]] || fail "missing file in repo: $f"
done

docker network ls --format '{{.Name}}' | grep -qx caddy_net \
  || fail "Docker network 'caddy_net' not found — edge Caddy isn't running."

if [[ "$skip_snippet" != "true" ]]; then
  [[ -d "$SITES_DIR" ]] \
    || fail "$SITES_DIR doesn't exist — run the edge-migration first (see README)."
  docker inspect -f '{{.State.Running}}' "$EDGE_CADDY_CONTAINER" 2>/dev/null | grep -qx true \
    || fail "$EDGE_CADDY_CONTAINER is not running — start the edge stack first."
fi

# ---- Bring up the mortgauger container ----
log "docker compose up -d"
docker compose up -d

state=missing
for _ in $(seq 1 10); do
  state=$(docker inspect -f '{{.State.Status}}' "$SITE_NAME" 2>/dev/null || echo missing)
  [[ "$state" == "running" ]] && break
  sleep 1
done
[[ "$state" == "running" ]] || { docker compose logs --tail=30; fail "$SITE_NAME failed to start"; }
ok "$SITE_NAME container is running"

# ---- Install / refresh the edge snippet and reload ----
if [[ "$skip_snippet" == "true" ]]; then
  echo "  (--no-snippet: skipped edge-Caddy update)"
  exit 0
fi

log "writing snippet to $SITES_DIR/${SITE_NAME}.caddy"
sudo cp "$SOURCE_BLOCK" "$SITES_DIR/${SITE_NAME}.caddy"

log "validating edge Caddy config"
if ! docker exec "$EDGE_CADDY_CONTAINER" caddy validate --config /etc/caddy/Caddyfile >/dev/null 2>&1; then
  echo "✗ caddy validate failed — full output:" >&2
  docker exec "$EDGE_CADDY_CONTAINER" caddy validate --config /etc/caddy/Caddyfile >&2 || true
  fail "edge Caddy config invalid — snippet was written but reload skipped"
fi

log "reloading edge Caddy"
docker exec "$EDGE_CADDY_CONTAINER" caddy reload --config /etc/caddy/Caddyfile

ok "Done."
echo "  open:  https://mortgauger.desastreger.cloud"
