# Mortgauger

A static, no-build UK mortgage scenario calculator.

Compare purchase mortgages side-by-side, or remortgage from a given year of an
existing scenario. Real lender rates (May 2026), capital repayment / interest-only /
offset / part-and-part, SDLT (England & NI), overpayments (fixed £ or %), and a
rate-shock stress test against the lender's revert SVR.

## Running locally

It's a static site — three options:

```sh
python -m http.server 8000
```

```sh
npx serve .
```

Or any static-file server. Open <http://localhost:8000>.

ES modules don't work over `file://` in browsers, so a server is required.

## Deploying to a VPS

Mortgauger runs as a small `caddy:2-alpine` container that joins the shared
`caddy_net` Docker network. A single edge Caddy on the VPS terminates TLS
and routes traffic, reading per-site server blocks from `/opt/caddy-sites/`.
Each app on the VPS owns its own snippet there — no cross-app coupling, no
manual Caddyfile edits.

### One-time VPS migration (decouple existing apps)

If the edge Caddy currently keeps every server block in one big Caddyfile
(e.g. `/root/dicegram/Caddyfile`), run the migration block in
[`docs/migrate-edge.sh`](docs/migrate-edge.sh) on the VPS once. It:

1. Creates `/opt/caddy-sites/`.
2. Splits the live Caddyfile into per-site snippets (dicegram.caddy,
   houses.caddy, pb.caddy).
3. Replaces the live Caddyfile with `import /etc/caddy/sites/*.caddy`.
4. Bind-mounts `/opt/caddy-sites/` into the edge Caddy container.
5. Recreates the container so the mount takes effect.

After that, every app deploys independently — including this one.

### First-time setup for mortgauger

```sh
git clone https://github.com/desastreger/mortgauger.git ~/mortgauger
cd ~/mortgauger && ./deploy.sh
```

`deploy.sh` brings up the mortgauger container, drops
`caddy/mortgauger.caddy` into `/opt/caddy-sites/mortgauger.caddy`, validates
the edge Caddy's full config, and `caddy reload`s it. Let's Encrypt
issues a TLS cert on first request.

### Subsequent updates

```sh
cd ~/mortgauger && git pull && ./deploy.sh
```

Static files are bind-mounted into the container read-only at `/srv`, so
`git pull` is usually enough on its own. Re-running `./deploy.sh` is the
safe path — it's idempotent.

### Files

- `docker-compose.yml` — mortgauger service definition (joins `caddy_net`).
- `caddy/site.Caddyfile` — runs *inside* the mortgauger container:
  `file_server`, cache headers, dotfile blocking.
- `caddy/mortgauger.caddy` — edge server block; deploy.sh installs it into
  `/opt/caddy-sites/mortgauger.caddy` and reloads the edge Caddy.
- `deploy.sh` — pre-flight checks, `docker compose up -d`, snippet install,
  edge reload.

## Project layout

```
index.html       markup
styles.css       editorial typography + 5-col instrument-panel layout
data.js          UK lender rates, SVRs, SDLT bands, BoE Bank Rate
calc.js          pure mortgage maths (amortisation, SDLT, overpayments)
app.js           UI, state, dashboard rendering, mode switch
```

## Modes

- **Purchase** — buyer's situation in a master block, scenarios per lender below.
- **Remortgage** — current property value + outstanding balance instead of deposit;
  no SDLT. Click `↦ Remortgage` on any purchase scenario to fast-forward to a
  specific year's balance (overpayments and rate path included).
