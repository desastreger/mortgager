#!/usr/bin/env bash
# Mortgauger — VPS deploy helper.
#
# Runs the mortgauger container (caddy:2-alpine serving this directory) on
# the existing `caddy_net` Docker network. The edge Caddy (dicegram-caddy)
# reverse-proxies https://mortgauger.desastreger.cloud → mortgauger:80.
#
# First-time setup on the VPS:
#   1. git clone https://github.com/desastreger/mortgauger.git ~/mortgauger
#   2. cd ~/mortgauger && ./deploy.sh --print-block
#      (copy the printed server block into /root/dicegram/Caddyfile,
#       alongside the other site blocks)
#   3. docker restart dicegram-caddy
#   4. ./deploy.sh
#
# Subsequent updates:
#   cd ~/mortgauger && git pull && ./deploy.sh
#
# (No Caddy edit needed after the first time. `docker compose up -d` is a
#  no-op if nothing changed; volume mounts pick up new files automatically.)

set -euo pipefail
cd "$(dirname "$0")"

print_block=false
for arg in "$@"; do
  case "$arg" in
    --print-block|--caddy)
      print_block=true ;;
    --help|-h)
      sed -n '/^# Mortgauger/,/^$/p' "$0" | sed 's/^# \{0,1\}//'
      exit 0 ;;
    *) echo "Unknown arg: $arg" >&2; exit 1 ;;
  esac
done

log()  { printf '\033[1;34m→\033[0m %s\n' "$*"; }
ok()   { printf '\033[1;32m✓\033[0m %s\n' "$*"; }
fail() { printf '\033[1;31m✗\033[0m %s\n' "$*" >&2; exit 1; }

# ---- Sanity ----
command -v docker >/dev/null 2>&1 || fail "docker is not installed"
docker compose version >/dev/null 2>&1 || fail "docker compose plugin missing"

for f in index.html app.js calc.js data.js styles.css \
         caddy/site.Caddyfile caddy/mortgauger.caddy docker-compose.yml; do
  [[ -f "$f" ]] || fail "missing file in repo: $f"
done

if ! docker network ls --format '{{.Name}}' | grep -qx caddy_net; then
  fail "Docker network 'caddy_net' not found.
   The dicegram-caddy stack must be running first
   (cd ~/dicegram && ./deploy.sh --caddy)."
fi

# ---- Optional: print the edge server block ----
if [[ "$print_block" == "true" ]]; then
  echo
  echo "──────────────────────────────────────────────────────────────────"
  echo "Paste the following into /root/dicegram/Caddyfile,"
  echo "alongside houses.desastreger.cloud and pb.desastreger.cloud:"
  echo "──────────────────────────────────────────────────────────────────"
  # Skip the leading comment block; keep just the actual Caddy directives.
  awk 'BEGIN{p=0} /^[^#[:space:]]/{p=1} p' caddy/mortgauger.caddy
  echo "──────────────────────────────────────────────────────────────────"
  echo "Then run:  docker restart dicegram-caddy"
  echo
fi

# ---- Bring up the container ----
log "docker compose up -d"
docker compose up -d

# Wait briefly for the container to be running, then sanity-check.
for _ in $(seq 1 10); do
  state=$(docker inspect -f '{{.State.Status}}' mortgauger 2>/dev/null || echo missing)
  [[ "$state" == "running" ]] && break
  sleep 1
done

if [[ "$state" != "running" ]]; then
  docker compose logs --tail=30 mortgauger >&2
  fail "mortgauger did not reach 'running' state"
fi

ok "mortgauger is running"
echo "  network: caddy_net"
echo "  open:    https://mortgauger.desastreger.cloud"
echo
echo "(If the URL doesn't resolve yet, you still need to paste the Caddy"
echo " block into /root/dicegram/Caddyfile and restart dicegram-caddy.)"
