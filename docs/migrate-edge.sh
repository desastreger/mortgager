#!/usr/bin/env bash
# One-time VPS migration: decouple the edge Caddy from the dicegram repo.
#
# After this runs, each app on the VPS (dicegram, house-hunter, mortgauger,
# future) owns its own server block as a snippet in /opt/caddy-sites/, and
# the edge Caddy (still the dicegram-caddy container) just imports them all.
# No app's deploy script will ever touch another app's config again.
#
# Run as root or with sudo. Safe to re-run — every step is idempotent.

set -euo pipefail

DICEGRAM_DIR="/root/dicegram"
SITES_DIR="/opt/caddy-sites"
EDGE_CADDYFILE="$DICEGRAM_DIR/Caddyfile"
EDGE_COMPOSE="$DICEGRAM_DIR/docker-compose.yml"
EDGE_CONTAINER="dicegram-caddy"
STAMP=$(date +%Y%m%d-%H%M%S)

log()  { printf '\033[1;34m→\033[0m %s\n' "$*"; }
ok()   { printf '\033[1;32m✓\033[0m %s\n' "$*"; }
fail() { printf '\033[1;31m✗\033[0m %s\n' "$*" >&2; exit 1; }

[[ $EUID -eq 0 ]] || fail "run as root (or via sudo)"

# 0. Pre-flight
[[ -f "$EDGE_CADDYFILE" ]] || fail "missing $EDGE_CADDYFILE"
[[ -f "$EDGE_COMPOSE"   ]] || fail "missing $EDGE_COMPOSE"
docker inspect "$EDGE_CONTAINER" >/dev/null 2>&1 || fail "$EDGE_CONTAINER container not found"

# 1. Sites directory
mkdir -p "$SITES_DIR"
ok "$SITES_DIR exists"

# 2. Back up everything we're about to touch
BACKUP_DIR="/root/edge-migration-backup-$STAMP"
mkdir -p "$BACKUP_DIR"
cp "$EDGE_CADDYFILE" "$BACKUP_DIR/Caddyfile"
cp "$EDGE_COMPOSE"   "$BACKUP_DIR/docker-compose.yml"
ok "backups in $BACKUP_DIR"

# 3. Write per-site snippets (dicegram, houses, pb). Edit these later if
#    the live blocks have drifted from what's encoded below.

if [[ ! -f "$SITES_DIR/dicegram.caddy" ]]; then
cat > "$SITES_DIR/dicegram.caddy" <<'EOF'
dicegram.desastreger.cloud {
    encode zstd gzip

    reverse_proxy dicegram:8000 {
        header_up X-Real-IP {remote_host}
    }

    header {
        Strict-Transport-Security "max-age=31536000; includeSubDomains"
        X-Content-Type-Options "nosniff"
        X-Frame-Options "SAMEORIGIN"
        Referrer-Policy "strict-origin-when-cross-origin"
        Permissions-Policy "camera=(), microphone=(), geolocation=(), interest-cohort=()"
        Cross-Origin-Opener-Policy "same-origin"
        Content-Security-Policy "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'; font-src 'self' data:; frame-ancestors 'self'; base-uri 'self'; form-action 'self'"
        -Server
    }
}
EOF
ok "wrote $SITES_DIR/dicegram.caddy"
fi

if [[ ! -f "$SITES_DIR/houses.caddy" ]]; then
cat > "$SITES_DIR/houses.caddy" <<'EOF'
houses.desastreger.cloud {
    encode zstd gzip
    reverse_proxy house-hunter:80

    header {
        Strict-Transport-Security "max-age=31536000; includeSubDomains"
        X-Content-Type-Options "nosniff"
        X-Frame-Options "SAMEORIGIN"
        Referrer-Policy "strict-origin-when-cross-origin"
        Cross-Origin-Opener-Policy "same-origin"
        Content-Security-Policy "default-src 'self'; img-src 'self' data: blob: https://*.tile.openstreetmap.org; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self' https://nominatim.openstreetmap.org https://*.workers.dev https://pb.desastreger.cloud; font-src 'self'; frame-ancestors 'self'; base-uri 'self'; form-action 'self'"
        -Server
    }
}
EOF
ok "wrote $SITES_DIR/houses.caddy"
fi

if [[ ! -f "$SITES_DIR/pb.caddy" ]]; then
cat > "$SITES_DIR/pb.caddy" <<'EOF'
pb.desastreger.cloud {
    encode zstd gzip
    reverse_proxy pocketbase:8090
}
EOF
ok "wrote $SITES_DIR/pb.caddy"
fi

# 4. Replace the edge Caddyfile with a thin import-only version.
#    (Idempotent: if it already imports the sites dir, leave it alone.)
if ! grep -q '/etc/caddy/sites' "$EDGE_CADDYFILE"; then
cat > "$EDGE_CADDYFILE" <<'EOF'
# Edge Caddy — terminates TLS and routes. Each app owns its server block
# as a snippet in /etc/caddy/sites/ (host: /opt/caddy-sites/) and reloads
# this Caddy with: docker exec dicegram-caddy caddy reload --config /etc/caddy/Caddyfile

{
    email {$ACME_EMAIL:admin@example.com}
}

import /etc/caddy/sites/*.caddy
EOF
ok "rewrote $EDGE_CADDYFILE as import-only"
else
ok "$EDGE_CADDYFILE already imports — left alone"
fi

# 5. Patch the docker-compose to bind-mount /opt/caddy-sites into the
#    caddy service. Insert immediately after the Caddyfile mount line.
if ! grep -q '/opt/caddy-sites' "$EDGE_COMPOSE"; then
  sed -i '/- \.\/Caddyfile:\/etc\/caddy\/Caddyfile:ro/a\      - /opt/caddy-sites:/etc/caddy/sites:ro' "$EDGE_COMPOSE"
  ok "patched $EDGE_COMPOSE with sites mount"
  echo "    diff:"
  diff "$BACKUP_DIR/docker-compose.yml" "$EDGE_COMPOSE" || true
else
  ok "$EDGE_COMPOSE already mounts /opt/caddy-sites — left alone"
fi

# 6. Recreate the edge Caddy so the new volume mount and config take effect.
log "recreating $EDGE_CONTAINER"
cd "$DICEGRAM_DIR"
docker compose --profile caddy up -d --force-recreate caddy
sleep 2

# 7. Smoke-test the existing sites still respond.
log "smoke-testing existing sites"
for host in dicegram.desastreger.cloud houses.desastreger.cloud pb.desastreger.cloud; do
  code=$(curl -sk -o /dev/null -w '%{http_code}' "https://$host" || echo 000)
  printf '  %s  →  HTTP %s\n' "$host" "$code"
done

echo
ok "Migration done. From here on, each app installs its own snippet via its deploy.sh."
echo "  To roll back: cp $BACKUP_DIR/Caddyfile $EDGE_CADDYFILE && cp $BACKUP_DIR/docker-compose.yml $EDGE_COMPOSE && cd $DICEGRAM_DIR && docker compose --profile caddy up -d --force-recreate caddy"
