#!/usr/bin/env bash
# Mortgauger — VPS deploy helper.
#
# Usage:
#   ./deploy.sh           Pull + report. Use after `git pull` to sanity-check.
#   ./deploy.sh --caddy   Render the Caddy server block, install it, reload.
#   ./deploy.sh --help    Show this help.
#
# Domain: set with the MORTGAUGER_DOMAIN env var, e.g.:
#   MORTGAUGER_DOMAIN=mortgauger.example.com ./deploy.sh --caddy
#
# Or edit DEFAULT_DOMAIN below once and forget about it.

set -euo pipefail

DEFAULT_DOMAIN="mortgauger.example.com"
DOMAIN="${MORTGAUGER_DOMAIN:-$DEFAULT_DOMAIN}"

REPO_DIR="$(cd "$(dirname "$0")" && pwd -P)"
CADDY_SNIPPET_DIR="/etc/caddy/Caddyfile.d"
CADDY_SNIPPET="$CADDY_SNIPPET_DIR/mortgauger.caddy"
CADDY_TEMPLATE="$REPO_DIR/caddy/mortgauger.caddy"

setup_caddy=false
for arg in "$@"; do
  case "$arg" in
    --caddy) setup_caddy=true ;;
    --help|-h)
      sed -n '2,15p' "$0" | sed 's/^# //; s/^#//'
      exit 0 ;;
    *) echo "Unknown arg: $arg" >&2; exit 1 ;;
  esac
done

# ---- Sanity ---------------------------------------------------------------

required=(index.html app.js calc.js data.js styles.css)
for f in "${required[@]}"; do
  [[ -f "$REPO_DIR/$f" ]] || { echo "missing: $REPO_DIR/$f" >&2; exit 1; }
done

if [[ -d "$REPO_DIR/.git" ]]; then
  branch=$(git -C "$REPO_DIR" rev-parse --abbrev-ref HEAD)
  short=$(git -C "$REPO_DIR" rev-parse --short HEAD)
  echo "Mortgauger · $branch @ $short"
else
  echo "Mortgauger · (not a git repo)"
fi
echo "  path:   $REPO_DIR"
echo "  domain: $DOMAIN"

# ---- Caddy ---------------------------------------------------------------

if [[ "$setup_caddy" != "true" ]]; then
  echo "Done. (no --caddy flag, so Caddy was not touched.)"
  exit 0
fi

if [[ ! -f "$CADDY_TEMPLATE" ]]; then
  echo "missing: $CADDY_TEMPLATE" >&2; exit 1
fi

# Render the template with envsubst-equivalent shell expansion.
rendered=$(DOMAIN="$DOMAIN" REPO_DIR="$REPO_DIR" \
  awk -v d="$DOMAIN" -v r="$REPO_DIR" \
    '{ gsub(/\{\$DOMAIN\}/, d); gsub(/\{\$REPO_DIR\}/, r); print }' \
    "$CADDY_TEMPLATE")

# Ensure the snippet directory exists.
if [[ ! -d "$CADDY_SNIPPET_DIR" ]]; then
  echo "  creating $CADDY_SNIPPET_DIR (needs sudo)"
  sudo mkdir -p "$CADDY_SNIPPET_DIR"
fi

echo "  writing $CADDY_SNIPPET"
echo "$rendered" | sudo tee "$CADDY_SNIPPET" > /dev/null

# Verify the main Caddyfile imports the snippet directory.
main_caddyfile="/etc/caddy/Caddyfile"
if [[ -f "$main_caddyfile" ]] && ! grep -qE "^\s*import\s+.*Caddyfile\.d" "$main_caddyfile"; then
  cat >&2 <<EOF

  ⚠  Heads up: /etc/caddy/Caddyfile does not appear to \`import\` the
     snippets directory. Add this line to it (once):

         import /etc/caddy/Caddyfile.d/*.caddy

     Then re-run ./deploy.sh --caddy.

EOF
fi

# Validate then reload.
if sudo caddy validate --config "$main_caddyfile" --adapter caddyfile > /dev/null 2>&1; then
  sudo systemctl reload caddy
  echo "  caddy reloaded"
else
  echo "  caddy validate failed — config NOT reloaded. Full output:" >&2
  sudo caddy validate --config "$main_caddyfile" --adapter caddyfile >&2 || true
  exit 1
fi

echo "Done. Open: https://$DOMAIN"
